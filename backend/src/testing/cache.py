"""Real-run artifact cache: `<cache_root>/<task_id>/<stage_id>.json`.

Populated additively by the real pipeline (see the `cache_test_artifact`
call sites in `services/task_service.py`, `services/video_service.py`, and
`services/ranking_service.py`) so the Testing tab's "from prior run" input
source has real data to replay without re-paying for transcription/LLM
calls. Every write is best-effort: a failure here must never break a real
pipeline run, so callers always wrap this in try/except.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from ..config import Config
from .paths import cache_root

logger = logging.getLogger(__name__)
_SAFE_ID_RE = re.compile(r"[^a-zA-Z0-9_-]+")


def _safe(value: str) -> str:
    return _SAFE_ID_RE.sub("-", value.strip()).strip("-") or "unknown"


def hash_input(data: Any) -> str:
    """Stable content hash of a stage's resolved input, for the "inputs
    unchanged -> offer cached output" check."""
    normalized = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def cache_test_artifact(
    task_id: str,
    tool: str,
    stage_id: str,
    *,
    input_data: Dict[str, Any],
    output_data: Dict[str, Any],
    config: Optional[Config] = None,
) -> None:
    """Best-effort cache write. Never raises — a caching failure must not
    interrupt a real pipeline run."""
    try:
        directory = cache_root(config) / _safe(task_id)
        directory.mkdir(parents=True, exist_ok=True)
        payload = {
            "tool": tool,
            "stage_id": stage_id,
            "input_hash": hash_input(input_data),
            "input": input_data,
            "output": output_data,
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }
        path = directory / f"{_safe(stage_id)}.json"
        path.write_text(json.dumps(payload, indent=2, default=str))
    except Exception:
        logger.warning(
            "Failed to cache test artifact for task %s stage %s (non-fatal)",
            task_id,
            stage_id,
            exc_info=True,
        )


def load_cached_artifact(
    task_id: str, stage_id: str, config: Optional[Config] = None
) -> Optional[Dict[str, Any]]:
    path = cache_root(config) / _safe(task_id) / f"{_safe(stage_id)}.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def list_cached_task_ids(config: Optional[Config] = None) -> list[str]:
    root = cache_root(config)
    return sorted(
        p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith("_")
    )
