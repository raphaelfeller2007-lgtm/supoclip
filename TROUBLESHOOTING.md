# Troubleshooting (Dev-Session Cache)

Real issues hit and diagnosed during development — not a user-facing runbook
(that's [docs/troubleshooting.md](docs/troubleshooting.md), for docker/env/
service-startup problems). Add an entry here only after actually hitting and
diagnosing something; don't pre-fill hypotheticals.

## Ollama returns malformed/schema-invalid JSON
Cause: Small local models (`llama3.2:3b`, `gemma2:2b`) don't always follow structured-output instructions reliably.
Fix: Already handled — `ai.py::run_with_llm_fallback` retries once with a stricter prompt on JSON/schema failure before falling back to Gemini (if configured). If it's still happening, prefer a bigger model (`qwen2.5:7b-instruct`) via `OLLAMA_MODEL`.

## Ollama inference and video rendering compete for VRAM
Cause: Both use the same GPU; running them concurrently can OOM or slow both down.
Fix: Already handled — `workers/resource_locks.py`'s `"gpu"` Redis semaphore serializes Ollama calls and ffmpeg renders (max 1 concurrent). If you add a new render or LLM call site, it must acquire this slot too, or the problem comes back.

## Emoji reactions render monochrome / don't render at all in captions
Cause: This project's ffmpeg/libass build cannot render color emoji glyphs through the `subtitles`/`ass` filter — confirmed directly, not a missing-font issue. Don't try bundling a different emoji font for that filter, it won't help.
Fix: Nothing renders emoji as ASS text through the `subtitles` filter anymore. Emoji reactions are burned as true-color PNG image overlays (`emoji_reactions.py::overlay_emoji_reactions_ffmpeg`). Caption keyword-emoji (the word-triggered emoji next to e.g. "money"/"fire") are rendered the same way as hook-title emoji: `build_assemblyai_ass_subtitles`'s caption-chunk loop in `video_utils.py` picks the first `emoji_by_idx` match per chunk, renders it via `render_emoji_cluster_png`, and appends it to `hook_image_overlays_out` (shared with the hook's own trailing emoji — one combined `overlay_image_overlays_ffmpeg` pass per clip, see `create_optimized_clip`). `emoji_rendering_supported()`'s probe result no longer gates whether caption emoji get annotated — it was only ever relevant to the (now unused) ASS-text path.

## Hook-title / ranking-list emoji render monochrome or don't render at all
Cause: Different bug from the caption/reaction one above. `video_utils.py::render_emoji_cluster_png` (used for hook-title and ranking-list emoji, `emoji_reactions.py` is not involved here) renders through Pillow directly, not the `subtitles` filter — that path genuinely can do full-colour glyphs. But `_emoji_font_path()` located the font via `fc-match -f %{file} "Noto Color Emoji"` and trusted whatever path came back. `fc-match` always returns *some* substitute font even when "Noto Color Emoji" isn't installed (that's what fontconfig fallback matching does), so Pillow was drawing emoji through a generic non-colour font: a monochrome outline glyph at codepoints the substitute happens to define, or nothing (empty bbox) at codepoints it doesn't. `fonts-noto-color-emoji` was also never installed in `backend/Dockerfile`, so this fired on every clip.
Fix: `_emoji_font_path()` now also checks `fc-match`'s reported family name against a known-colour-emoji allowlist (`_COLOR_EMOJI_FAMILIES`) and only trusts the match if it's actually one of those — otherwise it returns `None` and the overlay is skipped (same graceful degradation as before, just no more silent monochrome fallback). `fonts-noto-color-emoji` was added to `backend/Dockerfile` so there's a real colour font to match in the first place. Rebuild the backend image (`docker compose up -d --build backend`) to pick this up.

## Cuts happening on continuous/normal speech (not real pauses)
Cause: The old max-sensitivity pause threshold (300ms) fell inside the range of ordinary inter-word gaps in natural speech, and raw gap-length cutting had no sentence-boundary check.
Fix: Already handled — floor raised to 600ms (`clip_cleanup.py::_SENSITIVITY_PAUSE_THRESHOLD_MS_AT_MAX`), and `video_utils.py::_pause_gap_is_safe_to_cut` requires a sentence/phrase-ending word before cutting any gap under 1.2s. If it recurs, check whether a new call site bypassed `build_clip_keep_ranges`.

## Metadata not generating automatically
Cause: Either `AUTO_GENERATE_METADATA_ENABLED` is off, or metadata generation raised and was silently swallowed — `TaskService.process_task`'s metadata step wraps the whole call in `except Exception: logger.warning(...)` so a metadata failure never fails the task.
Fix: Check the runtime setting first, then check backend logs for `"Metadata generation failed for task %s"`. Use the per-project "Regenerate Metadata" button as a manual retry — it doesn't depend on the auto-generate setting.

## Safe zones not appearing in an exported/downloaded clip
Cause: This is correct behavior, not a bug — the Safe Zone Overlay is a frontend-only preview (`pointer-events-none` SVG over the `<video>` element). It never reaches ffmpeg and is never burned into any render.
Fix: N/A. If a user wants zones baked into the actual video frame, that would be a new feature request, not a fix.

## GPU acceleration toggle shows disabled despite having a supported GPU
Cause: `detect_gpu_encoder()` doesn't trust the saved setting or ffmpeg's compiled-encoder list — it always re-verifies with a real trivial NVENC encode attempt, which fails for driver/permission/container-passthrough reasons independent of the setting.
Fix: Check the `disabled_reason` shown in the admin settings UI (`_setting_status`'s field) for the actual failure, not just "GPU not detected." Common cause in Docker: NVIDIA runtime/driver not passed into the container.
