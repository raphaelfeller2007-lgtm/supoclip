"use client";

import { useState } from "react";
import { EmojiDefaultsPanel } from "@/components/settings-panels/emoji-defaults-panel";
import { VisualFeaturePanel } from "@/components/testing/visual-feature-panel";
import { DEFAULT_EMOJI_DEFAULTS, emojiDefaultsFromWire, emojiDefaultsToWire, type EmojiDefaults } from "@/lib/emoji-defaults";
import type { RenderPreviewPayload } from "@/lib/testing-render-preview";

export function EmojiTestPanel() {
  const [value, setValue] = useState<EmojiDefaults>(DEFAULT_EMOJI_DEFAULTS);

  const buildRenderInput = (sessionClipKey: string | undefined): RenderPreviewPayload => ({
    session_clip_key: sessionClipKey,
    add_subtitles: false,
    reactions: [
      {
        id: "preview",
        emoji: "🔥",
        timestamp_seconds: 1.0,
        animation_style: value.default_animation_style,
        duration_seconds: value.default_duration_seconds,
        position: { x_pct: value.default_position.x_pct / 100, y_pct: value.default_position.y_pct / 100 },
      },
    ],
  });

  return (
    <VisualFeaturePanel<EmojiDefaults>
      featureKey="emoji"
      title="Emoji"
      description="Default animation, duration, and position for newly added emoji reactions — test how one looks before it becomes the default for new reactions. Existing reactions on a clip are never changed by this."
      featureLabel="Emoji"
      templateSection="emoji"
      value={value}
      onValueChange={setValue}
      fromTemplateSettings={(settings) => emojiDefaultsFromWire(settings.emoji_defaults as Partial<EmojiDefaults> | undefined)}
      toSectionValues={(v) => ({ emoji_defaults: emojiDefaultsToWire(v) })}
      settingsSlot={<EmojiDefaultsPanel value={value} onChange={setValue} />}
      buildRenderInput={buildRenderInput}
    />
  );
}
