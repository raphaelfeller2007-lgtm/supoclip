"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FlaskConical } from "lucide-react";

import { StageRunnerPanel } from "@/components/testing/stage-runner-panel";
import { HookTestPanel } from "@/components/testing/hook-test-panel";
import { CaptionsTestPanel } from "@/components/testing/captions-test-panel";
import { EmojiTestPanel } from "@/components/testing/emoji-test-panel";
import { SafeZonesTestPanel } from "@/components/testing/safe-zones-test-panel";
import { FillerCutsTestPanel } from "@/components/testing/filler-cuts-test-panel";
import { RankingBounceTestPanel } from "@/components/testing/ranking-bounce-test-panel";
import { RankingSfxTestPanel } from "@/components/testing/ranking-sfx-test-panel";
import type { StageSpec } from "@/components/testing/types";
import { TESTING_FEATURES, testingFeatureKey, type TestingFeature } from "@/tools/testing/feature-map";

const CLIPPING_VISUAL_PANELS: Record<string, React.ReactNode> = {
  hook: <HookTestPanel />,
  captions: <CaptionsTestPanel />,
  emoji: <EmojiTestPanel />,
  safe_zones: <SafeZonesTestPanel />,
  filler_cuts: <FillerCutsTestPanel />,
};

const RANKING_VISUAL_PANELS: Record<string, React.ReactNode> = {
  bounce: <RankingBounceTestPanel />,
  sfx_alignment: <RankingSfxTestPanel />,
};

export default function TestingPage() {
  const [stages, setStages] = useState<StageSpec[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>(testingFeatureKey(TESTING_FEATURES.clipping[0]));
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/testing/stages");
        if (!response.ok) {
          setLoadFailed(true);
          return;
        }
        const data = await response.json();
        setStages(data.stages ?? []);
      } catch {
        setLoadFailed(true);
      }
    })();
  }, []);

  if (loadFailed) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <EmptyState
          icon={FlaskConical}
          title="Testing tab is unavailable"
          description="Set ENABLE_TESTING_TOOL=true on the backend to use this tab."
        />
      </div>
    );
  }

  const allFeatures: TestingFeature[] = [...TESTING_FEATURES.clipping, ...TESTING_FEATURES.ranking];
  const selectedFeature = allFeatures.find((f) => testingFeatureKey(f) === selectedKey) ?? null;

  function renderSelected() {
    if (!selectedFeature) return null;
    if (selectedFeature.kind === "visual") {
      const panels = selectedFeature.tool === "clipping" ? CLIPPING_VISUAL_PANELS : RANKING_VISUAL_PANELS;
      return panels[selectedFeature.feature] ?? null;
    }
    const stage = stages?.find((s) => s.tool === selectedFeature.tool && s.id === selectedFeature.stageId);
    return stage ? <StageRunnerPanel stage={stage} /> : <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-[220px_1fr] gap-8">
      <aside className="space-y-6">
        {(["clipping", "ranking"] as const).map((tool) => (
          <div key={tool}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{tool}</h3>
            <div className="space-y-1">
              {TESTING_FEATURES[tool].map((feature) => {
                const key = testingFeatureKey(feature);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm border-l-2",
                      selectedKey === key
                        ? "border-l-foreground font-semibold"
                        : "border-l-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {feature.label}
                    {feature.kind === "visual" && (
                      <Badge variant="outline" className="ml-2 align-middle">
                        visual
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <main>{renderSelected()}</main>
    </div>
  );
}
