"use client";

import { useEffect, useState } from "react";
import { CaptionStylePanel } from "@/components/settings-panels/caption-style-panel";
import { VisualFeaturePanel } from "@/components/testing/visual-feature-panel";
import type { TemplateInfo } from "@/components/template-picker";
import type { FontOption } from "@/components/font-select-option";
import type { RenderPreviewPayload } from "@/lib/testing-render-preview";

interface CaptionStyleValue {
  fontFamily: string | null;
  fontSize: number | null;
  fontColor: string | null;
  captionTemplate: string;
}

const DEFAULT_VALUE: CaptionStyleValue = {
  fontFamily: null,
  fontSize: null,
  fontColor: null,
  captionTemplate: "default",
};

export function CaptionsTestPanel() {
  const [value, setValue] = useState<CaptionStyleValue>(DEFAULT_VALUE);
  const [availableFonts, setAvailableFonts] = useState<FontOption[]>([]);
  const [availableTemplates, setAvailableTemplates] = useState<TemplateInfo[]>([]);

  useEffect(() => {
    fetch("/api/fonts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { fonts: [] }))
      .then((data) => setAvailableFonts(data.fonts ?? []))
      .catch(() => setAvailableFonts([]));

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${apiUrl}/caption-templates`)
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data) => setAvailableTemplates(data.templates ?? []))
      .catch(() => setAvailableTemplates([]));
  }, []);

  const buildRenderInput = (sessionClipKey: string | undefined): RenderPreviewPayload => ({
    session_clip_key: sessionClipKey,
    add_subtitles: true,
    font_family: value.fontFamily,
    font_size: value.fontSize,
    font_color: value.fontColor,
    caption_template: value.captionTemplate,
  });

  return (
    <VisualFeaturePanel<CaptionStyleValue>
      featureKey="captions"
      title="Captions"
      description="Word-synced captions burned into the clip — test font/size/color/template styling. Uses a placeholder sentence with even timing, so it never needs a real transcript."
      featureLabel="Captions"
      templateSection="captions"
      value={value}
      onValueChange={setValue}
      fromTemplateSettings={(settings) => ({
        fontFamily: (settings.font_family as string | null) ?? null,
        fontSize: typeof settings.font_size === "number" ? (settings.font_size as number) : null,
        fontColor: (settings.font_color as string | null) ?? null,
        captionTemplate: (settings.caption_template as string) || "default",
      })}
      toSectionValues={(v) => ({
        font_family: v.fontFamily,
        font_size: v.fontSize,
        font_color: v.fontColor,
        caption_template: v.captionTemplate,
      })}
      settingsSlot={
        <CaptionStylePanel
          fontFamily={value.fontFamily}
          fontSize={value.fontSize}
          fontColor={value.fontColor}
          captionTemplate={value.captionTemplate}
          onFontFamilyChange={(fontFamily) => setValue((v) => ({ ...v, fontFamily }))}
          onFontSizeChange={(fontSize) => setValue((v) => ({ ...v, fontSize }))}
          onFontColorChange={(fontColor) => setValue((v) => ({ ...v, fontColor }))}
          onCaptionTemplateChange={(captionTemplate) => setValue((v) => ({ ...v, captionTemplate }))}
          availableFonts={availableFonts}
          availableTemplates={availableTemplates}
        />
      }
      buildRenderInput={buildRenderInput}
    />
  );
}
