"""Business logic for per-clip publish scheduling: ownership resolution
(clip -> task -> user, reused across every endpoint), seeding a new
schedule's metadata from the clip's existing AI-generated metadata, and
applying partial updates with a server-computed status. No real upload
happens here — see clip_publish_schedules' migration comment for why
status only has draft/scheduled.
"""

import json
from datetime import date
from typing import Any, Dict, List, Optional

from ..repositories.channel_repository import ChannelRepository
from ..repositories.clip_repository import ClipRepository
from ..repositories.publish_schedule_repository import PublishScheduleRepository
from ..repositories.task_repository import TaskRepository

_VALID_VISIBILITY = {"public", "unlisted", "private"}


class ClipNotFoundError(Exception):
    """The clip doesn't exist, or doesn't belong to the requesting user."""


class InvalidChannelError(Exception):
    """A channel_id in the request doesn't belong to the requesting user."""


class PublishService:
    def __init__(self, db):
        self.db = db

    async def _get_owned_clip(self, clip_id: str, user_id: str) -> Dict[str, Any]:
        clip = await ClipRepository.get_clip_by_id(self.db, clip_id)
        if not clip:
            raise ClipNotFoundError(f"Clip {clip_id} not found")
        task = await TaskRepository.get_task_by_id(self.db, clip["task_id"])
        if not task or task["user_id"] != user_id:
            raise ClipNotFoundError(f"Clip {clip_id} not found")
        return clip

    async def get_schedules_for_clips(
        self, clip_ids: List[str], user_id: str
    ) -> List[Dict[str, Any]]:
        schedules = await PublishScheduleRepository.get_schedules_by_clip_ids(self.db, clip_ids)
        return [schedule for schedule in schedules if schedule["user_id"] == user_id]

    async def get_or_create_schedule(self, clip_id: str, user_id: str) -> Dict[str, Any]:
        """Ownership-checked. On first call, seeds title/description/tags
        from the clip's existing metadata_title/metadata_description/
        metadata_tags — the natural pre-fill for a "Video details" editor."""
        clip = await self._get_owned_clip(clip_id, user_id)
        existing = await PublishScheduleRepository.get_schedule_by_clip_id(self.db, clip_id)
        if existing:
            return existing

        title = clip.get("metadata_title") or clip.get("hook_title") or None
        tags = clip.get("metadata_tags") or []
        await PublishScheduleRepository.create_schedule(
            self.db,
            clip_id=clip_id,
            user_id=user_id,
            title=title[:100] if title else None,
            description=clip.get("metadata_description"),
            tags=json.dumps(tags) if tags else None,
        )
        created = await PublishScheduleRepository.get_schedule_by_clip_id(self.db, clip_id)
        assert created is not None
        return created

    async def update_schedule(
        self, clip_id: str, user_id: str, updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """`updates` is the route's `payload.model_dump(exclude_unset=True)`
        — only explicitly-provided fields are touched, so a client can
        clear scheduled_at with an explicit null without disturbing
        anything else. status is always recomputed server-side afterward,
        never taken from the payload."""
        await self._get_owned_clip(clip_id, user_id)
        existing = await PublishScheduleRepository.get_schedule_by_clip_id(self.db, clip_id)
        if not existing:
            await self.get_or_create_schedule(clip_id, user_id)
            existing = await PublishScheduleRepository.get_schedule_by_clip_id(self.db, clip_id)
        schedule_id = existing["id"]

        if "channel_ids" in updates:
            channel_ids = updates.pop("channel_ids") or []
            owned_channels = await ChannelRepository.list_channels_for_user(self.db, user_id)
            owned_ids = {channel["id"] for channel in owned_channels}
            invalid = [cid for cid in channel_ids if cid not in owned_ids]
            if invalid:
                raise InvalidChannelError(f"Channel(s) not found: {', '.join(invalid)}")
            await PublishScheduleRepository.replace_targets(self.db, schedule_id, channel_ids)

        field_updates: Dict[str, Any] = {}
        if "scheduled_at" in updates:
            field_updates["scheduled_at"] = updates.pop("scheduled_at")
        if "title" in updates:
            title = updates.pop("title")
            field_updates["title"] = title[:100] if title else title
        if "description" in updates:
            field_updates["description"] = updates.pop("description")
        if "tags" in updates:
            tags = updates.pop("tags")
            field_updates["tags"] = json.dumps(tags) if tags else None
        if "visibility" in updates:
            visibility = updates.pop("visibility")
            if visibility not in _VALID_VISIBILITY:
                raise ValueError(f"Invalid visibility: {visibility}")
            field_updates["visibility"] = visibility

        if field_updates:
            await PublishScheduleRepository.update_schedule_fields(
                self.db, schedule_id, field_updates
            )

        await PublishScheduleRepository.recompute_status(self.db, schedule_id)

        refreshed = await PublishScheduleRepository.get_schedule_by_clip_id(self.db, clip_id)
        assert refreshed is not None
        return refreshed

    async def delete_schedule(self, clip_id: str, user_id: str) -> bool:
        await self._get_owned_clip(clip_id, user_id)
        return await PublishScheduleRepository.delete_schedule_by_clip_id(
            self.db, clip_id, user_id
        )

    async def list_calendar(
        self, user_id: str, start_date: date, end_date_exclusive: date
    ) -> List[Dict[str, Any]]:
        return await PublishScheduleRepository.list_in_range(
            self.db, user_id, start_date, end_date_exclusive
        )
