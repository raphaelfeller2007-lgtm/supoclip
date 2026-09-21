"""Fixture storage: `<fixtures_root>/<tool>/<stage_id>/<name>.json`.

Each fixture file is `{"description": str, "input": {...}, "output": {...}?}`.
`output` is present for stages that stub from a canned response (LLM/API
stages); pure-local stages only need `input` (a real fixture video path,
settings, etc.) since their "real" call is free.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List

from .paths import fixtures_root

_SAFE_NAME_RE = re.compile(r"[^a-zA-Z0-9_-]+")


def _safe_name(name: str) -> str:
    cleaned = _SAFE_NAME_RE.sub("-", name.strip()).strip("-")
    if not cleaned:
        raise ValueError("Fixture name must contain at least one alphanumeric character")
    return cleaned


def stage_dir(tool: str, stage_id: str) -> Path:
    directory = fixtures_root() / _safe_name(tool) / _safe_name(stage_id)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def list_fixtures(tool: str, stage_id: str) -> List[Dict[str, Any]]:
    directory = stage_dir(tool, stage_id)
    fixtures = []
    for path in sorted(directory.glob("*.json")):
        try:
            payload = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        fixtures.append(
            {
                "name": path.stem,
                "description": payload.get("description", ""),
                "has_output": "output" in payload,
            }
        )
    return fixtures


def load_fixture(tool: str, stage_id: str, name: str) -> Dict[str, Any]:
    path = stage_dir(tool, stage_id) / f"{_safe_name(name)}.json"
    if not path.is_file():
        raise ValueError(f"Fixture not found: {tool}/{stage_id}/{name}")
    return json.loads(path.read_text())


def save_fixture(
    tool: str,
    stage_id: str,
    name: str,
    *,
    description: str,
    input_data: Dict[str, Any],
    output_data: Dict[str, Any] | None = None,
) -> str:
    directory = stage_dir(tool, stage_id)
    safe = _safe_name(name)
    path = directory / f"{safe}.json"
    payload: Dict[str, Any] = {"description": description, "input": input_data}
    if output_data is not None:
        payload["output"] = output_data
    path.write_text(json.dumps(payload, indent=2, default=str))
    return safe
