"use client";

import { Input } from "@/components/ui/input";

interface FillerCutPanelProps {
  cutLongPauses: boolean;
  pauseThresholdMs: string;
  removeFillerWords: boolean;
  filteredWords: string;
  onCutLongPausesChange: (value: boolean) => void;
  onPauseThresholdMsChange: (value: string) => void;
  onRemoveFillerWordsChange: (value: boolean) => void;
  onFilteredWordsChange: (value: string) => void;
}

/**
 * The real pause/filler-word cleanup controls — same component used by the
 * Project Settings sheet and the Testing tab's Filler cuts sub-tab.
 */
export function FillerCutPanel({
  cutLongPauses,
  pauseThresholdMs,
  removeFillerWords,
  filteredWords,
  onCutLongPausesChange,
  onPauseThresholdMsChange,
  onRemoveFillerWordsChange,
  onFilteredWordsChange,
}: FillerCutPanelProps) {
  return (
    <div className="border border-border p-3 space-y-3">
      <div>
        <div className="text-sm font-medium text-foreground">Clip cleanup</div>
        <div className="text-xs text-muted-foreground">Apply silence and filler-word cuts to regenerated clips.</div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={cutLongPauses}
          onChange={(e) => onCutLongPausesChange(e.target.checked)}
          className="rounded"
        />
        Cut long pauses
      </label>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Pause threshold (ms)</label>
        <Input
          type="number"
          min={250}
          max={3000}
          step={50}
          value={pauseThresholdMs}
          onChange={(e) => onPauseThresholdMsChange(e.target.value)}
          disabled={!cutLongPauses}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={removeFillerWords}
          onChange={(e) => onRemoveFillerWordsChange(e.target.checked)}
          className="rounded"
        />
        Remove filler words
      </label>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Extra filtered words or phrases</label>
        <Input
          value={filteredWords}
          onChange={(e) => onFilteredWordsChange(e.target.value)}
          placeholder="basically, literally, to be honest"
        />
      </div>
    </div>
  );
}
