"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  EMOJI_ANIMATION_STYLES,
  EMOJI_POSITION_PRESETS,
  type EmojiDefaults,
} from "@/lib/emoji-defaults";

interface EmojiDefaultsPanelProps {
  value: EmojiDefaults;
  onChange: (value: EmojiDefaults) => void;
}

/**
 * Project-level defaults for newly added emoji reactions — animation,
 * duration, and starting position. There's no per-clip emoji picker here
 * (that stays in the clip editor); this only controls what a *new*
 * reaction starts out as. First-version component: also the one the
 * Testing tab's Emoji sub-tab uses.
 */
export function EmojiDefaultsPanel({ value, onChange }: EmojiDefaultsPanelProps) {
  const selectedPreset = EMOJI_POSITION_PRESETS.find(
    (p) => p.x_pct === value.default_position.x_pct && p.y_pct === value.default_position.y_pct
  );

  return (
    <div className="border border-border p-3 space-y-3">
      <div>
        <div className="text-sm font-medium text-foreground">Default emoji reaction settings</div>
        <div className="text-xs text-muted-foreground">Applied to newly added reactions — existing reactions are unchanged.</div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Animation</label>
        <Select
          value={value.default_animation_style}
          onValueChange={(animation) => onChange({ ...value, default_animation_style: animation as EmojiDefaults["default_animation_style"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMOJI_ANIMATION_STYLES.map((style) => (
              <SelectItem key={style} value={style}>
                {style.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Position</label>
        <Select
          value={selectedPreset?.label ?? "Center"}
          onValueChange={(label) => {
            const preset = EMOJI_POSITION_PRESETS.find((p) => p.label === label);
            if (preset) onChange({ ...value, default_position: { x_pct: preset.x_pct, y_pct: preset.y_pct } });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            {EMOJI_POSITION_PRESETS.map((preset) => (
              <SelectItem key={preset.label} value={preset.label}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Duration</span>
          <span>{value.default_duration_seconds.toFixed(1)}s</span>
        </div>
        <Slider
          min={0.5}
          max={6}
          step={0.1}
          value={[value.default_duration_seconds]}
          onValueChange={([duration]) => onChange({ ...value, default_duration_seconds: duration ?? value.default_duration_seconds })}
        />
      </div>
    </div>
  );
}
