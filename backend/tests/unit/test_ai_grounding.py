from src.ai import (
    _extract_transcript_text,
    _extract_transcript_text_for_segment,
    _largest_ungrounded_gap_seconds,
    _MAX_UNGROUNDED_GAP_SECONDS,
    _parse_transcript_lines,
    _parse_transcript_spans,
)


def test_extract_transcript_text_for_segment_strips_speaker_labels_and_joins_lines():
    transcript = "\n".join(
        [
            "[00:00 - 00:10] Speaker A: First sentence.",
            "[00:10 - 00:20] Speaker A: Second sentence.",
        ]
    )

    transcript_lines = _parse_transcript_lines(transcript)
    grounded_text = _extract_transcript_text_for_segment(
        transcript_lines,
        "00:00",
        "00:20",
    )

    assert grounded_text == "First sentence. Second sentence."


def test_extract_transcript_text_for_segment_rejects_non_boundary_timestamp():
    transcript = "[00:00 - 00:10] Speaker A: First sentence."

    transcript_lines = _parse_transcript_lines(transcript)

    assert (
        _extract_transcript_text_for_segment(transcript_lines, "00:05", "00:10")
        is None
    )


def test_extract_transcript_text_falls_back_for_non_boundary_timestamp():
    """Real transcripts are short per-utterance lines; a model-chosen range
    that doesn't land exactly on a line boundary (e.g. rounds to the nearest
    few seconds) is still fully backed by real content and must not be
    treated as fabricated. _extract_transcript_text (overlap-based) is the
    fallback for exactly this case — see get_most_relevant_parts_by_transcript."""
    transcript = "\n".join(
        [
            "[05:12 - 05:15] Speaker B: I, I've done it.",
            "[05:19 - 05:35] Speaker C: I actually was on a German talk show once.",
        ]
    )

    transcript_lines = _parse_transcript_lines(transcript)
    transcript_spans = _parse_transcript_spans(transcript)

    assert (
        _extract_transcript_text_for_segment(transcript_lines, "05:15", "05:51")
        is None
    )

    grounded_text = _extract_transcript_text(transcript_spans, 5 * 60 + 15, 5 * 60 + 51)
    assert grounded_text == (
        "I actually was on a German talk show once."
    )


def test_largest_ungrounded_gap_is_small_for_the_real_rounding_case():
    """The benign case the fallback is meant to accept (same transcript as
    test_extract_transcript_text_falls_back_for_non_boundary_timestamp):
    the model's chosen range extends a bit past the last real utterance,
    but nowhere near a whole untranscribed clip's worth of dead air."""
    transcript = "\n".join(
        [
            "[05:12 - 05:15] Speaker B: I, I've done it.",
            "[05:19 - 05:35] Speaker C: I actually was on a German talk show once.",
        ]
    )
    transcript_spans = _parse_transcript_spans(transcript)

    gap = _largest_ungrounded_gap_seconds(transcript_spans, 5 * 60 + 15, 5 * 60 + 51)

    assert gap <= _MAX_UNGROUNDED_GAP_SECONDS


def test_largest_ungrounded_gap_is_large_for_a_mostly_untranscribed_range():
    """Regression test: a claimed range with only a sliver of real speech at
    each edge and a large untranscribed gap in between must not be treated
    as grounded just because _extract_transcript_text returns non-empty text
    for it (any overlap at all used to be enough)."""
    transcript = "\n".join(
        [
            "[00:00 - 00:03] Speaker A: Quick opener.",
            "[00:52 - 00:55] Speaker A: Closing line.",
        ]
    )
    transcript_spans = _parse_transcript_spans(transcript)

    gap = _largest_ungrounded_gap_seconds(transcript_spans, 0, 55)
    grounded_text = _extract_transcript_text(transcript_spans, 0, 55)

    assert grounded_text  # non-empty: the old "any overlap" check would accept this
    assert gap > _MAX_UNGROUNDED_GAP_SECONDS  # but the 49s gap is far too large to trust


def test_parse_transcript_spans_strips_speaker_labels():
    transcript = "[00:00 - 00:10] Speaker A: First sentence."

    spans = _parse_transcript_spans(transcript)

    assert spans == [{"start": 0, "end": 10, "text": "First sentence."}]
