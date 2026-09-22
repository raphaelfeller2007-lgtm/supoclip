"use client";

import { useEffect, useState } from "react";
import { RuntimeSettingsForm, type RuntimeSetting } from "@/components/admin/runtime-settings-form";
import { RankingVisualFeaturePanel } from "@/components/testing/ranking-visual-feature-panel";
import type { RankingRenderPreviewPayload } from "@/lib/testing-render-preview";

const SFX_SETTING_KEYS = ["RANKING_SFX_FILENAME", "RANKING_SFX_OFFSET_PCT"];

export function RankingSfxTestPanel() {
  const [settings, setSettings] = useState<RuntimeSetting[]>([]);

  const loadSettings = () => {
    fetch("/api/admin/runtime-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { settings: [] }))
      .then((data) =>
        setSettings((data.settings ?? []).filter((s: RuntimeSetting) => SFX_SETTING_KEYS.includes(s.key)))
      )
      .catch(() => setSettings([]));
  };

  useEffect(loadSettings, []);

  const buildRenderInput = (templateId: string): RankingRenderPreviewPayload => ({
    template_id: templateId,
    use_global_sfx: true,
  });

  return (
    <RankingVisualFeaturePanel
      title="SFX alignment"
      description="The global transition SFX (filename + offset-before-cut) that ranking_classic's use_global_sfx mixes in at every cut. These are app-wide settings, not per-template — the same panel as Settings → Ranking, editing the same values."
      settingsSlot={settings.length > 0 ? <RuntimeSettingsForm settings={settings} onSaved={loadSettings} /> : (
        <p className="text-xs text-muted-foreground">Loading...</p>
      )}
      buildRenderInput={buildRenderInput}
    />
  );
}
