"""Testing tab API — isolated pipeline-stage runner for development.

Hidden entirely (404) unless `ENABLE_TESTING_TOOL=true`: this is a dev tool,
not something the hosted product exposes to regular users. See CLAUDE.md's
"Testing Tab" section for fixture/cache locations and how to add a stage.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import resolve_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...repositories.cache_repository import CacheRepository
from ...repositories.task_repository import TaskRepository
from ...runtime_settings import encrypt_setting_value, load_runtime_settings_cache
from ...video_utils import ffprobe_duration
from ...testing.cache import list_cached_task_ids, load_cached_artifact
from ...testing.fixtures import list_fixtures, load_fixture, save_fixture
from ...testing.paths import default_clip_dir, session_override_dir
from ...testing.render_preview import (
    NoDefaultClipError,
    PreviewInputError,
    find_default_clip_path,
    render_clipping_preview,
    render_ranking_preview,
)
from ...testing.runner import estimate_cost, run_benchmark, run_stage
from ...testing.stages import STAGE_REGISTRY

router = APIRouter(prefix="/testing", tags=["testing"])

task_repo = TaskRepository()
cache_repo = CacheRepository()

_DEFAULT_CLIP_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm"}
_MAX_DEFAULT_CLIP_BYTES = 300 * 1024 * 1024


async def _stream_upload(uploaded_file: UploadFile, target_path: Path, max_bytes: int) -> None:
    written = 0
    chunk_size = 1024 * 1024
    try:
        async with aiofiles.open(target_path, "wb") as destination:
            while True:
                chunk = await uploaded_file.read(chunk_size)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(status_code=413, detail="Uploaded file is too large")
                await destination.write(chunk)
    except Exception:
        if target_path.exists():
            target_path.unlink(missing_ok=True)
        raise


async def _require_enabled() -> None:
    if not get_config().enable_testing_tool:
        raise HTTPException(status_code=404, detail="Not found")


async def _get_user_id(request: Request, db: AsyncSession) -> str:
    return await resolve_authenticated_user_id(request, db, get_config())


@router.get("/stages")
async def list_stages(_: None = Depends(_require_enabled)):
    return {
        "stages": [
            {
                "id": spec.id,
                "tool": spec.tool,
                "name": spec.name,
                "description": spec.description,
                "external_service": spec.external_service,
                "input_shape": spec.input_shape,
                "output_shape": spec.output_shape,
                "fixture_stub_supported": spec.fixture_stub_supported,
            }
            for spec in STAGE_REGISTRY.values()
        ]
    }


@router.get("/fixtures")
async def get_fixtures(tool: str, stage_id: str, _: None = Depends(_require_enabled)):
    return {"fixtures": list_fixtures(tool, stage_id)}


@router.get("/fixtures/{tool}/{stage_id}/{name}")
async def get_fixture(tool: str, stage_id: str, name: str, _: None = Depends(_require_enabled)):
    try:
        return load_fixture(tool, stage_id, name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class SaveFixturePayload(BaseModel):
    tool: str
    stage_id: str
    name: str
    description: str = ""
    input: Dict[str, Any]
    output: Optional[Dict[str, Any]] = None


@router.post("/fixtures")
async def create_fixture(payload: SaveFixturePayload, _: None = Depends(_require_enabled)):
    saved_name = save_fixture(
        payload.tool,
        payload.stage_id,
        payload.name,
        description=payload.description,
        input_data=payload.input,
        output_data=payload.output,
    )
    return {"name": saved_name}


@router.get("/prior-runs")
async def list_prior_runs(
    tool: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_enabled),
):
    user_id = await _get_user_id(request, db)
    tasks = await task_repo.get_user_tasks(db, user_id, limit=50)
    cached_ids = set(list_cached_task_ids())
    matching = [t for t in tasks if (t.get("task_type") or "clipping") == tool]
    return {
        "tasks": [
            {
                "task_id": t["id"],
                "title": t.get("source_title") or t.get("source_url"),
                "status": t.get("status"),
                "created_at": t.get("created_at"),
                "has_cached_artifacts": t["id"] in cached_ids,
            }
            for t in matching
        ]
    }


@router.get("/prior-runs/{task_id}/{stage_id}")
async def get_prior_run_artifact(
    task_id: str,
    stage_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_enabled),
):
    user_id = await _get_user_id(request, db)
    task = await task_repo.get_task_by_id(db, task_id)
    if not task or task.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Task not found")

    cached = load_cached_artifact(task_id, stage_id)
    if cached:
        return cached

    # Backward-compatible fallback for tasks that ran before artifact
    # caching existed: processing_cache only ever held transcript+analysis.
    if stage_id in ("transcribe", "detect_clips"):
        cache_key_row = None
        source_url = task.get("source_url")
        source_type = task.get("source_type")
        processing_mode = task.get("processing_mode") or "fast"
        if source_url and source_type:
            from ...ai import TRANSCRIPT_ANALYSIS_CACHE_VERSION
            import hashlib

            payload = f"{source_type}|{processing_mode}|{TRANSCRIPT_ANALYSIS_CACHE_VERSION}|{source_url.strip()}"
            cache_key = hashlib.sha256(payload.encode("utf-8")).hexdigest()
            cache_key_row = await cache_repo.get_cache(db, cache_key)
        if cache_key_row:
            if stage_id == "transcribe" and cache_key_row.get("transcript_text"):
                return {"output": {"transcript": cache_key_row["transcript_text"]}, "input": None}
            if stage_id == "detect_clips" and cache_key_row.get("analysis_json"):
                import json

                return {"output": json.loads(cache_key_row["analysis_json"]), "input": None}

    raise HTTPException(status_code=404, detail="No cached artifact for this task/stage")


class StageRunPayload(BaseModel):
    input: Dict[str, Any]
    mode: str = "stub"
    provider: Optional[str] = None
    model: Optional[str] = None


@router.post("/stages/{tool}/{stage_id}/run")
async def run_stage_endpoint(
    tool: str, stage_id: str, payload: StageRunPayload, _: None = Depends(_require_enabled)
):
    if payload.mode not in ("stub", "real"):
        raise HTTPException(status_code=400, detail="mode must be 'stub' or 'real'")
    result = await run_stage(
        tool,
        stage_id,
        payload.input,
        mode=payload.mode,
        provider=payload.provider,
        model=payload.model,
    )
    return result.to_dict()


@router.post("/stages/{tool}/{stage_id}/estimate-cost")
async def estimate_cost_endpoint(
    tool: str, stage_id: str, payload: Dict[str, Any], _: None = Depends(_require_enabled)
):
    return await estimate_cost(tool, stage_id, payload.get("input", {}))


class BenchmarkRun(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    label: Optional[str] = None


class BenchmarkPayload(BaseModel):
    tool: str
    stage_id: str
    input: Dict[str, Any]
    runs: List[BenchmarkRun]
    mode: str = "real"


@router.post("/benchmark")
async def benchmark_endpoint(payload: BenchmarkPayload, _: None = Depends(_require_enabled)):
    rows = await run_benchmark(
        payload.tool,
        payload.stage_id,
        payload.input,
        [r.model_dump() for r in payload.runs],
        mode=payload.mode,
    )
    return {"runs": rows}


# --- Default test clip (Settings -> Testing) -------------------------------


@router.post("/default-clip")
async def upload_default_clip(
    request: Request,
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
    scope: str = "persistent",
    feature_key: Optional[str] = None,
    _: None = Depends(_require_enabled),
):
    """Upload the clip visual-feature previews render against. `scope=persistent`
    (default) replaces the one Settings -> Testing default clip; `scope=session`
    (with a `feature_key`) uploads a one-off override for just that tab,
    without touching the persisted default."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _DEFAULT_CLIP_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format — use one of: {', '.join(sorted(_DEFAULT_CLIP_EXTENSIONS))}",
        )

    if scope == "session":
        if not feature_key:
            raise HTTPException(status_code=400, detail="feature_key is required for scope=session")
        target_dir = session_override_dir()
        for existing in target_dir.glob(f"{feature_key}.*"):
            existing.unlink(missing_ok=True)
        target_path = target_dir / f"{feature_key}{ext}"
        await _stream_upload(file, target_path, _MAX_DEFAULT_CLIP_BYTES)
        return {"session_clip_key": feature_key}

    if scope != "persistent":
        raise HTTPException(status_code=400, detail="scope must be 'persistent' or 'session'")

    user_id = await _get_user_id(request, db)
    target_dir = default_clip_dir()
    for existing in target_dir.glob("default_clip.*"):
        existing.unlink(missing_ok=True)
    filename = f"default_clip{ext}"
    target_path = target_dir / filename
    await _stream_upload(file, target_path, _MAX_DEFAULT_CLIP_BYTES)

    encrypted_value = encrypt_setting_value(filename)
    await db.execute(
        sql_text("""
            INSERT INTO app_settings (setting_key, encrypted_value, updated_by)
            VALUES ('TEST_DEFAULT_CLIP_FILENAME', :encrypted_value, :updated_by)
            ON CONFLICT (setting_key) DO UPDATE
            SET encrypted_value = EXCLUDED.encrypted_value,
                updated_by = EXCLUDED.updated_by,
                updated_at = CURRENT_TIMESTAMP
        """),
        {"encrypted_value": encrypted_value, "updated_by": user_id},
    )
    await db.commit()
    await load_runtime_settings_cache(db)

    return {"filename": filename}


@router.get("/default-clip")
async def get_default_clip(_: None = Depends(_require_enabled)):
    path = find_default_clip_path()
    if not path:
        raise HTTPException(status_code=404, detail="No default test clip uploaded yet")
    return {
        "filename": path.name,
        "duration_seconds": ffprobe_duration(path),
        "size_bytes": path.stat().st_size,
    }


@router.get("/default-clip/file")
async def get_default_clip_file(_: None = Depends(_require_enabled)):
    path = find_default_clip_path()
    if not path:
        raise HTTPException(status_code=404, detail="No default test clip uploaded yet")
    return FileResponse(path=str(path), media_type="video/mp4")


# --- Visual-feature render preview ------------------------------------------


class RenderPreviewPayload(BaseModel):
    media_path: Optional[str] = None
    session_clip_key: Optional[str] = None
    start_time: float = 0.0
    end_time: Optional[float] = None
    add_subtitles: bool = False
    font_family: Optional[str] = None
    font_size: Optional[int] = None
    font_color: Optional[str] = None
    caption_template: str = "default"
    output_format: str = "vertical"
    keep_ranges: Optional[List[List[float]]] = None
    hook_title: Optional[str] = None
    hook_style: Optional[Dict[str, Any]] = None
    social_overlay: Optional[Dict[str, Any]] = None
    reactions: Optional[List[Dict[str, Any]]] = None
    cleanup_settings: Optional[Dict[str, Any]] = None


@router.post("/render-preview")
async def render_preview_endpoint(
    payload: RenderPreviewPayload, _: None = Depends(_require_enabled)
):
    try:
        output_path = await render_clipping_preview(
            media_path=payload.media_path,
            session_clip_key=payload.session_clip_key,
            start_time=payload.start_time,
            end_time=payload.end_time,
            add_subtitles=payload.add_subtitles,
            font_family=payload.font_family,
            font_size=payload.font_size,
            font_color=payload.font_color,
            caption_template=payload.caption_template,
            output_format=payload.output_format,
            keep_ranges=payload.keep_ranges,
            hook_title=payload.hook_title,
            hook_style=payload.hook_style,
            social_overlay=payload.social_overlay,
            reactions=payload.reactions,
            cleanup_settings=payload.cleanup_settings,
        )
    except NoDefaultClipError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (PreviewInputError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return FileResponse(path=str(output_path), media_type="video/mp4")


class RankingRenderPreviewPayload(BaseModel):
    template_id: str = "rapid_fire"
    number_overlay: Optional[Dict[str, Any]] = None
    use_global_sfx: Optional[bool] = None


@router.post("/ranking-render-preview")
async def ranking_render_preview_endpoint(
    payload: RankingRenderPreviewPayload, _: None = Depends(_require_enabled)
):
    try:
        output_path = await render_ranking_preview(
            template_id=payload.template_id,
            number_overlay=payload.number_overlay,
            use_global_sfx=payload.use_global_sfx,
        )
    except (PreviewInputError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return FileResponse(path=str(output_path), media_type="video/mp4")
