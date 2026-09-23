"""Publish scheduling API routes — assign generated clips to tracked
channels with a date/title/description/tags/visibility plan. PublishService
owns ownership checks and the actual read/write logic; no real upload
happens yet (see clip_publish_schedules' migration comment for why).
"""

import logging
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import resolve_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...services.publish_service import (
    ClipNotFoundError,
    InvalidChannelError,
    PublishService,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/publish", tags=["publish"])


async def _get_user_id(request: Request, db: AsyncSession) -> str:
    return await resolve_authenticated_user_id(request, db, get_config())


@router.get("/schedules")
async def get_schedules(
    request: Request,
    db: AsyncSession = Depends(get_db),
    clip_ids: str = "",
):
    """Schedules for a set of clips — a clip with no row is simply absent,
    the frontend treats that as "unscheduled"."""
    user_id = await _get_user_id(request, db)
    ids = [cid.strip() for cid in clip_ids.split(",") if cid.strip()]
    if not ids:
        return {"schedules": []}
    schedules = await PublishService(db).get_schedules_for_clips(ids, user_id)
    return {"schedules": schedules}


class UpdateSchedulePayload(BaseModel):
    channel_ids: Optional[List[str]] = None
    scheduled_at: Optional[datetime] = None
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    visibility: Optional[str] = None


@router.patch("/clips/{clip_id}/schedule")
async def update_schedule(
    clip_id: str,
    payload: UpdateSchedulePayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Partial upsert — creates the schedule (seeded from the clip's
    existing metadata) on first call, otherwise updates only the fields
    actually present in the request body. `exclude_unset=True` is what lets
    a client explicitly clear scheduled_at with a JSON null without
    touching anything else."""
    user_id = await _get_user_id(request, db)
    updates = payload.model_dump(exclude_unset=True)
    try:
        schedule = await PublishService(db).update_schedule(clip_id, user_id, updates)
    except ClipNotFoundError:
        raise HTTPException(status_code=404, detail="Clip not found")
    except InvalidChannelError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"schedule": schedule}


@router.delete("/clips/{clip_id}/schedule")
async def delete_schedule(
    clip_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(request, db)
    try:
        await PublishService(db).delete_schedule(clip_id, user_id)
    except ClipNotFoundError:
        raise HTTPException(status_code=404, detail="Clip not found")
    return {"ok": True}


@router.get("/calendar")
async def get_calendar(
    request: Request,
    db: AsyncSession = Depends(get_db),
    start: str = "",
    end: str = "",
):
    """Scheduled (not draft) clips whose date falls within [start, end]
    inclusive, both YYYY-MM-DD — for the calendar view."""
    user_id = await _get_user_id(request, db)
    if not start or not end:
        raise HTTPException(status_code=400, detail="start and end (YYYY-MM-DD) are required")
    try:
        start_date = date.fromisoformat(start)
        end_date_inclusive = date.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=400, detail="start/end must be YYYY-MM-DD")

    end_date_exclusive = end_date_inclusive + timedelta(days=1)
    schedules = await PublishService(db).list_calendar(user_id, start_date, end_date_exclusive)
    return {"schedules": schedules}
