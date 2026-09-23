"""Channels tab API routes — tracked YouTube channels, looked up and synced
via the public YouTube Data API v3 (no OAuth, no login). ChannelService owns
the actual resolve/sync/analytics logic; this router is request/response
plumbing, ownership checks, and job enqueueing (the `queue_adapter` pattern
matches tasks.py/ranking.py, so tests can swap it out).
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import resolve_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...repositories.channel_repository import ChannelRepository
from ...services.channel_service import ChannelAlreadyTrackedError, ChannelService
from ...workers.job_queue import JobQueue
from ...youtube_utils import ChannelResolutionError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/channels", tags=["channels"])


async def _get_user_id(request: Request, db: AsyncSession) -> str:
    return await resolve_authenticated_user_id(request, db, get_config())


class AddChannelPayload(BaseModel):
    input: str


@router.post("")
async def add_channel(
    payload: AddChannelPayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Resolve a pasted YouTube URL/handle and start tracking it. Returns
    immediately with sync_status="pending" — the actual video list and
    first stats snapshot are fetched by a background job."""
    user_id = await _get_user_id(request, db)
    try:
        channel = await ChannelService(db).add_channel(user_id, payload.input)
    except ChannelAlreadyTrackedError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Channel is already tracked",
                "channel_id": exc.existing_channel["id"],
            },
        )
    except ChannelResolutionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    queue_adapter = getattr(request.app.state, "queue_adapter", JobQueue)
    await queue_adapter.enqueue_job("sync_channel_job", channel["id"])
    return {"channel": channel}


@router.get("")
async def list_channels(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = await _get_user_id(request, db)
    channels = await ChannelRepository.list_channels_for_user(db, user_id)
    return {"channels": channels}


@router.get("/analytics")
async def get_channel_analytics(
    request: Request,
    db: AsyncSession = Depends(get_db),
    channel_ids: Optional[str] = None,
):
    """Aggregated stats across one/several/all of this user's tracked
    channels (omit channel_ids for all). See ChannelService.get_analytics
    for exactly what's honestly derivable from the public Data API."""
    user_id = await _get_user_id(request, db)
    ids = [cid.strip() for cid in channel_ids.split(",") if cid.strip()] if channel_ids else None
    return await ChannelService(db).get_analytics(user_id, ids)


@router.get("/{channel_id}/videos")
async def list_channel_videos(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    user_id = await _get_user_id(request, db)
    channel = await ChannelRepository.get_channel_by_id(db, channel_id)
    if not channel or channel["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    videos = await ChannelRepository.get_videos_for_channel(db, channel_id, limit=limit)
    return {"videos": videos}


@router.post("/{channel_id}/resync")
async def resync_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Manual refresh — re-enqueues the same job the cron poll runs, for one
    channel right now instead of waiting for the schedule."""
    user_id = await _get_user_id(request, db)
    channel = await ChannelRepository.get_channel_by_id(db, channel_id)
    if not channel or channel["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    await ChannelRepository.update_sync_status(db, channel_id, "pending")
    queue_adapter = getattr(request.app.state, "queue_adapter", JobQueue)
    await queue_adapter.enqueue_job("sync_channel_job", channel_id)
    refreshed = await ChannelRepository.get_channel_by_id(db, channel_id)
    return {"channel": refreshed}


@router.delete("/{channel_id}")
async def delete_channel(
    channel_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Stop tracking a channel — cascades its videos, stats history, and any
    publish-schedule targets pointing at it."""
    user_id = await _get_user_id(request, db)
    deleted = await ChannelRepository.delete_channel(db, channel_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Channel not found")
    return {"ok": True}
