"""
Worker tasks - background jobs processed by arq workers.
"""

import logging
from typing import Dict, Any, Optional
import json

from ..observability import configure_logging, set_trace_id
from ..repositories.task_repository import TaskRepository

configure_logging()

logger = logging.getLogger(__name__)


async def process_video_task(
    ctx: Dict[str, Any],
    task_id: str,
    url: str,
    source_type: str,
    user_id: str,
    font_family: Optional[str] = None,
    font_size: Optional[int] = None,
    font_color: Optional[str] = None,
    caption_template: str = "default",
    processing_mode: str = "fast",
    output_format: str = "vertical",
    add_subtitles: bool = True,
    cleanup_settings: Dict[str, Any] | None = None,
    hook_style: Dict[str, Any] | None = None,
    social_overlay: Dict[str, Any] | None = None,
    target_duration_seconds: float | None = None,
    max_clips: int | None = None,
    include_broll: bool = False,
    broll_settings: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Background worker task to process a video.

    Args:
        ctx: arq context (provides Redis connection and other utilities)
        task_id: Task ID to update
        url: Video URL or file path
        source_type: "youtube" or "upload"
        user_id: User ID who created the task
        font_family: Font family for subtitles
        font_size: Font size for subtitles
        font_color: Font color for subtitles

    Returns:
        Dict with processing results
    """
    from ..database import AsyncSessionLocal
    from ..runtime_settings import load_runtime_settings_cache
    from ..services.task_service import TaskService
    from ..workers.progress import ProgressTracker

    set_trace_id(f"task-{task_id}")
    logger.info(f"Worker processing task {task_id}")

    # Create progress tracker
    progress = ProgressTracker(ctx["redis"], task_id)

    async with AsyncSessionLocal() as db:
        await load_runtime_settings_cache(db)
        task_service = TaskService(db)

        try:
            # Progress callback
            async def update_progress(
                percent: int,
                message: str,
                status: str = "processing",
                stage: str | None = None,
            ):
                await progress.update(percent, message, status, stage=stage)
                logger.info(f"Task {task_id}: {percent}% - {message}")

            async def should_cancel() -> bool:
                cancelled = await ctx["redis"].get(f"task_cancel:{task_id}")
                return bool(cancelled)

            async def clip_ready_callback(
                clip_index: int, total_clips: int, clip_data: dict
            ):
                await progress.clip_ready(clip_index, total_clips, clip_data)

            async def clip_started_callback(clip_index: int, total_clips: int):
                await progress.clip_started(clip_index, total_clips)

            # Process the video
            result = await task_service.process_task(
                task_id=task_id,
                url=url,
                source_type=source_type,
                user_id=user_id,
                font_family=font_family,
                font_size=font_size,
                font_color=font_color,
                caption_template=caption_template,
                processing_mode=processing_mode,
                output_format=output_format,
                add_subtitles=add_subtitles,
                progress_callback=update_progress,
                should_cancel=should_cancel,
                clip_ready_callback=clip_ready_callback,
                clip_started_callback=clip_started_callback,
                cleanup_settings=cleanup_settings,
                hook_style=hook_style,
                social_overlay=social_overlay,
                target_duration_seconds=target_duration_seconds,
                max_clips=max_clips,
                include_broll=include_broll,
                broll_settings=broll_settings,
            )

            logger.info(f"Task {task_id} completed successfully")
            return result

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}", exc_info=True)
            try:
                job_try = int(ctx.get("job_try", 1))
                max_tries = int(getattr(WorkerSettings, "max_tries", 3))
                if job_try >= max_tries:
                    payload = {
                        "task_id": task_id,
                        "error": str(e),
                        "tries": job_try,
                    }
                    await ctx["redis"].set(
                        f"dead_letter:{task_id}", json.dumps(payload)
                    )
                    await ctx["redis"].sadd("tasks:dead_letter", task_id)
                    await progress.error("Task failed permanently after retries")
            except Exception:
                logger.exception("Failed to persist dead-letter payload")
            # Error will be caught by arq and task status will be updated
            raise


async def process_ranking_task(ctx: Dict[str, Any], task_id: str) -> Dict[str, Any]:
    """Background worker job for the Ranking/Compilation tool: renders one
    compilation video from a ranking task's ordered input videos (see
    RankingService.process_ranking_complete). Mirrors process_video_task's
    session/progress/error-handling shape."""
    from ..database import AsyncSessionLocal
    from ..runtime_settings import load_runtime_settings_cache
    from ..services.ranking_service import RankingService
    from ..workers.progress import ProgressTracker

    set_trace_id(f"ranking-{task_id}")
    logger.info(f"Worker processing ranking task {task_id}")

    progress = ProgressTracker(ctx["redis"], task_id)

    async with AsyncSessionLocal() as db:
        await load_runtime_settings_cache(db)
        ranking_service = RankingService(db)

        async def update_progress(
            percent: int, message: str, status: str = "processing", stage: str | None = None
        ):
            await progress.update(percent, message, status, stage=stage)
            logger.info(f"Ranking task {task_id}: {percent}% - {message}")

        try:
            result = await ranking_service.process_ranking_complete(
                task_id=task_id, progress_callback=update_progress
            )
            logger.info(f"Ranking task {task_id} completed successfully")
            return result
        except Exception as e:
            logger.error(f"Ranking task {task_id} failed: {e}", exc_info=True)
            try:
                job_try = int(ctx.get("job_try", 1))
                max_tries = int(getattr(WorkerSettings, "max_tries", 3))
                if job_try >= max_tries:
                    await db.rollback()
                    await TaskRepository.update_task_status(
                        db, task_id, "error", progress_message=str(e)
                    )
                    payload = {
                        "task_id": task_id,
                        "error": str(e),
                        "tries": job_try,
                    }
                    await ctx["redis"].set(
                        f"dead_letter:{task_id}", json.dumps(payload)
                    )
                    await ctx["redis"].sadd("tasks:dead_letter", task_id)
                    await progress.error("Ranking task failed permanently after retries")
            except Exception:
                logger.exception("Failed to persist ranking task failure state")
            # Error will be caught by arq and task status will be updated
            raise


async def sync_channel_job(ctx: Dict[str, Any], channel_id: str) -> None:
    """One-off job: refresh a single tracked channel's details/videos/stats
    (see ChannelService.sync_channel). Enqueued right after a channel is
    added, and by the manual resync endpoint."""
    from ..database import AsyncSessionLocal
    from ..runtime_settings import load_runtime_settings_cache
    from ..services.channel_service import ChannelService

    set_trace_id(f"channel-sync-{channel_id}")
    logger.info(f"Worker syncing channel {channel_id}")

    async with AsyncSessionLocal() as db:
        await load_runtime_settings_cache(db)
        await ChannelService(db).sync_channel(channel_id)


async def poll_channel_updates_job(ctx: Dict[str, Any]) -> Dict[str, int]:
    """Cron entrypoint (the first periodic job in this codebase): sync every
    tracked channel, across every user. ChannelService.sync_channel never
    raises, so a single channel's failure can't abort the run — see
    ChannelService.poll_all_channels."""
    from ..database import AsyncSessionLocal
    from ..runtime_settings import load_runtime_settings_cache
    from ..services.channel_service import ChannelService

    set_trace_id("channel-poll")
    logger.info("Worker polling all tracked channels for updates")

    async with AsyncSessionLocal() as db:
        await load_runtime_settings_cache(db)
        result = await ChannelService(db).poll_all_channels()
        logger.info(f"Channel poll complete: {result}")
        return result


async def process_batch_queue_task(ctx: Dict[str, Any], batch_queue_id: str) -> None:
    """Background worker job for a batch queue: walks its items sequentially
    (see BatchQueueService.run_batch). Pause/cancel is signaled the same way
    single-task cancellation is — a Redis key checked between items."""
    from ..database import AsyncSessionLocal
    from ..runtime_settings import load_runtime_settings_cache
    from ..services.batch_queue_service import BatchQueueService

    set_trace_id(f"batch-{batch_queue_id}")
    logger.info(f"Worker processing batch queue {batch_queue_id}")

    async def should_pause_or_cancel() -> Optional[str]:
        cancelled = await ctx["redis"].get(f"batch_cancel:{batch_queue_id}")
        if cancelled:
            return "cancel"
        paused = await ctx["redis"].get(f"batch_pause:{batch_queue_id}")
        if paused:
            return "pause"
        return None

    async with AsyncSessionLocal() as db:
        await load_runtime_settings_cache(db)
        try:
            await BatchQueueService(db).run_batch(
                batch_queue_id, should_pause_or_cancel=should_pause_or_cancel
            )
        except Exception:
            logger.exception("Batch queue %s failed", batch_queue_id)
            raise


async def cleanup_orphaned_uploads_job(ctx: Dict[str, Any]) -> Dict[str, int]:
    """Cron entrypoint: remove uploaded source videos that no `sources` row
    references at all.

    `POST /upload` writes the file straight to disk before any DB row exists
    — task creation (a separate step) is what creates the `sources` row a
    task's whole lifetime then depends on (regeneration/hook-variant/
    reactions re-renders all read back from the original upload, so normal
    task processing/purging never touches this file — see
    TaskService.purge_task). A user who uploads and then never submits the
    create-task form (or hits an error first) leaves the file behind forever
    with nothing else to ever clean it up. The grace period skips anything
    recent so an in-progress upload-then-create-task flow is never at risk.
    """
    import time
    from pathlib import Path

    from ..database import AsyncSessionLocal
    from ..runtime_settings import load_runtime_settings_cache
    from ..config import get_config
    from ..repositories.source_repository import SourceRepository
    from ..services.video_service import UPLOAD_URL_PREFIX

    set_trace_id("cleanup-orphaned-uploads")

    grace_seconds = 24 * 60 * 60  # long enough that a slow/abandoned-then-resumed upload flow is never touched
    removed = 0
    freed_bytes = 0
    checked = 0

    async with AsyncSessionLocal() as db:
        await load_runtime_settings_cache(db)
        referenced_urls = await SourceRepository.get_upload_urls(db)

    referenced_filenames = {
        Path(url.removeprefix(UPLOAD_URL_PREFIX)).name for url in referenced_urls
    }

    uploads_dir = Path(get_config().temp_dir) / "uploads"
    if not uploads_dir.exists():
        return {"checked": 0, "removed": 0, "freed_bytes": 0}

    now = time.time()
    for file_path in uploads_dir.iterdir():
        if not file_path.is_file() or file_path.name in referenced_filenames:
            continue
        checked += 1
        try:
            stat = file_path.stat()
            if now - stat.st_mtime < grace_seconds:
                continue
            file_path.unlink()
            removed += 1
            freed_bytes += stat.st_size
        except OSError as exc:
            logger.warning("Failed to remove orphaned upload %s: %s", file_path, exc)

    result = {"checked": checked, "removed": removed, "freed_bytes": freed_bytes}
    logger.info("Orphaned upload cleanup complete: %s", result)
    return result


def _channel_poll_cron_hours(interval_hours: int) -> set:
    """arq's cron() is calendar-field-based, not a fixed-interval timer —
    this only yields evenly-spaced runs when interval_hours divides 24.
    Falls back to a hard-coded 6h cadence otherwise (logged), which is fine
    given the feature only needs "kept automatically up to date," not
    minute-level freshness."""
    if interval_hours <= 0 or 24 % interval_hours != 0:
        logger.warning(
            "CHANNEL_SYNC_POLL_INTERVAL_HOURS=%s doesn't evenly divide 24; falling back to 6h",
            interval_hours,
        )
        interval_hours = 6
    return set(range(0, 24, interval_hours))


# Worker configuration for arq
class WorkerSettings:
    """Configuration for arq worker."""

    from arq import cron
    from arq.connections import RedisSettings

    from ..config import Config

    config = Config()

    # Functions to run
    functions = [
        process_video_task,
        process_batch_queue_task,
        process_ranking_task,
        sync_channel_job,
    ]
    queue_name = "supoclip_tasks"

    # Redis settings from environment
    redis_settings = RedisSettings(
        host=config.redis_host, port=config.redis_port, password=config.redis_password, database=0
    )

    # Retry settings
    max_tries = 3  # Retry failed jobs up to 3 times
    job_timeout = 10800  # 3 hour timeout for video processing

    # Worker pool settings
    max_jobs = 4  # Process up to 4 jobs simultaneously

    # sync_channel_job (one-off) doesn't need a cron_jobs entry of its own;
    # arq merges cron_jobs into its function table automatically.
    cron_jobs = [
        cron(
            poll_channel_updates_job,
            hour=_channel_poll_cron_hours(config.channel_sync_poll_interval_hours),
            minute=0,
        ),
        # Fixed daily off-peak slot rather than a runtime setting — disk
        # hygiene doesn't need admin tuning the way the channel poll interval
        # does, and the grace period already makes the cadence non-critical.
        cron(cleanup_orphaned_uploads_job, hour=3, minute=30),
    ]
