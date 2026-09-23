"""Repository for tracked YouTube channels and their synced videos/stats
history (channels / channel_videos / channel_stats_snapshots) — see
migrations/sql/20260923_0001_channels_publish_scheduling.sql for the schema
rationale. One class covers all three tables, mirroring
RankingFolderRepository's combined folder+clips shape: channels are the
"externally-populated pool synced over time" here, same as ranking folders
are for uploaded clips.
"""

from datetime import date
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ChannelRepository:
    """Repository for channels / channel_videos / channel_stats_snapshots."""

    # --- channels -----------------------------------------------------

    @staticmethod
    async def create_channel(
        db: AsyncSession,
        *,
        user_id: str,
        youtube_channel_id: str,
        handle: Optional[str],
        title: Optional[str],
        thumbnail_url: Optional[str],
        uploads_playlist_id: Optional[str],
        subscriber_count: Optional[int],
        view_count: Optional[int],
        video_count: Optional[int],
        added_input: str,
    ) -> Dict[str, Any]:
        channel_id = str(uuid4())
        await db.execute(
            text(
                """
                INSERT INTO channels (
                    id, user_id, youtube_channel_id, handle, title, thumbnail_url,
                    uploads_playlist_id, subscriber_count, view_count, video_count,
                    added_input, sync_status
                ) VALUES (
                    :id, :user_id, :youtube_channel_id, :handle, :title, :thumbnail_url,
                    :uploads_playlist_id, :subscriber_count, :view_count, :video_count,
                    :added_input, 'pending'
                )
                """
            ),
            {
                "id": channel_id,
                "user_id": user_id,
                "youtube_channel_id": youtube_channel_id,
                "handle": handle,
                "title": title,
                "thumbnail_url": thumbnail_url,
                "uploads_playlist_id": uploads_playlist_id,
                "subscriber_count": subscriber_count,
                "view_count": view_count,
                "video_count": video_count,
                "added_input": added_input,
            },
        )
        await db.commit()
        channel = await ChannelRepository.get_channel_by_id(db, channel_id)
        assert channel is not None
        return channel

    @staticmethod
    async def get_channel_by_id(db: AsyncSession, channel_id: str) -> Optional[Dict[str, Any]]:
        result = await db.execute(
            text("SELECT * FROM channels WHERE id = :id"), {"id": channel_id}
        )
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_channel_by_youtube_id(
        db: AsyncSession, user_id: str, youtube_channel_id: str
    ) -> Optional[Dict[str, Any]]:
        result = await db.execute(
            text(
                "SELECT * FROM channels WHERE user_id = :user_id AND youtube_channel_id = :youtube_channel_id"
            ),
            {"user_id": user_id, "youtube_channel_id": youtube_channel_id},
        )
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_channels_for_user(db: AsyncSession, user_id: str) -> List[Dict[str, Any]]:
        result = await db.execute(
            text("SELECT * FROM channels WHERE user_id = :user_id ORDER BY created_at DESC"),
            {"user_id": user_id},
        )
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def list_all_channels(db: AsyncSession) -> List[Dict[str, Any]]:
        """Every tracked channel, across every user — the cron poll's
        iteration source."""
        result = await db.execute(text("SELECT * FROM channels ORDER BY created_at ASC"))
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def update_sync_status(
        db: AsyncSession,
        channel_id: str,
        sync_status: str,
        *,
        sync_error: Optional[str] = None,
        touch_last_synced: bool = False,
    ) -> None:
        sets = ["sync_status = :sync_status", "sync_error = :sync_error", "updated_at = NOW()"]
        params: Dict[str, Any] = {
            "id": channel_id,
            "sync_status": sync_status,
            "sync_error": sync_error,
        }
        if touch_last_synced:
            sets.append("last_synced_at = NOW()")
        await db.execute(
            text(f"UPDATE channels SET {', '.join(sets)} WHERE id = :id"), params
        )
        await db.commit()

    @staticmethod
    async def update_channel_details(
        db: AsyncSession,
        channel_id: str,
        *,
        handle: Optional[str],
        title: Optional[str],
        thumbnail_url: Optional[str],
        uploads_playlist_id: Optional[str],
        subscriber_count: Optional[int],
        view_count: Optional[int],
        video_count: Optional[int],
    ) -> None:
        await db.execute(
            text(
                """
                UPDATE channels
                SET handle = :handle,
                    title = :title,
                    thumbnail_url = :thumbnail_url,
                    uploads_playlist_id = :uploads_playlist_id,
                    subscriber_count = :subscriber_count,
                    view_count = :view_count,
                    video_count = :video_count,
                    updated_at = NOW()
                WHERE id = :id
                """
            ),
            {
                "id": channel_id,
                "handle": handle,
                "title": title,
                "thumbnail_url": thumbnail_url,
                "uploads_playlist_id": uploads_playlist_id,
                "subscriber_count": subscriber_count,
                "view_count": view_count,
                "video_count": video_count,
            },
        )
        await db.commit()

    @staticmethod
    async def delete_channel(db: AsyncSession, channel_id: str, user_id: str) -> bool:
        result = await db.execute(
            text("DELETE FROM channels WHERE id = :id AND user_id = :user_id"),
            {"id": channel_id, "user_id": user_id},
        )
        await db.commit()
        return result.rowcount > 0

    # --- channel_videos -------------------------------------------------

    @staticmethod
    async def upsert_videos(db: AsyncSession, channel_id: str, videos: List[Dict[str, Any]]) -> None:
        """Insert-or-update by (channel_id, youtube_video_id). Never prunes —
        a video that ages out of the "most recent N" fetch window on a later
        sync stays in the table, preserving history instead of silently
        losing rows."""
        if not videos:
            return
        for video in videos:
            await db.execute(
                text(
                    """
                    INSERT INTO channel_videos (
                        id, channel_id, youtube_video_id, title, description, thumbnail_url,
                        published_at, duration_seconds, view_count, like_count, comment_count
                    ) VALUES (
                        :id, :channel_id, :youtube_video_id, :title, :description, :thumbnail_url,
                        :published_at, :duration_seconds, :view_count, :like_count, :comment_count
                    )
                    ON CONFLICT (channel_id, youtube_video_id) DO UPDATE SET
                        title = EXCLUDED.title,
                        description = EXCLUDED.description,
                        thumbnail_url = EXCLUDED.thumbnail_url,
                        published_at = EXCLUDED.published_at,
                        duration_seconds = EXCLUDED.duration_seconds,
                        view_count = EXCLUDED.view_count,
                        like_count = EXCLUDED.like_count,
                        comment_count = EXCLUDED.comment_count,
                        updated_at = NOW()
                    """
                ),
                {
                    "id": str(uuid4()),
                    "channel_id": channel_id,
                    "youtube_video_id": video["youtube_video_id"],
                    "title": video.get("title"),
                    "description": video.get("description"),
                    "thumbnail_url": video.get("thumbnail_url"),
                    "published_at": video.get("published_at"),
                    "duration_seconds": video.get("duration_seconds"),
                    "view_count": video.get("view_count"),
                    "like_count": video.get("like_count"),
                    "comment_count": video.get("comment_count"),
                },
            )
        await db.commit()

    @staticmethod
    async def get_videos_for_channel(
        db: AsyncSession, channel_id: str, limit: int = 50
    ) -> List[Dict[str, Any]]:
        result = await db.execute(
            text(
                """
                SELECT * FROM channel_videos
                WHERE channel_id = :channel_id
                ORDER BY published_at DESC NULLS LAST
                LIMIT :limit
                """
            ),
            {"channel_id": channel_id, "limit": limit},
        )
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_videos_for_channels(
        db: AsyncSession, channel_ids: List[str], limit: int = 50
    ) -> List[Dict[str, Any]]:
        if not channel_ids:
            return []
        result = await db.execute(
            text(
                """
                SELECT * FROM channel_videos
                WHERE channel_id = ANY(CAST(:channel_ids AS text[]))
                ORDER BY published_at DESC NULLS LAST
                LIMIT :limit
                """
            ),
            {"channel_ids": channel_ids, "limit": limit},
        )
        return [dict(row._mapping) for row in result.fetchall()]

    # --- channel_stats_snapshots -----------------------------------------

    @staticmethod
    async def upsert_stats_snapshot(
        db: AsyncSession,
        channel_id: str,
        snapshot_date: date,
        *,
        subscriber_count: Optional[int],
        view_count: Optional[int],
        video_count: Optional[int],
    ) -> None:
        await db.execute(
            text(
                """
                INSERT INTO channel_stats_snapshots (
                    id, channel_id, snapshot_date, subscriber_count, view_count, video_count
                ) VALUES (
                    :id, :channel_id, :snapshot_date, :subscriber_count, :view_count, :video_count
                )
                ON CONFLICT (channel_id, snapshot_date) DO UPDATE SET
                    subscriber_count = EXCLUDED.subscriber_count,
                    view_count = EXCLUDED.view_count,
                    video_count = EXCLUDED.video_count
                """
            ),
            {
                "id": str(uuid4()),
                "channel_id": channel_id,
                "snapshot_date": snapshot_date,
                "subscriber_count": subscriber_count,
                "view_count": view_count,
                "video_count": video_count,
            },
        )
        await db.commit()

    @staticmethod
    async def get_snapshots_for_channels(
        db: AsyncSession, channel_ids: List[str], start_date: date, end_date: date
    ) -> List[Dict[str, Any]]:
        if not channel_ids:
            return []
        result = await db.execute(
            text(
                """
                SELECT * FROM channel_stats_snapshots
                WHERE channel_id = ANY(CAST(:channel_ids AS text[]))
                  AND snapshot_date BETWEEN :start_date AND :end_date
                ORDER BY snapshot_date ASC
                """
            ),
            {"channel_ids": channel_ids, "start_date": start_date, "end_date": end_date},
        )
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_earliest_snapshot(db: AsyncSession, channel_id: str) -> Optional[Dict[str, Any]]:
        result = await db.execute(
            text(
                """
                SELECT * FROM channel_stats_snapshots
                WHERE channel_id = :channel_id
                ORDER BY snapshot_date ASC
                LIMIT 1
                """
            ),
            {"channel_id": channel_id},
        )
        row = result.fetchone()
        return dict(row._mapping) if row else None
