from pathlib import Path

import pytest

from src import video_utils
from src.testing import render_preview


def test_create_optimized_clip_forwards_caption_words(tmp_path, monkeypatch):
    """The Testing tab's caption preview relies on create_optimized_clip
    passing caption_words straight through to build_assemblyai_ass_subtitles
    — this is what lets it skip the on-disk transcript cache lookup."""
    captured = {}

    def fake_builder(*args, **kwargs):
        captured["caption_words"] = kwargs.get("caption_words")
        return False  # short-circuit the rest of create_optimized_clip

    monkeypatch.setattr(video_utils, "build_assemblyai_ass_subtitles", fake_builder)
    monkeypatch.setattr(video_utils, "render_source_ranges_ffmpeg", lambda *a, **k: True)
    monkeypatch.setattr(
        video_utils, "render_reframed_clip_ffmpeg", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("stop"))
    )

    words = [{"text": "hi", "start": 0.0, "end": 0.5, "confidence": 1.0}]
    input_path = tmp_path / "clip.mp4"
    input_path.write_bytes(b"clip")

    result = video_utils.create_optimized_clip(
        input_path,
        0.0,
        2.0,
        tmp_path / "out.mp4",
        True,
        None,
        None,
        None,
        "default",
        "vertical",
        None,
        None,
        None,
        None,
        None,
        words,
    )

    assert result is False  # short-circuited deliberately, see fake render_source_ranges_ffmpeg above
    assert captured["caption_words"] == words


def test_synthetic_caption_words_span_the_requested_duration():
    words = render_preview._synthetic_caption_words(4.0)
    assert [w["text"] for w in words] == render_preview._SAMPLE_CAPTION_SENTENCE.split()
    assert words[0]["start"] == 0.0
    assert words[-1]["end"] == pytest.approx(4.0)
    # Strictly increasing, non-overlapping — required for the ASS builder's
    # per-word pop animation to look right.
    for a, b in zip(words, words[1:]):
        assert a["end"] <= b["start"] + 1e-9


def test_resolve_preview_media_path_requires_a_default_clip(tmp_path, monkeypatch):
    from src.config import Config

    config = Config()
    config.test_artifact_cache_dir = str(tmp_path / "cache")
    config.test_fixtures_dir = str(tmp_path / "fixtures")

    with pytest.raises(render_preview.NoDefaultClipError):
        render_preview.resolve_preview_media_path(
            media_path=None, session_clip_key=None, config=config
        )
