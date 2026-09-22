"use client";

import { useState } from "react";
import { FillerCutPanel } from "@/components/settings-panels/filler-cut-panel";
import { VisualFeaturePanel } from "@/components/testing/visual-feature-panel";
import type { RenderPreviewPayload } from "@/lib/testing-render-preview";

interface FillerCutValue {
  cutLongPauses: boolean;
  pauseThresholdMs: string;
  removeFillerWords: boolean;
  filteredWords: string;
}

const DEFAULT_VALUE: FillerCutValue = {
  cutLongPauses: true,
  pauseThresholdMs: "900",
  removeFillerWords: true,
  filteredWords: "",
};

export function FillerCutsTestPanel() {
  const [value, setValue] = useState<FillerCutValue>(DEFAULT_VALUE);

  const buildRenderInput = (sessionClipKey: string | undefined): RenderPreviewPayload => ({
    session_clip_key: sessionClipKey,
    add_subtitles: false,
    cleanup_settings: {
      cut_long_pauses: value.cutLongPauses,
      pause_threshold_ms: Number(value.pauseThresholdMs) || 900,
      remove_filler_words: value.removeFillerWords,
      filtered_words: value.filteredWords
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
    },
  });

  return (
    <VisualFeaturePanel<FillerCutValue>
      featureKey="filler_cuts"
      title="Filler cuts"
      description="Pause and filler-word removal — test the current sensitivity on a clip. Needs a cached transcript for the test clip to actually cut anything; without one the clip renders unchanged."
      featureLabel="Filler cuts"
      templateSection="filler_pauses"
      value={value}
      onValueChange={setValue}
      fromTemplateSettings={(settings) => ({
        cutLongPauses: Boolean(settings.cut_long_pauses),
        pauseThresholdMs: String(settings.pause_threshold_ms || 900),
        removeFillerWords: Boolean(settings.remove_filler_words),
        filteredWords: ((settings.filtered_words as string[]) || []).join(", "),
      })}
      toSectionValues={(v) => ({
        cut_long_pauses: v.cutLongPauses,
        pause_threshold_ms: Number(v.pauseThresholdMs) || 900,
        remove_filler_words: v.removeFillerWords,
        filtered_words: v.filteredWords
          .split(",")
          .map((w) => w.trim())
          .filter(Boolean),
      })}
      settingsSlot={
        <FillerCutPanel
          cutLongPauses={value.cutLongPauses}
          pauseThresholdMs={value.pauseThresholdMs}
          removeFillerWords={value.removeFillerWords}
          filteredWords={value.filteredWords}
          onCutLongPausesChange={(cutLongPauses) => setValue((v) => ({ ...v, cutLongPauses }))}
          onPauseThresholdMsChange={(pauseThresholdMs) => setValue((v) => ({ ...v, pauseThresholdMs }))}
          onRemoveFillerWordsChange={(removeFillerWords) => setValue((v) => ({ ...v, removeFillerWords }))}
          onFilteredWordsChange={(filteredWords) => setValue((v) => ({ ...v, filteredWords }))}
        />
      }
      buildRenderInput={buildRenderInput}
    />
  );
}
