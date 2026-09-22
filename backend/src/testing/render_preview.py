"""Render-and-preview support for the Testing tab's visual-feature tabs.

Unlike the JSON-in/JSON-out stages in `stages.py`, these helpers exist to
produce an actual playable file: they wrap the same real rendering functions
(`create_optimized_clip`, `RankingService._render_compilation`) but resolve
their input clip from the Settings -> Testing "default test clip" (or a
per-tab session override) instead of a named fixture, and return the output
path for the API route to stream back with `FileResponse`.
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..clip_cleanup import normalize_clip_cleanup_settings
from ..clip_editor import _caption_words_with_timings
from ..config import Config, get_config
from ..ranking_templates import get_template
from ..services.ranking_service import RankingService
from ..utils.async_helpers import run_in_thread
from ..video_utils import (
    build_clip_keep_ranges,
    create_optimized_clip,
    ffprobe_duration,
    load_cached_transcript_data,
)
from .paths import default_clip_dir, resolve_fixture_media_path, scratch_root, session_override_dir
from .stages import _stage_as_upload_ref

# Only the styling (font, color, animation, position) matters for a visual
# preview, never the words themselves, so a fixed sentence — evenly split
# across the preview's duration via the same helper the caption-editing flow
# already uses for "no real timing available" — avoids any real
# transcription call regardless of what clip is uploaded as default.
_SAMPLE_CAPTION_SENTENCE = (
    "this is a sample caption showing your current styling choices in action"
)

# Ranking needs multiple inputs — reuse the fixtures shipped for exactly
# this purpose rather than inventing a separate "default ranking clips"
# setting.
_RANKING_FIXTURE_CLIPS = ["ranking/media/clip_a.mp4", "ranking/media/clip_b.mp4", "ranking/media/clip_c.mp4"]


class PreviewInputError(ValueError):
    """Raised when the requested preview clip can't be resolved — the route
    layer turns this into a 400, distinct from a 404 (missing default clip
    is a setup step, not a bad request)."""


class NoDefaultClipError(ValueError):
    """Raised when no default test clip has been uploaded and none was
    supplied as an override."""


def _synthetic_caption_words(duration_seconds: float) -> List[Dict[str, Any]]:
    return _caption_words_with_timings(_SAMPLE_CAPTION_SENTENCE.split(), [], duration_seconds)


def find_default_clip_path(config: Optional[Config] = None) -> Optional[Path]:
    matches = sorted(default_clip_dir(config).glob("default_clip.*"))
    return matches[0] if matches else None


def find_session_override_path(feature_key: str, config: Optional[Config] = None) -> Optional[Path]:
    matches = sorted(session_override_dir(config).glob(f"{feature_key}.*"))
    return matches[0] if matches else None


def resolve_preview_media_path(
    *,
    media_path: Optional[str],
    session_clip_key: Optional[str],
    config: Optional[Config] = None,
) -> Path:
    """Resolution order: an explicit fixture-relative `media_path` (for
    debugging/reuse) > a per-tab session override upload > the persisted
    default test clip."""
    if media_path:
        return resolve_fixture_media_path(media_path, config)
    if session_clip_key:
        override = find_session_override_path(session_clip_key, config)
        if override:
            return override
    default_clip = find_default_clip_path(config)
    if not default_clip:
        raise NoDefaultClipError(
            "No default test clip uploaded yet — add one in Settings -> Testing."
        )
    return default_clip


def _scratch_output_path(suffix: str = ".mp4") -> Path:
    return scratch_root() / f"{uuid.uuid4().hex[:12]}{suffix}"


async def render_clipping_preview(
    *,
    media_path: Optional[str],
    session_clip_key: Optional[str],
    start_time: float,
    end_time: Optional[float],
    add_subtitles: bool,
    font_family: Optional[str],
    font_size: Optional[int],
    font_color: Optional[str],
    caption_template: str,
    output_format: str,
    keep_ranges: Optional[List[List[float]]],
    hook_title: Optional[str],
    hook_style: Optional[Dict[str, Any]],
    social_overlay: Optional[Dict[str, Any]],
    reactions: Optional[List[Dict[str, Any]]],
    cleanup_settings: Optional[Dict[str, Any]] = None,
    config: Optional[Config] = None,
) -> Path:
    source_path = resolve_preview_media_path(
        media_path=media_path, session_clip_key=session_clip_key, config=config
    )

    resolved_end_time = end_time
    if resolved_end_time is None:
        duration = await run_in_thread(ffprobe_duration, source_path)
        resolved_end_time = min(duration, start_time + 15.0)

    resolved_keep_ranges = [tuple(r) for r in keep_ranges] if keep_ranges else None
    if resolved_keep_ranges is None and cleanup_settings:
        normalized_cleanup = normalize_clip_cleanup_settings(
            cleanup_settings.get("cut_long_pauses"),
            cleanup_settings.get("pause_threshold_ms"),
            cleanup_settings.get("remove_filler_words"),
            cleanup_settings.get("filtered_words"),
            cleanup_settings.get("sensitivity"),
        )
        resolved_keep_ranges = await run_in_thread(
            build_clip_keep_ranges, source_path, start_time, resolved_end_time, normalized_cleanup
        )

    caption_words = None
    if add_subtitles and load_cached_transcript_data(source_path) is None:
        caption_words = _synthetic_caption_words(resolved_end_time - start_time)

    output_path = _scratch_output_path()
    success = await run_in_thread(
        create_optimized_clip,
        source_path,
        float(start_time),
        float(resolved_end_time),
        output_path,
        bool(add_subtitles),
        font_family,
        font_size,
        font_color,
        caption_template or "default",
        output_format or "vertical",
        resolved_keep_ranges,
        hook_title,
        hook_style,
        social_overlay,
        reactions,
        caption_words,
    )
    if not success:
        raise RuntimeError("Render failed — see backend logs for the ffmpeg error.")
    return output_path


async def render_ranking_preview(
    *,
    template_id: str,
    number_overlay: Optional[Dict[str, Any]],
    use_global_sfx: Optional[bool],
    target_width: int = 1080,
    target_height: int = 1920,
    config: Optional[Config] = None,
) -> Path:
    effective_config = config or get_config()
    template = get_template(template_id)
    effective_number_overlay = {**template["number_overlay"], **(number_overlay or {})}
    effective_use_global_sfx = (
        bool(use_global_sfx) if use_global_sfx is not None else bool(template.get("use_global_sfx", False))
    )

    inputs = [
        {
            "file_path": _stage_as_upload_ref(relative, effective_config),
            "framing": "blur_fill",
            "rank_text": f"Rank {len(_RANKING_FIXTURE_CLIPS) - idx}",
            "display_rank": len(_RANKING_FIXTURE_CLIPS) - idx,
        }
        for idx, relative in enumerate(_RANKING_FIXTURE_CLIPS)
    ]

    output_path = _scratch_output_path()
    success = await run_in_thread(
        RankingService._render_compilation,
        inputs,
        target_width,
        target_height,
        effective_number_overlay,
        False,
        -14.0,
        output_path,
        bool(template.get("list_overlay", False)),
        template.get("transition_sfx"),
        template.get("background_music"),
        template.get("background_music_volume", 0.22),
        effective_use_global_sfx,
        "blur_fill",
        None,
        None,
    )
    if not success:
        raise RuntimeError("Ranking render failed — see backend logs for the ffmpeg error.")
    return output_path
