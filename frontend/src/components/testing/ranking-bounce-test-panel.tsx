"use client";

import { useState } from "react";
import { RankingNumberOverlayPanel } from "@/components/settings-panels/ranking-number-overlay-panel";
import { RankingVisualFeaturePanel } from "@/components/testing/ranking-visual-feature-panel";
import { DEFAULT_RANKING_NUMBER_OVERLAY, type RankingNumberOverlay } from "@/lib/ranking-number-overlay";
import type { RankingRenderPreviewPayload } from "@/lib/testing-render-preview";

export function RankingBounceTestPanel() {
  const [overlay, setOverlay] = useState<RankingNumberOverlay>(DEFAULT_RANKING_NUMBER_OVERLAY);

  const buildRenderInput = (templateId: string): RankingRenderPreviewPayload => ({
    template_id: templateId,
    number_overlay: overlay,
  });

  return (
    <RankingVisualFeaturePanel
      title="Bounce / number overlay"
      description="The rank-number tile's style, position, color, and entrance animation — 'stacked' (ranking_classic's default) always uses a fixed bounce reveal with no knobs yet; 'tile' exposes all four."
      settingsSlot={<RankingNumberOverlayPanel value={overlay} onChange={setOverlay} />}
      buildRenderInput={buildRenderInput}
      onTemplateSelected={(template) => {
        const templateOverlay = template.number_overlay as Partial<RankingNumberOverlay> | undefined;
        if (templateOverlay) setOverlay({ ...DEFAULT_RANKING_NUMBER_OVERLAY, ...templateOverlay });
      }}
    />
  );
}
