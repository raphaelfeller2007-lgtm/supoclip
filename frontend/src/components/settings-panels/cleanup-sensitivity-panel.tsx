"use client";

import { Slider } from "@/components/ui/slider";

interface CleanupSensitivityPanelProps {
  sensitivity: number | null;
  onSensitivityChange: (value: number | null) => void;
  /** Wrapper class for the Auto slider block — callers differ on border/padding. */
  sliderWrapperClassName?: string;
  disabled?: boolean;
  /** Rendered in place of the slider when sensitivity is null (Manual mode). */
  manualContent: React.ReactNode;
}

/**
 * Auto/Manual cleanup-sensitivity toggle — shared between the /create form
 * and the task Project Settings sheet. "Auto" drives cut aggressiveness off
 * one 0-100 slider; "Manual" hands control to the caller's own filler-cut
 * fields via `manualContent`.
 */
export function CleanupSensitivityPanel({
  sensitivity,
  onSensitivityChange,
  sliderWrapperClassName = "space-y-1.5",
  disabled,
  manualContent,
}: CleanupSensitivityPanelProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onSensitivityChange(sensitivity ?? 50)}
          disabled={disabled}
          className={`px-2 py-1.5 text-xs font-medium border transition-colors ${
            sensitivity !== null ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:text-foreground"
          }`}
        >
          Auto
        </button>
        <button
          type="button"
          onClick={() => onSensitivityChange(null)}
          disabled={disabled}
          className={`px-2 py-1.5 text-xs font-medium border transition-colors ${
            sensitivity === null ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:text-foreground"
          }`}
        >
          Manual
        </button>
      </div>

      {sensitivity !== null ? (
        <div className={sliderWrapperClassName}>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Cleanup sensitivity</label>
            <span className="text-xs text-muted-foreground tabular-nums">{sensitivity}/100</span>
          </div>
          <Slider
            value={[sensitivity]}
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            onValueChange={([value]) => onSensitivityChange(value)}
          />
          <p className="text-xs text-muted-foreground">
            Higher values cut shorter pauses and more filler words at once. Meaning-changing
            cuts (punchlines, sentence-ending words, emphatic delivery) are always protected
            regardless of sensitivity.
          </p>
        </div>
      ) : (
        manualContent
      )}
    </>
  );
}
