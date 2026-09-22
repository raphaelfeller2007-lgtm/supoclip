"use client";

import { useEffect, useState } from "react";
import { HookStylePanel } from "@/components/settings-panels/hook-style-panel";
import { VisualFeaturePanel } from "@/components/testing/visual-feature-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DEFAULT_HOOK_STYLE, hookStylePayload, type HookStyle } from "@/lib/hook-style";
import type { TemplateInfo } from "@/components/template-picker";
import type { RenderPreviewPayload } from "@/lib/testing-render-preview";

export function HookTestPanel() {
  const [style, setStyle] = useState<HookStyle>(DEFAULT_HOOK_STYLE);
  // Independent of the Captions tab's own selection — only used here to
  // resolve the caption template's hook_* fallback values for the preview.
  const [captionTemplate, setCaptionTemplate] = useState("default");
  const [availableTemplates, setAvailableTemplates] = useState<TemplateInfo[]>([]);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    fetch(`${apiUrl}/caption-templates`)
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data) => setAvailableTemplates(data.templates ?? []))
      .catch(() => setAvailableTemplates([]));
  }, []);

  const buildRenderInput = (sessionClipKey: string | undefined): RenderPreviewPayload => ({
    session_clip_key: sessionClipKey,
    add_subtitles: false,
    caption_template: captionTemplate,
    hook_title: "Your Hook Title Goes Here",
    hook_style: hookStylePayload(style) ?? {},
  });

  return (
    <VisualFeaturePanel<HookStyle>
      featureKey="hook"
      title="Hook"
      description="The AI-written headline burned in for the first few seconds — test its styling on a clip without generating a real hook."
      featureLabel="Hook"
      templateSection="hooks"
      value={style}
      onValueChange={setStyle}
      fromTemplateSettings={(settings) => ({
        ...DEFAULT_HOOK_STYLE,
        ...((settings.hook_style as Partial<HookStyle>) ?? {}),
      })}
      toSectionValues={(value) => ({ hook_style: hookStylePayload(value) ?? {} })}
      settingsSlot={
        <>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Caption template (for hook fallback values)</Label>
            <Select value={captionTemplate} onValueChange={setCaptionTemplate}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <HookStylePanel style={style} onChange={setStyle} captionTemplate={captionTemplate} availableTemplates={availableTemplates} />
        </>
      }
      buildRenderInput={buildRenderInput}
    />
  );
}
