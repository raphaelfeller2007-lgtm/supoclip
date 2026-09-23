"use client";

import { Switch } from "@/components/ui/switch";
import type { BrollSettings } from "@/lib/engagement-settings";

interface BrollSettingsPanelProps {
  settings: BrollSettings;
  onChange: <K extends keyof BrollSettings>(key: K, value: BrollSettings[K]) => void;
  disabled?: boolean;
}

/**
 * B-roll insertion controls — shared between the /create form and the task
 * Project Settings sheet.
 */
export function BrollSettingsPanel({ settings, onChange, disabled }: BrollSettingsPanelProps) {
  return (
    <div className="border border-border bg-background p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">B-roll cuts</h3>
          <p className="text-xs text-muted-foreground">Let the AI suggest B-roll insertion points from stock footage.</p>
        </div>
        <Switch checked={settings.enabled} onCheckedChange={(checked) => onChange("enabled", checked)} disabled={disabled} />
      </div>
      {settings.enabled && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Max insertions per clip</span>
              <span>{settings.maxInsertions}</span>
            </label>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={settings.maxInsertions}
              onChange={(e) => onChange("maxInsertions", Number(e.target.value))}
              disabled={disabled}
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Minimum gap between insertions</span>
              <span>{settings.minGapSeconds}s</span>
            </label>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={settings.minGapSeconds}
              onChange={(e) => onChange("minGapSeconds", Number(e.target.value))}
              disabled={disabled}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
