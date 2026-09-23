"""Business logic for tracked YouTube channels: resolving a pasted URL/
handle to a channel (no OAuth, public Data API only), syncing a channel's
videos/stats, and aggregating simple analytics across channels. Enqueueing
the initial/resync sync job is left to the route layer (matching
tasks.py/ranking.py's `queue_adapter` pattern) — this class only does the
DB + external-API work.
"""

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from ..config import get_config
from ..repositories.channel_repository import ChannelRepository
from ..retry_backoff import is_rate_limit_error, with_exponential_backoff
from ..youtube_utils import (
    ChannelResolutionError,
    async_fetch_channel_details,
    async_fetch_channel_recent_video_ids,
    async_fetch_videos_details,
    async_resolve_channel_identifier,
)

logger = logging.getLogger(__name__)


class ChannelAlreadyTrackedError(Exception):
    """Raised by add_channel when this user already tracks the resolved
    YouTube channel — carries the existing row so the route can return it
    alongside a 409."""

    def __init__(self, existing_channel: Dict[str, Any]):
        super().__init__("Channel is already tracked")
        self.existing_channel = existing_channel


class ChannelService:
    def __init__(self, db):
        self.db = db

    async def add_channel(self, user_id: str, raw_input: str) -> Dict[str, Any]:
        """Resolve + dedupe + insert. Does exactly one external call (the
        cheap-path channels.list, or occasionally search.list + a follow-up —
        see youtube_utils.resolve_channel_identifier) so the request returns
        fast; the row is inserted already populated from that response
        (title/thumbnail/counts), with sync_status='pending' meaning "videos
        and the first stats snapshot haven't been fetched yet," not "nothing
        is known." The caller enqueues sync_channel_job afterward.
        """
        raw_input = (raw_input or "").strip()
        if not raw_input:
            raise ValueError("Channel URL or handle is required")

        resolved = await with_exponential_backoff(
            lambda: async_resolve_channel_identifier(raw_input),
            retryable=is_rate_limit_error,
        )

        existing = await ChannelRepository.get_channel_by_youtube_id(
            self.db, user_id, resolved["youtube_channel_id"]
        )
        if existing:
            raise ChannelAlreadyTrackedError(existing)

        return await ChannelRepository.create_channel(
            self.db,
            user_id=user_id,
            youtube_channel_id=resolved["youtube_channel_id"],
            handle=resolved.get("handle"),
            title=resolved.get("title"),
            thumbnail_url=resolved.get("thumbnail_url"),
            uploads_playlist_id=resolved.get("uploads_playlist_id"),
            subscriber_count=resolved.get("subscriber_count"),
            view_count=resolved.get("view_count"),
            video_count=resolved.get("video_count"),
            added_input=raw_input,
        )

    async def sync_channel(self, channel_id: str) -> None:
        """Refresh one channel's details, most-recent-videos, and today's
        stats snapshot. Never raises — any failure (network, quota,
        deleted-upstream channel) is caught and persisted as
        sync_status='error' + sync_error, so a cron loop over many channels
        is naturally isolated per-channel with no extra guarding needed at
        the call site."""
        channel = await ChannelRepository.get_channel_by_id(self.db, channel_id)
        if not channel:
            return

        await ChannelRepository.update_sync_status(self.db, channel_id, "syncing")
        try:
            details = await with_exponential_backoff(
                lambda: async_fetch_channel_details(channel["youtube_channel_id"]),
                retryable=is_rate_limit_error,
            )
            await ChannelRepository.update_channel_details(
                self.db,
                channel_id,
                handle=details.get("handle"),
                title=details.get("title"),
                thumbnail_url=details.get("thumbnail_url"),
                uploads_playlist_id=details.get("uploads_playlist_id"),
                subscriber_count=details.get("subscriber_count"),
                view_count=details.get("view_count"),
                video_count=details.get("video_count"),
            )

            uploads_playlist_id = details.get("uploads_playlist_id")
            if uploads_playlist_id:
                max_videos = get_config().channel_sync_max_videos_per_channel
                video_ids = await with_exponential_backoff(
                    lambda: async_fetch_channel_recent_video_ids(
                        uploads_playlist_id, max_videos
                    ),
                    retryable=is_rate_limit_error,
                )
                if video_ids:
                    videos = await with_exponential_backoff(
                        lambda: async_fetch_videos_details(video_ids),
                        retryable=is_rate_limit_error,
                    )
                    await ChannelRepository.upsert_videos(self.db, channel_id, videos)

            await ChannelRepository.upsert_stats_snapshot(
                self.db,
                channel_id,
                date.today(),
                subscriber_count=details.get("subscriber_count"),
                view_count=details.get("view_count"),
                video_count=details.get("video_count"),
            )

            await ChannelRepository.update_sync_status(
                self.db, channel_id, "synced", touch_last_synced=True
            )
        except Exception as exc:
            logger.warning("Channel sync failed for %s: %s", channel_id, exc)
            await ChannelRepository.update_sync_status(
                self.db, channel_id, "error", sync_error=str(exc)[:1000]
            )

    async def poll_all_channels(self) -> Dict[str, int]:
        """Cron entrypoint: sync every tracked channel, across every user.
        sync_channel never raises, so this loop is self-isolating; the outer
        try/except is defense-in-depth against a genuinely unexpected bug
        (e.g. a DB connectivity blip) so one such failure can't abort the
        whole run either."""
        channels = await ChannelRepository.list_all_channels(self.db)
        synced = 0
        errored = 0
        for channel in channels:
            try:
                await self.sync_channel(channel["id"])
                refreshed = await ChannelRepository.get_channel_by_id(self.db, channel["id"])
                if refreshed and refreshed["sync_status"] == "error":
                    errored += 1
                else:
                    synced += 1
            except Exception:
                logger.exception("Unexpected failure syncing channel %s", channel.get("id"))
                errored += 1
        return {"synced": synced, "errored": errored}

    async def get_analytics(
        self, user_id: str, channel_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Stat totals + a 7-day views chart + a recent-videos table, built
        only from data the public Data API actually provides. Watch-time is
        explicitly unavailable (needs OAuth + the Analytics API) rather than
        faked; the 7-day chart and "subscribers gained" are both derived
        from our own daily channel_stats_snapshots history, which starts
        thin for a freshly-tracked channel and fills in over time."""
        all_channels = await ChannelRepository.list_channels_for_user(self.db, user_id)
        if channel_ids:
            allowed = {c["id"] for c in all_channels}
            selected_ids = [cid for cid in channel_ids if cid in allowed]
            channels = [c for c in all_channels if c["id"] in set(selected_ids)]
        else:
            channels = all_channels
            selected_ids = [c["id"] for c in channels]

        totals = {
            "views": sum(c.get("view_count") or 0 for c in channels),
            "subscribers": sum(c.get("subscriber_count") or 0 for c in channels),
            "videos": sum(c.get("video_count") or 0 for c in channels),
        }

        today = date.today()
        week_ago = today - timedelta(days=6)
        snapshots = await ChannelRepository.get_snapshots_for_channels(
            self.db, selected_ids, week_ago, today
        )
        views_by_date: Dict[date, int] = {}
        for snapshot in snapshots:
            snapshot_date = snapshot["snapshot_date"]
            views_by_date[snapshot_date] = views_by_date.get(snapshot_date, 0) + (
                snapshot.get("view_count") or 0
            )

        views_by_day = []
        previous_total: Optional[int] = None
        for offset in range(7):
            day = week_ago + timedelta(days=offset)
            day_total = views_by_date.get(day)
            delta = None
            if day_total is not None and previous_total is not None:
                delta = max(0, day_total - previous_total)
            views_by_day.append({"date": day.isoformat(), "views": delta})
            if day_total is not None:
                previous_total = day_total

        subscribers_gained: Optional[int] = None
        subscribers_gained_window = "since_tracked"
        if selected_ids:
            earliest_snapshots = []
            for channel_id in selected_ids:
                snapshot = await ChannelRepository.get_earliest_snapshot(self.db, channel_id)
                if snapshot is not None:
                    earliest_snapshots.append(snapshot)
            if earliest_snapshots:
                earliest_subs = sum(s.get("subscriber_count") or 0 for s in earliest_snapshots)
                subscribers_gained = totals["subscribers"] - earliest_subs
                if len(earliest_snapshots) == len(selected_ids) and all(
                    s["snapshot_date"] <= week_ago for s in earliest_snapshots
                ):
                    subscribers_gained_window = "7_days"

        recent_videos = await ChannelRepository.get_videos_for_channels(
            self.db, selected_ids, limit=25
        )

        return {
            "channels": channels,
            "totals": totals,
            "watch_time_minutes": None,
            "watch_time_available": False,
            "subscribers_gained": subscribers_gained,
            "subscribers_gained_window": subscribers_gained_window,
            "views_by_day": views_by_day,
            "recent_videos": recent_videos,
        }
