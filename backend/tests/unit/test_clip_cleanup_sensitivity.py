from src.clip_cleanup import (
    normalize_clip_cleanup_settings,
    normalize_sensitivity,
    renormalize_stored_cleanup_settings,
    sensitivity_to_pause_threshold_ms,
    DEFAULT_PAUSE_THRESHOLD_MS,
)


def test_sensitivity_zero_disables_cleanup_entirely():
    settings = normalize_clip_cleanup_settings(sensitivity=0)
    assert settings["cut_long_pauses"] is False
    assert settings["remove_filler_words"] is False
    assert settings["sensitivity"] == 0


def test_sensitivity_enables_both_toggles_and_scales_threshold():
    low = normalize_clip_cleanup_settings(sensitivity=1)
    high = normalize_clip_cleanup_settings(sensitivity=100)

    assert low["cut_long_pauses"] is True
    assert low["remove_filler_words"] is True
    assert high["cut_long_pauses"] is True
    assert high["remove_filler_words"] is True

    # Higher sensitivity -> shorter pause threshold (cuts more eagerly).
    assert high["pause_threshold_ms"] < low["pause_threshold_ms"]


def test_sensitivity_high_adds_aggressive_filler_words():
    low = normalize_clip_cleanup_settings(sensitivity=10)
    high = normalize_clip_cleanup_settings(sensitivity=90)

    assert "basically" not in low["filtered_words"]
    assert "basically" in high["filtered_words"]


def test_sensitivity_low_does_not_add_hedge_phrases():
    """Low sensitivity should only remove pure disfluencies (handled via the
    always-on DEFAULT_FILTERED_WORDS base list in video_utils.py), not hedge
    phrases like "you know"/"i guess" that often carry real meaning."""
    low = normalize_clip_cleanup_settings(sensitivity=10)

    assert "you know" not in low["filtered_words"]
    assert "i guess" not in low["filtered_words"]


def test_sensitivity_medium_adds_hedge_phrases_but_not_aggressive():
    medium = normalize_clip_cleanup_settings(sensitivity=50)
    high = normalize_clip_cleanup_settings(sensitivity=90)

    assert "you know" in medium["filtered_words"]
    assert "i guess" in medium["filtered_words"]
    assert "basically" not in medium["filtered_words"]

    assert "you know" in high["filtered_words"]
    assert "basically" in high["filtered_words"]


def test_sensitivity_none_falls_back_to_legacy_booleans():
    """Backward compatibility: omitting sensitivity keeps the old explicit
    cut_long_pauses/pause_threshold_ms/remove_filler_words behavior."""
    settings = normalize_clip_cleanup_settings(
        cut_long_pauses=True,
        pause_threshold_ms=700,
        remove_filler_words=False,
        filtered_words=["custom phrase"],
    )
    assert settings["cut_long_pauses"] is True
    assert settings["pause_threshold_ms"] == 700
    assert settings["remove_filler_words"] is False
    assert settings["filtered_words"] == ["custom phrase"]
    # A display-only sensitivity is still derived, but doesn't change behavior.
    assert settings["sensitivity"] > 0


def test_normalize_sensitivity_clamps_and_rejects_invalid():
    assert normalize_sensitivity(None) is None
    assert normalize_sensitivity("nonsense") is None
    assert normalize_sensitivity(-5) == 0
    assert normalize_sensitivity(150) == 100
    assert normalize_sensitivity(42) == 42


def test_sensitivity_to_pause_threshold_ms_monotonic_decreasing():
    thresholds = [sensitivity_to_pause_threshold_ms(s) for s in (1, 25, 50, 75, 100)]
    assert thresholds == sorted(thresholds, reverse=True)
    assert thresholds[0] <= DEFAULT_PAUSE_THRESHOLD_MS + 600


def test_normalized_settings_are_not_idempotent_through_the_raw_function():
    """Documents the footgun renormalize_stored_cleanup_settings exists to
    avoid: feeding normalize_clip_cleanup_settings' own output straight back
    into itself treats the echoed display `sensitivity` as a fresh slider
    move and silently flips remove_filler_words on."""
    once = normalize_clip_cleanup_settings(
        cut_long_pauses=True,
        pause_threshold_ms=800,
        remove_filler_words=False,
        filtered_words=[],
    )
    assert once["remove_filler_words"] is False

    twice = normalize_clip_cleanup_settings(**once)
    assert twice["remove_filler_words"] is True  # the bug, reproduced directly


def test_renormalize_stored_cleanup_settings_is_idempotent():
    """The fix: re-validating already-normalized settings must preserve the
    explicit booleans instead of re-deriving them from the echoed
    sensitivity — this is what every internal re-read (resume, templates,
    regenerate) must use instead of calling normalize_clip_cleanup_settings
    directly on stored data."""
    once = normalize_clip_cleanup_settings(
        cut_long_pauses=True,
        pause_threshold_ms=800,
        remove_filler_words=False,
        filtered_words=[],
    )
    twice = renormalize_stored_cleanup_settings(once)

    assert twice["cut_long_pauses"] is True
    assert twice["remove_filler_words"] is False
    assert twice["pause_threshold_ms"] == 800
    assert twice["filtered_words"] == []

    # Stable under further re-reads too.
    thrice = renormalize_stored_cleanup_settings(twice)
    assert thrice == twice


def test_renormalize_stored_cleanup_settings_handles_sensitivity_driven_input():
    """A settings dict genuinely produced via the sensitivity slider should
    also survive a re-read unchanged (it's already fully resolved into
    concrete booleans/threshold/filtered_words by the first normalize)."""
    once = normalize_clip_cleanup_settings(sensitivity=90)
    twice = renormalize_stored_cleanup_settings(once)
    assert twice == once
