"""Testing tab API — isolated pipeline-stage runner for development.

Hidden entirely (404) unless `ENABLE_TESTING_TOOL=true`: this is a dev tool,
not something the hosted product exposes to regular users. See CLAUDE.md's
"Testing Tab" section for fixture/cache locations and how to add a stage.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import resolve_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...repositories.cache_repository import CacheRepository
from ...repositories.task_repository import TaskRepository
from ...testing.cache import list_cached_task_ids, load_cached_artifact
from ...testing.fixtures import list_fixtures, load_fixture, save_fixture
from ...testing.runner import estimate_cost, run_benchmark, run_stage
from ...testing.stages import STAGE_REGISTRY

router = APIRouter(prefix="/testing", tags=["testing"])

task_repo = TaskRepository()
cache_repo = CacheRepository()


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
