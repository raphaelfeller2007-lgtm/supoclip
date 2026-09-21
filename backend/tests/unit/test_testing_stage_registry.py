"""Testing tab stage registry: stub mode must never call a real external
service; local stages must run for real and produce sane output. Mirrors
the mocking convention in test_metadata_generation.py (patch the function at
its call site with AsyncMock)."""

from unittest.mock import AsyncMock, patch

import pytest

from src.testing.runner import run_stage
from src.testing.stages import STAGE_REGISTRY


def _raise_if_called(*_args, **_kwargs):
    raise AssertionError("stub mode must not call the real external service")


async def test_transcribe_stub_never_calls_generate_transcript():
    with patch(
        "src.testing.stages.VideoService.generate_transcript",
        new=AsyncMock(side_effect=_raise_if_called),
    ):
        result = await run_stage(
            "clipping",
            "transcribe",
            {"media_path": "clipping/media/sample.mp4", "fixture_name": "default"},
            mode="stub",
        )
    assert result.error is None
    assert result.provider == "stub"
    assert "transcript" in result.output


async def test_detect_clips_stub_never_calls_the_llm():
    with patch(
        "src.testing.stages.get_most_relevant_parts_by_transcript",
        new=AsyncMock(side_effect=_raise_if_called),
    ):
        result = await run_stage(
            "clipping",
            "detect_clips",
            {"transcript": "irrelevant", "fixture_name": "default"},
            mode="stub",
        )
    assert result.error is None
    assert result.provider == "stub"
    assert len(result.output["most_relevant_segments"]) == 2


async def test_generate_metadata_stub_never_calls_the_llm():
    with patch(
        "src.testing.stages.generate_metadata_for_video",
        new=AsyncMock(side_effect=_raise_if_called),
    ):
        result = await run_stage(
            "clipping",
            "generate_metadata",
            {"clips": [{"clip_id": "clip-1", "text": "x"}], "fixture_name": "default"},
            mode="stub",
        )
    assert result.error is None
    assert result.provider == "stub"


async def test_generate_hooks_stub_never_calls_the_llm():
    with patch(
        "src.testing.stages.generate_hook_title_variants",
        new=AsyncMock(side_effect=_raise_if_called),
    ):
        result = await run_stage(
            "clipping",
            "generate_hooks",
            {"clip_text": "x", "fixture_name": "default"},
            mode="stub",
        )
    assert result.error is None
    assert result.provider == "stub"
    assert len(result.output["variants"]) == 3


async def test_policy_check_llm_pass_stub_never_calls_ollama():
    with patch(
        "src.testing.stages.ollama_borderline_check",
        new=AsyncMock(side_effect=_raise_if_called),
    ):
        result = await run_stage(
            "clipping",
            "policy_check",
            {
                "text": "we were so blazed at that party",
                "sensitivity": "high",
                "use_llm_borderline": True,
                "fixture_name": "borderline_phrase",
            },
            mode="stub",
        )
    assert result.error is None
    assert "blazed" in result.output["borderline_phrases"]
    # the always-free regex pass still ran and found the severe-tier hit too
    assert any(f["source"] == "regex" for f in result.output["flags"])


async def test_local_stage_ignores_mode_and_always_runs_for_real():
    """Local stages (no external_service) have no stub concept — passing
    mode="stub" must still execute the real (free) local computation."""
    result = await run_stage(
        "clipping",
        "upload",
        {"media_path": "clipping/media/sample.mp4"},
        mode="stub",
    )
    assert result.error is None
    assert result.provider == "local"
    assert result.output["size_bytes"] > 0


async def test_cut_silence_cuts_the_pauses_in_the_bundled_fixture():
    result = await run_stage(
        "clipping",
        "cut_silence",
        {
            "media_path": "clipping/media/sample.mp4",
            "clip_start": 0,
            "clip_end": 6,
            "sensitivity": 90,
        },
        mode="real",
    )
    assert result.error is None
    assert result.output["kept_duration"] < result.output["original_duration"]


async def test_ranking_select_clips_prefers_unused():
    clips = [{"id": f"c{i}", "use_count": 0 if i < 4 else 1} for i in range(8)]
    result = await run_stage(
        "ranking", "select_clips", {"clips": clips, "count": 5}, mode="real"
    )
    assert result.error is None
    selected_ids = set(result.output["selected_ids"])
    zero_use_ids = {f"c{i}" for i in range(4)}
    assert zero_use_ids.issubset(selected_ids)


async def test_ranking_text_memory_merge_rule():
    result = await run_stage(
        "ranking",
        "text_memory",
        {"rank_text": "  hello  ", "folder_clip_id": "fc1"},
        mode="real",
    )
    assert result.error is None
    assert result.output == {
        "input_rank_text": "hello",
        "mirror_to_folder": True,
        "folder_saved_text": "hello",
    }


async def test_unknown_stage_reports_a_clean_error_not_a_crash():
    result = await run_stage("clipping", "does_not_exist", {}, mode="stub")
    assert result.error is not None
    assert result.provider == "error"


def test_stage_registry_covers_both_tools():
    tools = {spec.tool for spec in STAGE_REGISTRY.values()}
    assert tools == {"clipping", "ranking"}
    assert len(STAGE_REGISTRY) == 13
