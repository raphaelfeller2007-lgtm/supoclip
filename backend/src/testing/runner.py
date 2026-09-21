"""Stub/real dispatch, timing, cost estimation, and benchmarking — the glue
between a stage's `run` function (stages.py) and the HTTP layer
(api/routes/testing.py). Stage functions stay simple; this module owns the
cross-cutting concerns every stage run needs (timing, error capture, scoped
provider/model override, cost estimate)."""

from __future__ import annotations

import copy
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from ..config import Config, get_config, set_config_override
from .costs import estimate_llm_cost, estimate_transcription_cost
from .stages import STAGE_REGISTRY, StageSpec, stage_key


@dataclass
class StageRunResult:
    output: Optional[Dict[str, Any]]
    provider: str
    raw_response: Any
    timing_ms: int
    cost_estimate: float
    error: Optional[str]
    warnings: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "output": self.output,
            "provider": self.provider,
            "raw_response": self.raw_response,
            "timing_ms": self.timing_ms,
            "cost_estimate": self.cost_estimate,
            "error": self.error,
            "warnings": self.warnings,
        }


def get_stage(tool: str, stage_id: str) -> StageSpec:
    key = stage_key(tool, stage_id)
    spec = STAGE_REGISTRY.get(key)
    if spec is None:
        raise ValueError(f"Unknown stage: {key}")
    return spec


def _scoped_config(provider: Optional[str], model: Optional[str]) -> Optional[Config]:
    """Build a Config copy with just llm/ollama_model/gemini_model overridden,
    for a single stage run — never mutates the process-wide config."""
    if not provider and not model:
        return None
    base = copy.copy(get_config())
    if provider == "ollama":
        base.llm = f"ollama:{model or base.ollama_model}"
        if model:
            base.ollama_model = model
    elif provider == "gemini":
        base.llm = f"google-gla:{model or base.gemini_model}"
        if model:
            base.gemini_model = model
    elif provider and model:
        base.llm = f"{provider}:{model}"
    elif model:
        # provider unspecified: keep the configured provider, swap the model name.
        current_provider = (base.llm or "").split(":", 1)[0] or "google-gla"
        base.llm = f"{current_provider}:{model}"
    return base


def _cost_estimate(mode: str, cost_hint: Optional[Dict[str, Any]]) -> float:
    if mode != "real" or not cost_hint:
        return 0.0
    kind = cost_hint.get("kind")
    if kind == "llm":
        return estimate_llm_cost(
            cost_hint.get("provider", ""),
            cost_hint.get("prompt_chars", 0),
            cost_hint.get("output_chars", 0),
        )
    if kind == "transcription":
        return estimate_transcription_cost(cost_hint.get("duration_seconds"))
    return 0.0


async def run_stage(
    tool: str,
    stage_id: str,
    input_data: Dict[str, Any],
    *,
    mode: str = "stub",
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> StageRunResult:
    start = time.perf_counter()
    scoped: Optional[Config] = None
    try:
        spec = get_stage(tool, stage_id)
        effective_mode = mode if spec.external_service else "real"

        scoped = _scoped_config(provider, model)
        if scoped is not None:
            set_config_override(scoped)
        config = get_config()

        result = await spec.run(input_data, mode=effective_mode, config=config)
        timing_ms = int((time.perf_counter() - start) * 1000)
        return StageRunResult(
            output=result.get("output"),
            provider=result.get("provider", "local"),
            raw_response=result.get("raw_response"),
            timing_ms=timing_ms,
            cost_estimate=_cost_estimate(effective_mode, result.get("cost_hint")),
            error=None,
            warnings=result.get("warnings", []),
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller, not swallowed
        timing_ms = int((time.perf_counter() - start) * 1000)
        return StageRunResult(
            output=None,
            provider="error",
            raw_response=None,
            timing_ms=timing_ms,
            cost_estimate=0.0,
            error=str(exc),
            warnings=[],
        )
    finally:
        if scoped is not None:
            set_config_override(None)


async def estimate_cost(
    tool: str,
    stage_id: str,
    input_data: Dict[str, Any],
) -> Dict[str, Any]:
    """Cheap pre-run estimate — approximates cost_hint without making the
    real call, so it never itself costs money. Transcription estimates need
    the source file's duration; LLM stages estimate off input text length."""
    spec = get_stage(tool, stage_id)
    if not spec.external_service:
        return {"cost_estimate": 0.0, "note": "Local stage — always free."}

    if spec.external_service == "assemblyai":
        from ..services.video_service import VideoService
        from ..utils.async_helpers import run_in_thread
        from .stages import _media_path

        try:
            path = _media_path(input_data)
            duration = await run_in_thread(VideoService._get_file_duration, path)
        except Exception:
            duration = None
        return {
            "cost_estimate": estimate_transcription_cost(duration),
            "note": "Estimate based on source duration; only applies if TRANSCRIPTION_PROVIDER=assemblyai.",
        }

    config = get_config()
    provider = (config.llm or "").split(":", 1)[0] or "unknown"
    prompt_chars = len(
        str(input_data.get("transcript") or input_data.get("text") or input_data.get("clip_text") or "")
    )
    return {
        "cost_estimate": estimate_llm_cost(provider, prompt_chars, prompt_chars // 4),
        "note": f"Rough estimate for provider '{provider}'; actual cost depends on the model's real output length.",
    }


async def run_benchmark(
    tool: str,
    stage_id: str,
    input_data: Dict[str, Any],
    runs: List[Dict[str, Optional[str]]],
    *,
    mode: str = "real",
) -> List[Dict[str, Any]]:
    """Sequential runs (not parallel) so this never contends unsafely with
    real traffic through the shared llm/gpu resource_slot locks."""
    rows = []
    for run_config in runs:
        result = await run_stage(
            tool,
            stage_id,
            input_data,
            mode=mode,
            provider=run_config.get("provider"),
            model=run_config.get("model"),
        )
        rows.append({"label": run_config.get("label") or run_config.get("model") or "run", **result.to_dict()})
    return rows
