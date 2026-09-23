"""Repository for per-clip publish scheduling (clip_publish_schedules /
clip_publish_targets) — see migrations/sql/20260923_0001_channels_publish_scheduling.sql.
One schedule row per clip (a single date/title/description/tags/visibility
plan), fanned out to any number of tracked channels via clip_publish_targets,
a lean join table with no per-channel status yet since no real upload
pipeline exists (that's a later, OAuth-gated phase).
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_SCHEDULE_UPDATABLE_FIELDS = {"scheduled_at", "title", "description", "tags", "visibility"}

_SELECT_WITH_TARGETS = """
    SELECT s.*,
           COALESCE(array_agg(t.channel_id) FILTER (WHERE t.channel_id IS NOT NULL), ARRAY[]::text[]) AS channel_ids
    FROM clip_publish_schedules s
    LEFT JOIN clip_publish_targets t ON t.schedule_id = s.id
"""


class PublishScheduleRepository:
    """Repository for clip_publish_schedules / clip_publish_targets."""

    @staticmethod
    async def get_schedule_by_clip_id(db: AsyncSession, clip_id: str) -> Optional[Dict[str, Any]]:
        result = await db.execute(
            text(f"{_SELECT_WITH_TARGETS} WHERE s.clip_id = :clip_id GROUP BY s.id"),
            {"clip_id": clip_id},
        )
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_schedules_by_clip_ids(
        db: AsyncSession, clip_ids: List[str]
    ) -> List[Dict[str, Any]]:
        if not clip_ids:
            return []
        result = await db.execute(
            text(
                f"{_SELECT_WITH_TARGETS} WHERE s.clip_id = ANY(CAST(:clip_ids AS text[])) GROUP BY s.id"
            ),
            {"clip_ids": clip_ids},
        )
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create_schedule(
        db: AsyncSession,
        *,
        clip_id: str,
        user_id: str,
        scheduled_at: Optional[datetime] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[str] = None,
        visibility: str = "private",
    ) -> str:
        schedule_id = str(uuid4())
        await db.execute(
            text(
                """
                INSERT INTO clip_publish_schedules (
                    id, clip_id, user_id, scheduled_at, title, description, tags, visibility
                ) VALUES (
                    :id, :clip_id, :user_id, :scheduled_at, :title, :description, :tags, :visibility
                )
                """
            ),
            {
                "id": schedule_id,
                "clip_id": clip_id,
                "user_id": user_id,
                "scheduled_at": scheduled_at,
                "title": title,
                "description": description,
                "tags": tags,
                "visibility": visibility,
            },
        )
        await db.commit()
        return schedule_id

    @staticmethod
    async def update_schedule_fields(
        db: AsyncSession, schedule_id: str, fields: Dict[str, Any]
    ) -> None:
        """Dynamic partial update — `fields` is filtered to a fixed allowlist
        before being spliced into the SET clause, same idiom as
        batch_queue_repository.update_item_status."""
        fields = {k: v for k, v in fields.items() if k in _SCHEDULE_UPDATABLE_FIELDS}
        if not fields:
            return
        sets = [f"{key} = :{key}" for key in fields] + ["updated_at = NOW()"]
        params: Dict[str, Any] = {"id": schedule_id, **fields}
        await db.execute(
            text(f"UPDATE clip_publish_schedules SET {', '.join(sets)} WHERE id = :id"),
            params,
        )
        await db.commit()

    @staticmethod
    async def replace_targets(db: AsyncSession, schedule_id: str, channel_ids: List[str]) -> None:
        """Delete-all-then-insert the given channel set — the frontend
        already holds full per-clip toggle state, so a full replace on every
        PATCH is simpler than incremental add/remove endpoints."""
        await db.execute(
            text("DELETE FROM clip_publish_targets WHERE schedule_id = :schedule_id"),
            {"schedule_id": schedule_id},
        )
        for channel_id in dict.fromkeys(channel_ids):
            await db.execute(
                text(
                    "INSERT INTO clip_publish_targets (id, schedule_id, channel_id) "
                    "VALUES (:id, :schedule_id, :channel_id)"
                ),
                {"id": str(uuid4()), "schedule_id": schedule_id, "channel_id": channel_id},
            )
        await db.commit()

    @staticmethod
    async def recompute_status(db: AsyncSession, schedule_id: str) -> None:
        """status is always server-computed, never client-settable: 'scheduled'
        once a date is set AND at least one channel target exists, else
        'draft'."""
        await db.execute(
            text(
                """
                UPDATE clip_publish_schedules s
                SET status = CASE
                        WHEN s.scheduled_at IS NOT NULL
                             AND EXISTS (SELECT 1 FROM clip_publish_targets t WHERE t.schedule_id = s.id)
                        THEN 'scheduled'
                        ELSE 'draft'
                    END,
                    updated_at = NOW()
                WHERE s.id = :id
                """
            ),
            {"id": schedule_id},
        )
        await db.commit()

    @staticmethod
    async def delete_schedule_by_clip_id(db: AsyncSession, clip_id: str, user_id: str) -> bool:
        result = await db.execute(
            text(
                "DELETE FROM clip_publish_schedules WHERE clip_id = :clip_id AND user_id = :user_id"
            ),
            {"clip_id": clip_id, "user_id": user_id},
        )
        await db.commit()
        return result.rowcount > 0

    @staticmethod
    async def list_in_range(
        db: AsyncSession, user_id: str, start_date: date, end_date_exclusive: date
    ) -> List[Dict[str, Any]]:
        """Scheduled (not draft) clips whose scheduled_at falls in
        [start_date, end_date_exclusive) — caller passes the day AFTER the
        last day it wants included."""
        result = await db.execute(
            text(
                f"""
                {_SELECT_WITH_TARGETS}
                WHERE s.user_id = :user_id
                  AND s.status = 'scheduled'
                  AND s.scheduled_at >= :start_date
                  AND s.scheduled_at < :end_date_exclusive
                GROUP BY s.id
                ORDER BY s.scheduled_at ASC
                """
            ),
            {"user_id": user_id, "start_date": start_date, "end_date_exclusive": end_date_exclusive},
        )
        return [dict(row._mapping) for row in result.fetchall()]
