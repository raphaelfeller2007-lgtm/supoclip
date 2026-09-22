"""Filesystem locations for the Testing tab.

Both roots are siblings of `backend/`, not inside `Config.temp_dir` — temp_dir
holds unnamespaced scratch files (e.g. ffmpeg mixing scratch) with no
sweep-safety guarantee, so fixtures/cache get their own directories that
nothing else ever cleans up.
"""

from __future__ import annotations

from pathlib import Path

from ..config import Config, get_config

REPO_ROOT = Path(__file__).resolve().parents[3]


def fixtures_root(config: Config | None = None) -> Path:
    config = config or get_config()
    root = Path(config.test_fixtures_dir)
    if not root.is_absolute():
        root = REPO_ROOT / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def cache_root(config: Config | None = None) -> Path:
    config = config or get_config()
    root = Path(config.test_artifact_cache_dir)
    if not root.is_absolute():
        root = REPO_ROOT / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def scratch_root(config: Config | None = None) -> Path:
    """Output directory for real-mode render/export stage runs — never the
    production `temp/clips` directory, so a Testing tab run can never be
    mistaken for (or collide with) a real user's exported clip."""
    root = cache_root(config) / "_scratch"
    root.mkdir(parents=True, exist_ok=True)
    return root


def default_clip_dir(config: Config | None = None) -> Path:
    """Where the Settings -> Testing "default test clip" upload lives.

    Underscore-prefixed, same convention as `_scratch`, so it's excluded from
    `list_cached_task_ids` (that lists real-run cache entries, keyed by
    task_id, and this isn't one)."""
    root = cache_root(config) / "_default_clip"
    root.mkdir(parents=True, exist_ok=True)
    return root


def session_override_dir(config: Config | None = None) -> Path:
    """Per-tab "test on a different clip just for this session" uploads —
    not persisted as a setting, just a scratch location keyed by feature."""
    root = scratch_root(config) / "session-overrides"
    root.mkdir(parents=True, exist_ok=True)
    return root


def resolve_fixture_media_path(relative_path: str, config: Config | None = None) -> Path:
    """Resolve a fixture-relative media path (e.g. "clipping/media/sample.mp4"),
    rejecting any attempt to escape the fixtures root."""
    root = fixtures_root(config)
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        raise ValueError("media_path must stay inside the fixtures directory") from None
    if not candidate.is_file():
        raise ValueError(f"Fixture media file not found: {relative_path}")
    return candidate
