"""Stage registry — each entry wraps an existing pipeline function; none of
this reimplements pipeline logic. Stub mode is decided *before* calling into
the real module (ai.py / video_utils.py / content_policy.py / etc.), so the
real pipeline code is never touched and can't regress.

To add a new stage: write an `async def run(input_data, *, mode, config)`
function following the contract in the module docstring below, then add a
`StageSpec` entry to `STAGE_REGISTRY`.
"""

from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

from ..ai import generate_hook_title_variants, get_most_relevant_parts_by_transcript
from ..clip_cleanup import normalize_clip_cleanup_settings
from ..clip_editor import EXPORT_PRESETS
from ..config import Config
from ..content_policy import (
    DEFAULT_CATEGORIES_ENABLED,
    DEFAULT_WORD_LISTS,
    ollama_borderline_check,
    scan_text,
)
from ..metadata_generation import ClipContext, generate_metadata_for_video
from ..ranking_templates import get_template
from ..repositories.ranking_folder_repository import select_from_candidates
from ..services.ranking_service import RankingService
from ..services.video_service import VideoService
from ..utils.async_helpers import run_in_thread
from ..video_utils import build_clip_keep_ranges, create_optimized_clip, enforce_size_cap, ffprobe_duration
from .fixtures import load_fixture
from .paths import resolve_fixture_media_path, scratch_root

# Every stage `run` callable returns this shape:
#   {
#     "output": <dict>,                 required — the stage's produced result
#     "provider": <str>,                "stub" | "local" | "ollama" | "gemini" |
#                                        "assemblyai" | "whisper" | "youtube_captions" | "unavailable"
#     "raw_response": <any | None>,     best-effort raw payload, for debugging
#     "cost_hint": <dict | None>,       {"kind": "llm", "provider", "prompt_chars", "output_chars"}
#                                        or {"kind": "transcription", "duration_seconds"} — used by
#                                        runner.py to estimate cost; omitted/None means free.
#     "warnings": <list[str]>,          optional
#   }
StageRunFn = Callable[[Dict[str, Any], str, Config], Awaitable[Dict[str, Any]]]


@dataclass
class StageSpec:
    id: str
    tool: str  # "clipping" | "ranking"
    name: str
    description: str
    external_service: Optional[str]  # None for pure-local stages
    input_shape: Dict[str, str]
    output_shape: Dict[str, str]
    run: StageRunFn
    fixture_stub_supported: bool = field(default=False)


def _media_path(input_data: Dict[str, Any]) -> Path:
    relative = input_data.get("media_path")
    if not relative:
        raise ValueError("media_path is required")
    return resolve_fixture_media_path(relative)


def _scratch_output_path(suffix: str = ".mp4") -> Path:
    return scratch_root() / f"{uuid.uuid4().hex[:12]}{suffix}"


def _stage_as_upload_ref(fixture_media_path: str, config: Config) -> str:
    """`VideoService.resolve_local_video_path`/`RankingService._render_compilation`
    only resolve `upload://<filename>` references (against `temp_dir/uploads/`) —
    they never accept a raw filesystem path. Copy the fixture file in under a
    unique name (never collides with a real upload) so ranking's render stage
    can reuse the real resolution code path unchanged."""
    source = resolve_fixture_media_path(fixture_media_path, config)
    uploads_dir = Path(config.temp_dir) / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    staged_name = f"testing_{uuid.uuid4().hex[:12]}{source.suffix}"
    shutil.copyfile(source, uploads_dir / staged_name)
    return f"upload://{staged_name}"


# --------------------------------------------------------------------------
# Clipping stages
# --------------------------------------------------------------------------


async def _run_upload(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    path = _media_path(input_data)
    duration = await run_in_thread(VideoService._get_file_duration, path)
    return {
        "output": {
            "resolved_path": str(path),
            "duration_seconds": duration,
            "size_bytes": path.stat().st_size,
        },
        "provider": "local",
        "raw_response": None,
        "cost_hint": None,
    }


async def _run_transcribe(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    path = _media_path(input_data)
    if mode == "stub":
        fixture_name = input_data.get("fixture_name", "default")
        fixture = load_fixture("clipping", "transcribe", fixture_name)
        return {
            "output": fixture.get("output", {}),
            "provider": "stub",
            "raw_response": fixture.get("output"),
            "cost_hint": None,
        }

    duration = await run_in_thread(VideoService._get_file_duration, path)
    transcript = await VideoService.generate_transcript(
        path, processing_mode=input_data.get("processing_mode", "fast")
    )
    return {
        "output": {"transcript": transcript},
        "provider": config.transcription_provider,
        "raw_response": {"transcript": transcript},
        "cost_hint": (
            {"kind": "transcription", "duration_seconds": duration}
            if config.transcription_provider == "assemblyai"
            else None
        ),
    }


async def _run_detect_clips(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    if mode == "stub":
        fixture_name = input_data.get("fixture_name", "default")
        fixture = load_fixture("clipping", "detect_clips", fixture_name)
        return {
            "output": fixture.get("output", {}),
            "provider": "stub",
            "raw_response": fixture.get("output"),
            "cost_hint": None,
        }

    transcript = input_data.get("transcript") or ""
    if not transcript.strip():
        raise ValueError("transcript is required")
    result = await get_most_relevant_parts_by_transcript(
        transcript,
        clip_signals=input_data.get("clip_signals"),
        max_segments=int(input_data.get("max_clips") or 5),
        target_duration_seconds=input_data.get("target_duration_seconds"),
    )
    output = result.model_dump()
    provider = (config.llm or "").split(":", 1)[0] or "unavailable"
    output_chars = len(str(output))
    return {
        "output": output,
        "provider": provider,
        "raw_response": output,
        "cost_hint": {
            "kind": "llm",
            "provider": provider,
            "prompt_chars": len(transcript),
            "output_chars": output_chars,
        },
    }


async def _run_generate_metadata(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    clips_input = input_data.get("clips") or []
    if mode == "stub":
        fixture_name = input_data.get("fixture_name", "default")
        fixture = load_fixture("clipping", "generate_metadata", fixture_name)
        return {
            "output": fixture.get("output", {}),
            "provider": "stub",
            "raw_response": fixture.get("output"),
            "cost_hint": None,
        }

    contexts = [
        ClipContext(clip_id=c["clip_id"], text=c.get("text", ""), hook_title=c.get("hook_title"))
        for c in clips_input
    ]
    results, provider = await generate_metadata_for_video(
        contexts,
        video_title=input_data.get("video_title"),
        allow_gemini=True,
    )
    output = {clip_id: meta.model_dump() for clip_id, meta in results.items()}
    prompt_chars = sum(len(c.get("text", "")) for c in clips_input)
    return {
        "output": output,
        "provider": provider,
        "raw_response": output,
        "cost_hint": (
            {
                "kind": "llm",
                "provider": provider,
                "prompt_chars": prompt_chars,
                "output_chars": len(str(output)),
            }
            if provider != "unavailable"
            else None
        ),
    }


async def _run_policy_check(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    text = input_data.get("text") or ""
    sensitivity = input_data.get("sensitivity", "medium")
    categories_enabled = input_data.get("categories_enabled") or DEFAULT_CATEGORIES_ENABLED
    flags = scan_text(text, DEFAULT_WORD_LISTS, sensitivity, categories_enabled)

    use_llm = bool(input_data.get("use_llm_borderline"))
    borderline_phrases: List[str] = []
    provider = "local"
    cost_hint = None
    if use_llm:
        if mode == "stub":
            fixture_name = input_data.get("fixture_name", "default")
            fixture = load_fixture("clipping", "policy_check", fixture_name)
            borderline_phrases = (fixture.get("output") or {}).get("borderline_phrases", [])
            provider = "stub"
        else:
            borderline_phrases = await ollama_borderline_check(text, allow_gemini=True)
            provider = (config.llm or "").split(":", 1)[0] if borderline_phrases else "unavailable"
            cost_hint = (
                {"kind": "llm", "provider": provider, "prompt_chars": len(text), "output_chars": 64}
                if borderline_phrases
                else None
            )
        for phrase in borderline_phrases:
            idx = text.lower().find(phrase.lower())
            if idx == -1:
                continue
            flags.append(
                {
                    "word": text[idx : idx + len(phrase)],
                    "category": "borderline",
                    "start": idx,
                    "end": idx + len(phrase),
                    "severity": "borderline",
                    "source": "llm",
                }
            )
        flags.sort(key=lambda f: f["start"])

    return {
        "output": {"flags": flags, "borderline_phrases": borderline_phrases},
        "provider": provider,
        "raw_response": {"flags": flags},
        "cost_hint": cost_hint,
    }


async def _run_generate_hooks(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    if mode == "stub":
        fixture_name = input_data.get("fixture_name", "default")
        fixture = load_fixture("clipping", "generate_hooks", fixture_name)
        return {
            "output": fixture.get("output", {}),
            "provider": "stub",
            "raw_response": fixture.get("output"),
            "cost_hint": None,
        }

    clip_text = input_data.get("clip_text") or ""
    variants = await generate_hook_title_variants(
        clip_text,
        input_data.get("current_hook_title"),
        input_data.get("hook_type"),
        count=int(input_data.get("count") or 3),
    )
    provider = (config.llm or "").split(":", 1)[0] or "unavailable"
    return {
        "output": {"variants": variants},
        "provider": provider,
        "raw_response": {"variants": variants},
        "cost_hint": {
            "kind": "llm",
            "provider": provider,
            "prompt_chars": len(clip_text),
            "output_chars": sum(len(v) for v in variants),
        },
    }


async def _run_cut_silence(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    path = _media_path(input_data)
    cleanup_settings = normalize_clip_cleanup_settings(
        input_data.get("cut_long_pauses", False),
        input_data.get("pause_threshold_ms", 900),
        input_data.get("remove_filler_words", False),
        input_data.get("filtered_words"),
        input_data.get("sensitivity"),
    )
    clip_start = float(input_data.get("clip_start", 0.0))
    clip_end = float(input_data.get("clip_end", 0.0))
    keep_ranges = await run_in_thread(
        build_clip_keep_ranges, path, clip_start, clip_end, cleanup_settings
    )
    kept_duration = sum(end - start for start, end in keep_ranges)
    return {
        "output": {
            "cleanup_settings": cleanup_settings,
            "keep_ranges": keep_ranges,
            "original_duration": clip_end - clip_start,
            "kept_duration": kept_duration,
        },
        "provider": "local",
        "raw_response": None,
        "cost_hint": None,
    }


async def _run_render(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    path = _media_path(input_data)
    output_path = _scratch_output_path()
    success = await run_in_thread(
        create_optimized_clip,
        path,
        float(input_data.get("start_time", 0.0)),
        float(input_data.get("end_time", 0.0)),
        output_path,
        bool(input_data.get("add_subtitles", True)),
        input_data.get("font_family"),
        input_data.get("font_size"),
        input_data.get("font_color"),
        input_data.get("caption_template", "default"),
        input_data.get("output_format", "vertical"),
        input_data.get("keep_ranges"),
        input_data.get("hook_title"),
        input_data.get("hook_style"),
        input_data.get("social_overlay"),
        input_data.get("reactions"),
    )
    output = {"success": success, "output_path": str(output_path) if success else None}
    if success:
        output["size_bytes"] = output_path.stat().st_size
    return {"output": output, "provider": "local", "raw_response": None, "cost_hint": None}


async def _run_export(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    path = _media_path(input_data)
    preset_name = input_data.get("preset", "tiktok")
    preset = EXPORT_PRESETS.get(preset_name)
    if preset is None:
        raise ValueError(f"Unknown export preset: {preset_name}")

    scratch_copy = _scratch_output_path()
    shutil.copyfile(path, scratch_copy)
    size_before = scratch_copy.stat().st_size
    target_bytes = int(input_data.get("target_bytes") or 300_000_000)
    reencoded = await run_in_thread(enforce_size_cap, scratch_copy, target_bytes)
    size_after = scratch_copy.stat().st_size
    return {
        "output": {
            "preset": preset_name,
            "preset_params": {
                "width": preset.width,
                "height": preset.height,
                "video_bitrate": preset.video_bitrate,
                "audio_bitrate": preset.audio_bitrate,
                "max_duration_seconds": preset.max_duration_seconds,
                "target_lufs": preset.target_lufs,
            },
            "reencoded_for_size": reencoded,
            "size_before_bytes": size_before,
            "size_after_bytes": size_after,
            "output_path": str(scratch_copy),
        },
        "provider": "local",
        "raw_response": None,
        "cost_hint": None,
    }


# --------------------------------------------------------------------------
# Ranking stages
# --------------------------------------------------------------------------


async def _run_folder_scan(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    import hashlib

    path = _media_path(input_data)
    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            hasher.update(chunk)
    duration = await run_in_thread(ffprobe_duration, path)
    return {
        "output": {
            "content_hash": hasher.hexdigest(),
            "original_filename": input_data.get("original_filename", path.name),
            "duration_seconds": duration,
        },
        "provider": "local",
        "raw_response": None,
        "cost_hint": None,
    }


async def _run_select_clips(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    clips = input_data.get("clips") or []
    count = int(input_data.get("count") or 5)
    selected = select_from_candidates(list(clips), count)
    return {
        "output": {"selected": selected, "selected_ids": [c.get("id") for c in selected]},
        "provider": "local",
        "raw_response": None,
        "cost_hint": None,
    }


async def _run_text_memory(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    """Mirrors `PATCH /ranking/tasks/{id}/inputs/{id}/text`'s pure merge rule
    (api/routes/ranking.py::set_ranking_input_text) without touching the
    real `ranking_folder_clips` table."""
    rank_text = (input_data.get("rank_text") or "").strip()
    folder_clip_id = input_data.get("folder_clip_id")
    input_rank_text = rank_text or None
    mirror_to_folder = bool(folder_clip_id and rank_text)
    return {
        "output": {
            "input_rank_text": input_rank_text,
            "mirror_to_folder": mirror_to_folder,
            "folder_saved_text": rank_text if mirror_to_folder else None,
        },
        "provider": "local",
        "raw_response": None,
        "cost_hint": None,
    }


async def _run_ranking_render(input_data: Dict[str, Any], *, mode: str, config: Config) -> Dict[str, Any]:
    inputs = input_data.get("inputs") or []
    if len(inputs) < 2:
        raise ValueError("Ranking render needs at least 2 inputs")

    resolved_inputs = []
    for idx, item in enumerate(inputs):
        upload_ref = _stage_as_upload_ref(item["media_path"], config)
        resolved_inputs.append(
            {
                "file_path": upload_ref,
                "framing": item.get("framing", "blur_fill"),
                "rank_text": item.get("rank_text", ""),
                "display_rank": item.get("display_rank", idx + 1),
            }
        )

    template_id = input_data.get("template_id", "rapid_fire")
    template = get_template(template_id)
    number_overlay = {**template["number_overlay"], **(input_data.get("number_overlay") or {})}
    output_path = _scratch_output_path()

    success = await run_in_thread(
        RankingService._render_compilation,
        resolved_inputs,
        int(input_data.get("target_width", 1080)),
        int(input_data.get("target_height", 1920)),
        number_overlay,
        False,
        float(input_data.get("target_lufs", -14.0)),
        output_path,
        template.get("list_overlay", False),
        None,
        None,
        0.22,
        bool(template.get("use_global_sfx", False)),
        input_data.get("default_framing", "blur_fill"),
        input_data.get("hook_white"),
        input_data.get("hook_red"),
    )
    output = {"success": success, "output_path": str(output_path) if success else None}
    if success:
        output["size_bytes"] = output_path.stat().st_size
    return {"output": output, "provider": "local", "raw_response": None, "cost_hint": None}


# --------------------------------------------------------------------------
# Registry
# --------------------------------------------------------------------------

def stage_key(tool: str, stage_id: str) -> str:
    return f"{tool}.{stage_id}"


# Keyed by "tool.stage_id" ("clipping.render" vs "ranking.render" both exist).
STAGE_REGISTRY: Dict[str, StageSpec] = {}


def _register(spec: StageSpec) -> None:
    STAGE_REGISTRY[stage_key(spec.tool, spec.id)] = spec


_register(
    StageSpec(
        id="upload",
        tool="clipping",
        name="Upload",
        description="Resolve a source file and report its duration/size (stand-in for a real upload).",
        external_service=None,
        input_shape={"media_path": "string (fixture-relative path)"},
        output_shape={"resolved_path": "string", "duration_seconds": "float", "size_bytes": "int"},
        run=_run_upload,
    )
)
_register(
    StageSpec(
        id="transcribe",
        tool="clipping",
        name="Transcribe",
        description="Generate a transcript for a source video (AssemblyAI/Whisper/YouTube captions).",
        external_service="assemblyai",
        input_shape={"media_path": "string", "processing_mode": "'fast'|'balanced' (optional)"},
        output_shape={"transcript": "string"},
        run=_run_transcribe,
        fixture_stub_supported=True,
    )
)
_register(
    StageSpec(
        id="detect_clips",
        tool="clipping",
        name="Detect Clips",
        description="AI segment selection with virality scoring and hook titles.",
        external_service="llm",
        input_shape={
            "transcript": "string",
            "max_clips": "int (optional)",
            "target_duration_seconds": "int (optional)",
            "clip_signals": "string (optional)",
        },
        output_shape={"most_relevant_segments": "list", "summary": "string", "key_topics": "list"},
        run=_run_detect_clips,
        fixture_stub_supported=True,
    )
)
_register(
    StageSpec(
        id="generate_metadata",
        tool="clipping",
        name="Generate Metadata",
        description="Title/description/tags for a batch of clips, one LLM call per video.",
        external_service="llm",
        input_shape={
            "clips": "list of {clip_id, text, hook_title?}",
            "video_title": "string (optional)",
        },
        output_shape={"<clip_id>": "{title, description, tags}"},
        run=_run_generate_metadata,
        fixture_stub_supported=True,
    )
)
_register(
    StageSpec(
        id="policy_check",
        tool="clipping",
        name="Policy Check",
        description="Regex word-list scan (always free/local) plus an optional LLM borderline-phrase pass.",
        external_service="llm",
        input_shape={
            "text": "string",
            "sensitivity": "'off'|'low'|'medium'|'high'",
            "categories_enabled": "dict (optional)",
            "use_llm_borderline": "bool (optional)",
        },
        output_shape={"flags": "list", "borderline_phrases": "list"},
        run=_run_policy_check,
        fixture_stub_supported=True,
    )
)
_register(
    StageSpec(
        id="generate_hooks",
        tool="clipping",
        name="Generate Hooks",
        description="Alternative on-screen hook titles for A/B comparison.",
        external_service="llm",
        input_shape={
            "clip_text": "string",
            "current_hook_title": "string (optional)",
            "hook_type": "string (optional)",
            "count": "int (optional)",
        },
        output_shape={"variants": "list[string]"},
        run=_run_generate_hooks,
        fixture_stub_supported=True,
    )
)
_register(
    StageSpec(
        id="cut_silence",
        tool="clipping",
        name="Cut Silence",
        description="Pause/filler-word cut-range computation (sensitivity slider).",
        external_service=None,
        input_shape={
            "media_path": "string",
            "clip_start": "float",
            "clip_end": "float",
            "sensitivity": "int 0-100 (optional)",
        },
        output_shape={"keep_ranges": "list[[start, end]]", "kept_duration": "float"},
        run=_run_cut_silence,
    )
)
_register(
    StageSpec(
        id="render",
        tool="clipping",
        name="Render Clip",
        description=(
            "Cut+captions+hook+overlays in one ffmpeg pass (this is one stage, not three, "
            "because create_optimized_clip already burns them together) — toggle add_subtitles/"
            "hook_title/reactions/social_overlay to isolate a single visual layer."
        ),
        external_service=None,
        input_shape={
            "media_path": "string",
            "start_time": "float",
            "end_time": "float",
            "add_subtitles": "bool",
            "hook_title": "string (optional)",
            "reactions": "list (optional)",
            "social_overlay": "dict (optional)",
        },
        output_shape={"success": "bool", "output_path": "string"},
        run=_run_render,
    )
)
_register(
    StageSpec(
        id="export",
        tool="clipping",
        name="Export",
        description="Size-cap re-encode (enforce_size_cap) against an export preset's parameters.",
        external_service=None,
        input_shape={"media_path": "string", "preset": "one of EXPORT_PRESETS keys"},
        output_shape={"reencoded_for_size": "bool", "size_before_bytes": "int", "size_after_bytes": "int"},
        run=_run_export,
    )
)
_register(
    StageSpec(
        id="folder_scan",
        tool="ranking",
        name="Folder Scan",
        description="Hash+probe a file the way POST /ranking/folders/scan does, without writing to a real folder.",
        external_service=None,
        input_shape={"media_path": "string", "original_filename": "string (optional)"},
        output_shape={"content_hash": "string", "duration_seconds": "float"},
        run=_run_folder_scan,
    )
)
_register(
    StageSpec(
        id="select_clips",
        tool="ranking",
        name="Select Clips",
        description="Prefer-unused random selection algorithm, run against a fixture clip list (no DB).",
        external_service=None,
        input_shape={"clips": "list of {id, use_count}", "count": "int (optional, default 5)"},
        output_shape={"selected": "list", "selected_ids": "list[string]"},
        run=_run_select_clips,
    )
)
_register(
    StageSpec(
        id="text_memory",
        tool="ranking",
        name="Text Memory",
        description="The saved-text mirror rule (input's rank_text <-> folder library's saved_text), pure.",
        external_service=None,
        input_shape={"rank_text": "string", "folder_clip_id": "string (optional)"},
        output_shape={"input_rank_text": "string|null", "mirror_to_folder": "bool"},
        run=_run_text_memory,
    )
)
_register(
    StageSpec(
        id="render",
        tool="ranking",
        name="Render Compilation",
        description="Concat N fixture input videos into one ranked compilation via RankingService._render_compilation.",
        external_service=None,
        input_shape={
            "inputs": "list of {media_path, framing?, rank_text?, display_rank?} (>=2)",
            "template_id": "one of the ranking templates (default rapid_fire)",
        },
        output_shape={"success": "bool", "output_path": "string"},
        run=_run_ranking_render,
    )
)


