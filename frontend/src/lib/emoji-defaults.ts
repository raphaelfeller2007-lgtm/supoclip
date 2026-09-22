// Mirrors backend/src/emoji_reactions.py's REACTION_ANIMATIONS and the
// per-reaction position/duration fields on generated_clips.reactions — see
// frontend/src/app/(clipping)/tasks/[id]/edit/page.tsx's ClipReaction.
export type EmojiAnimationStyle = "fade_pop" | "fade" | "slide_down" | "zoom_punch" | "bounce" | "pulse" | "none";

export const EMOJI_ANIMATION_STYLES: EmojiAnimationStyle[] = [
  "fade_pop",
  "fade",
  "slide_down",
  "zoom_punch",
  "bounce",
  "pulse",
  "none",
];

// Position is 0-100 (percent) here, matching ClipReaction.position's
// existing in-memory convention in edit/page.tsx — the backend's
// project_templates JSON stores 0-1 fractions instead (same convention
// backend/src/emoji_reactions.py's per-reaction position uses), so convert
// at the API boundary (÷100 sending, ×100 loading) exactly like
// edit/page.tsx already does for a single reaction's position.
export type EmojiDefaults = {
  default_animation_style: EmojiAnimationStyle;
  default_duration_seconds: number;
  default_position: { x_pct: number; y_pct: number };
};

// There is no per-project emoji concept anywhere else in the codebase yet —
// this is the first one (see backend/src/api/routes/templates.py's "emoji"
// section). It only pre-fills newly added reactions; it never rewrites
// reactions that already exist.
export const DEFAULT_EMOJI_DEFAULTS: EmojiDefaults = {
  default_animation_style: "fade_pop",
  default_duration_seconds: 1.6,
  default_position: { x_pct: 50, y_pct: 30 },
};

export function emojiDefaultsToWire(value: EmojiDefaults): Record<string, unknown> {
  return {
    default_animation_style: value.default_animation_style,
    default_duration_seconds: value.default_duration_seconds,
    default_position: { x_pct: value.default_position.x_pct / 100, y_pct: value.default_position.y_pct / 100 },
  };
}

export function emojiDefaultsFromWire(value: Partial<EmojiDefaults> | null | undefined): EmojiDefaults {
  if (!value) return DEFAULT_EMOJI_DEFAULTS;
  const position = value.default_position ?? DEFAULT_EMOJI_DEFAULTS.default_position;
  return {
    default_animation_style: value.default_animation_style ?? DEFAULT_EMOJI_DEFAULTS.default_animation_style,
    default_duration_seconds: value.default_duration_seconds ?? DEFAULT_EMOJI_DEFAULTS.default_duration_seconds,
    default_position: { x_pct: position.x_pct * 100, y_pct: position.y_pct * 100 },
  };
}

// Matches edit/page.tsx's REACTION_POSITIONS exactly (same 0-100 scale).
export const EMOJI_POSITION_PRESETS: { label: string; x_pct: number; y_pct: number }[] = [
  { label: "Top left", x_pct: 15, y_pct: 15 },
  { label: "Top right", x_pct: 85, y_pct: 15 },
  { label: "Center", x_pct: 50, y_pct: 50 },
  { label: "Bottom left", x_pct: 15, y_pct: 85 },
  { label: "Bottom right", x_pct: 85, y_pct: 85 },
];
