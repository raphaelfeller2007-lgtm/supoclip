"""
Helpers for clip cleanup settings and normalization.
"""

from __future__ import annotations

from typing import Any, Optional

DEFAULT_PAUSE_THRESHOLD_MS = 900

# Pure non-lexical disfluencies: never carry meaning on their own, safe to
# remove regardless of sensitivity or which path enabled cleanup (sensitivity
# slider at any level above 0, or the legacy remove_filler_words boolean).
DEFAULT_FILTERED_WORDS = [
    "um",
    "umm",
    "uhh",
    "uh",
    "erm",
    "hmm",
    "mm",
    "mhm",
    "mm-hmm",
    "uh huh",
]

# Hedge phrases: common as filler, but unlike the pure disfluencies above they
# frequently carry real rhetorical weight ("you know, that's the whole
# point"), so they're only cut once sensitivity crosses
# _HEDGE_WORDS_SENSITIVITY_THRESHOLD rather than always-on.
HEDGE_FILTERED_WORDS = [
    "you know",
    "i mean",
    "sort of",
    "kind of",
    "kinda",
    "sorta",
    "i guess",
    "you see",
]

# Extra phrases only cut at high sensitivity — more common as filler than as
# meaningful content, but risky enough (context-dependent) that they're opt-in
# via the aggressive end of the slider rather than always-on.
AGGRESSIVE_FILTERED_WORDS = [
    "basically",
    "anyway",
    "or whatever",
    "and stuff",
    "or something",
    "like i said",
]

MIN_SENSITIVITY = 0
MAX_SENSITIVITY = 100
# Sensitivity -> pause_threshold_ms interpolation bounds. Low sensitivity only
# trims very long dead air; high sensitivity trims much shorter gaps.
# 300ms was well within the range of ordinary inter-word gaps in natural,
# unhurried speech (breaths, consonant transitions), so max sensitivity was
# misclassifying continuous speech as pauses. 600ms is comfortably above
# normal speech gaps while still much shorter than a true dead-air pause.
_SENSITIVITY_PAUSE_THRESHOLD_MS_AT_MIN = 1500
_SENSITIVITY_PAUSE_THRESHOLD_MS_AT_MAX = 600
_HEDGE_WORDS_SENSITIVITY_THRESHOLD = 40
_AGGRESSIVE_WORDS_SENSITIVITY_THRESHOLD = 75


def normalize_pause_threshold_ms(
    value: Any, default: int = DEFAULT_PAUSE_THRESHOLD_MS
) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(600, min(3000, parsed))


def normalize_filtered_words(value: Any) -> list[str]:
    if isinstance(value, str):
        raw_items = value.split(",")
    elif isinstance(value, list):
        raw_items = value
    else:
        raw_items = []

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        if not isinstance(item, str):
            continue
        cleaned = " ".join(item.strip().lower().split())
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        normalized.append(cleaned)
    return normalized


def normalize_sensitivity(value: Any) -> Optional[int]:
    """Clamp a raw sensitivity value to [0, 100], or None if not provided/invalid."""
    if value is None:
        return None
    try:
        parsed = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    return max(MIN_SENSITIVITY, min(MAX_SENSITIVITY, parsed))


def sensitivity_to_pause_threshold_ms(sensitivity: int) -> int:
    """Map 1-100 sensitivity to a pause threshold; lower threshold = more aggressive."""
    if sensitivity <= 0:
        return DEFAULT_PAUSE_THRESHOLD_MS
    high = _SENSITIVITY_PAUSE_THRESHOLD_MS_AT_MIN
    low = _SENSITIVITY_PAUSE_THRESHOLD_MS_AT_MAX
    fraction = (sensitivity - 1) / 99.0
    return int(round(high - fraction * (high - low)))


def pause_threshold_ms_to_sensitivity(pause_threshold_ms: int) -> int:
    """Inverse of sensitivity_to_pause_threshold_ms, for displaying legacy settings on the slider."""
    high = _SENSITIVITY_PAUSE_THRESHOLD_MS_AT_MIN
    low = _SENSITIVITY_PAUSE_THRESHOLD_MS_AT_MAX
    clamped = max(low, min(high, pause_threshold_ms))
    fraction = (high - clamped) / (high - low)
    return max(1, min(MAX_SENSITIVITY, int(round(1 + fraction * 99))))


def sensitivity_extra_filler_words(sensitivity: int) -> list[str]:
    extra: list[str] = []
    if sensitivity >= _HEDGE_WORDS_SENSITIVITY_THRESHOLD:
        extra.extend(HEDGE_FILTERED_WORDS)
    if sensitivity >= _AGGRESSIVE_WORDS_SENSITIVITY_THRESHOLD:
        extra.extend(AGGRESSIVE_FILTERED_WORDS)
    return extra


def normalize_clip_cleanup_settings(
    cut_long_pauses: Any = False,
    pause_threshold_ms: Any = DEFAULT_PAUSE_THRESHOLD_MS,
    remove_filler_words: Any = False,
    filtered_words: Any = None,
    sensitivity: Any = None,
) -> dict[str, Any]:
    """Normalize clip cleanup settings.

    `sensitivity` (0-100) is the primary control when present: 0 turns
    cleanup off entirely, and any value above 0 derives both the pause
    threshold and which filler-word tier to use, enabling both
    cut_long_pauses and remove_filler_words. When `sensitivity` is omitted
    (older clients/cached task metadata), the explicit booleans/threshold are
    used unchanged for full backward compatibility, and a sensitivity value
    is still returned (derived) purely for UI display.
    """
    normalized_sensitivity = normalize_sensitivity(sensitivity)
    custom_words = normalize_filtered_words(filtered_words)

    if normalized_sensitivity is not None:
        if normalized_sensitivity <= 0:
            return {
                "cut_long_pauses": False,
                "pause_threshold_ms": DEFAULT_PAUSE_THRESHOLD_MS,
                "remove_filler_words": False,
                "filtered_words": custom_words,
                "sensitivity": 0,
            }

        extra_words = sensitivity_extra_filler_words(normalized_sensitivity)
        return {
            "cut_long_pauses": True,
            "pause_threshold_ms": sensitivity_to_pause_threshold_ms(
                normalized_sensitivity
            ),
            "remove_filler_words": True,
            "filtered_words": normalize_filtered_words(extra_words + custom_words),
            "sensitivity": normalized_sensitivity,
        }

    normalized_cut_long_pauses = bool(cut_long_pauses)
    normalized_remove_filler_words = bool(remove_filler_words)
    normalized_pause_threshold_ms = normalize_pause_threshold_ms(pause_threshold_ms)

    if normalized_cut_long_pauses or normalized_remove_filler_words:
        derived_sensitivity = pause_threshold_ms_to_sensitivity(
            normalized_pause_threshold_ms
        )
    else:
        derived_sensitivity = 0

    return {
        "cut_long_pauses": normalized_cut_long_pauses,
        "pause_threshold_ms": normalized_pause_threshold_ms,
        "remove_filler_words": normalized_remove_filler_words,
        "filtered_words": custom_words,
        "sensitivity": derived_sensitivity,
    }


def renormalize_stored_cleanup_settings(settings: dict[str, Any] | None) -> dict[str, Any]:
    """Re-validate/clamp clip cleanup settings that already went through one
    normalize_clip_cleanup_settings pass (e.g. read back from Redis task
    metadata, a stored template, or a `cleanup_settings` dict handed down
    from an earlier normalize call), without treating their own echoed
    `sensitivity` display value as fresh primary input.

    normalize_clip_cleanup_settings always returns a `sensitivity` value —
    derived purely for UI display even when the caller drove cleanup via the
    explicit booleans — alongside the concrete cut_long_pauses/
    remove_filler_words/pause_threshold_ms/filtered_words fields. Feeding
    that already-normalized dict straight back into
    normalize_clip_cleanup_settings makes the echoed sensitivity
    indistinguishable from a user having freshly moved the sensitivity
    slider, which wrongly re-derives (and can silently flip) the concrete
    booleans on every re-read. Use this helper for that case; call
    normalize_clip_cleanup_settings directly only for genuinely fresh,
    top-level input (a new request body).
    """
    settings = settings or {}
    return normalize_clip_cleanup_settings(
        settings.get("cut_long_pauses"),
        settings.get("pause_threshold_ms"),
        settings.get("remove_filler_words"),
        settings.get("filtered_words"),
    )


def clip_cleanup_enabled(settings: dict[str, Any] | None) -> bool:
    if not settings:
        return False
    return bool(
        settings.get("cut_long_pauses")
        or settings.get("remove_filler_words")
        or settings.get("filtered_words")
    )
