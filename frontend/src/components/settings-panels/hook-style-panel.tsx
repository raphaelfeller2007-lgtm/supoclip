"use client";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HookTitlePreview } from "@/components/hook-title-preview";
import { DEFAULT_HOOK_STYLE, type HookAnimation, type HookPosition, type HookStyle } from "@/lib/hook-style";
import type { TemplateInfo } from "@/components/template-picker";

interface HookStylePanelProps {
  style: HookStyle;
  onChange: (style: HookStyle) => void;
  captionTemplate: string;
  availableTemplates: TemplateInfo[];
}

/**
 * The real hook-title styling controls — same component used by the
 * Project Settings sheet (frontend/src/app/(clipping)/tasks/[id]/page.tsx)
 * and the Testing tab's Hook sub-tab. Keep this the single source for these
 * controls rather than letting a second copy drift.
 */
export function HookStylePanel({ style, onChange, captionTemplate, availableTemplates }: HookStylePanelProps) {
  const updateStyle = <K extends keyof HookStyle>(key: K, value: HookStyle[K]) => {
    onChange({ ...style, [key]: value });
  };

  return (
    <div className="border border-border p-3 space-y-3">
      <div>
        <div className="text-sm font-medium text-foreground">Hook title</div>
        <div className="text-xs text-muted-foreground">Style of the AI-written headline burned in for the first few seconds.</div>
      </div>

      <HookTitlePreview style={style} captionTemplate={captionTemplate} availableTemplates={availableTemplates} />

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Size</label>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: "Small", value: 0.65 },
            { label: "Default", value: null },
            { label: "Large", value: 1.0 },
            { label: "XL", value: 1.3 },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => updateStyle("hook_font_size_scale", option.value)}
              className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                style.hook_font_size_scale === option.value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:bg-border"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Text color</label>
          <input
            type="color"
            value={style.hook_font_color ?? "#FFFFFF"}
            onChange={(e) => updateStyle("hook_font_color", e.target.value)}
            className="w-full h-8 rounded border border-border cursor-pointer"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            Text outline
            <Switch
              checked={(style.hook_stroke_width ?? 3) > 0}
              onCheckedChange={(checked) => updateStyle("hook_stroke_width", checked ? 3 : 0)}
            />
          </label>
          {(style.hook_stroke_width ?? 3) > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Width</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {style.hook_stroke_width ?? 3}px
                </span>
              </div>
              <Slider
                value={[style.hook_stroke_width ?? 3]}
                min={1}
                max={10}
                step={1}
                onValueChange={([value]) => updateStyle("hook_stroke_width", value)}
              />
              <input
                type="color"
                value={style.hook_stroke_color ?? "#000000"}
                onChange={(e) => updateStyle("hook_stroke_color", e.target.value)}
                className="w-full h-8 rounded border border-border cursor-pointer"
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            Background color
            <Switch
              checked={style.hook_background_color !== null}
              onCheckedChange={(checked) =>
                updateStyle("hook_background_color", checked ? (style.hook_background_color ?? "#000000") : null)
              }
            />
          </label>
          {style.hook_background_color !== null && (
            <input
              type="color"
              value={style.hook_background_color.slice(0, 7)}
              onChange={(e) => updateStyle("hook_background_color", e.target.value)}
              className="w-full h-8 rounded border border-border cursor-pointer"
            />
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
            Background outline
            <Switch
              checked={style.hook_box_outline_color !== null}
              onCheckedChange={(checked) =>
                updateStyle("hook_box_outline_color", checked ? (style.hook_box_outline_color ?? "#000000") : null)
              }
            />
          </label>
          {style.hook_box_outline_color !== null && (
            <input
              type="color"
              value={style.hook_box_outline_color}
              onChange={(e) => updateStyle("hook_box_outline_color", e.target.value)}
              className="w-full h-8 rounded border border-border cursor-pointer"
            />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Position</label>
        <div className="grid grid-cols-3 gap-1.5">
          {(["top", "center", "bottom"] as HookPosition[]).map((position) => (
            <button
              key={position}
              type="button"
              onClick={() => updateStyle("hook_position", position)}
              className={`px-2 py-1.5 rounded-md text-xs font-medium border capitalize transition-colors ${
                (style.hook_position ?? "top") === position
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:bg-border"
              }`}
            >
              {position}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Animation</label>
        <Select value={style.hook_animation ?? "fade_pop"} onValueChange={(value) => updateStyle("hook_animation", value as HookAnimation)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fade_pop">Fade + Pop</SelectItem>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="slide_down">Slide Down</SelectItem>
            <SelectItem value="zoom_punch">Zoom Punch</SelectItem>
            <SelectItem value="bounce">Bounce</SelectItem>
            <SelectItem value="pulse">Pulse</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center justify-between text-sm text-foreground">
        Drop shadow
        <Switch checked={style.hook_shadow ?? true} onCheckedChange={(checked) => updateStyle("hook_shadow", checked)} />
      </label>

      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground underline"
        onClick={() => onChange(DEFAULT_HOOK_STYLE)}
      >
        Reset hook styling to template default
      </button>
    </div>
  );
}
