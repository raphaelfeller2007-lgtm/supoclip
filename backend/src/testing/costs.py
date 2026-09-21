"""Rough, clearly-labeled cost estimates for real-mode stage runs.

None of these APIs return exact billed cost in their responses, so every
number here is an estimate against a static price table — good enough to
warn a developer before they spend money, not a billing reconciliation tool.
Edit this table as pricing changes; nothing else needs to change with it.
"""

from __future__ import annotations

from typing import Optional

# $ per minute of audio transcribed.
ASSEMBLYAI_COST_PER_MINUTE = 0.0065

# $ per 1,000 tokens (input+output combined, which is close enough for an
# estimate given these calls' outputs are short/structured).
LLM_COST_PER_1K_TOKENS = {
    "ollama": 0.0,  # local inference, no per-call cost
    "gemini": 0.00015,
    "openai": 0.0025,
    "anthropic": 0.003,
}

# `Config.llm`'s provider prefix ("google-gla:gemini-...", per pydantic-ai's
# naming) doesn't match `run_with_llm_fallback`'s returned provider string
# ("gemini") — both are surfaced as `provider` by different stages, so both
# need to resolve to the same price-table entry.
_PROVIDER_ALIASES = {"google-gla": "gemini", "google": "gemini"}

# Rough chars-per-token used when a provider doesn't return a token count.
_CHARS_PER_TOKEN_ESTIMATE = 4


def estimate_llm_cost(provider: str, prompt_chars: int, output_chars: int) -> float:
    provider = _PROVIDER_ALIASES.get(provider, provider)
    per_1k = LLM_COST_PER_1K_TOKENS.get(provider, 0.0)
    if per_1k == 0.0:
        return 0.0
    estimated_tokens = (prompt_chars + output_chars) / _CHARS_PER_TOKEN_ESTIMATE
    return round((estimated_tokens / 1000) * per_1k, 6)


def estimate_transcription_cost(duration_seconds: Optional[float]) -> float:
    if not duration_seconds:
        return 0.0
    return round((duration_seconds / 60.0) * ASSEMBLYAI_COST_PER_MINUTE, 6)
