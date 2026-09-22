"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PLATFORM_SAFE_ZONES, SAFE_ZONE_PLATFORM_IDS, type SafeZoneSelection } from "@/lib/safe-zones";

interface SafeZoneSettingsPanelProps {
  enabled: boolean;
  platform: SafeZoneSelection;
  onEnabledChange: (value: boolean) => void;
  onPlatformChange: (value: SafeZoneSelection) => void;
}

/**
 * The real Safe Zone Overlay toggle/platform controls — same component used
 * by the task page header and the Testing tab's Safe zones sub-tab. This
 * overlay is frontend-only (never burned into a render), so there's no
 * "Apply" step here beyond redrawing the SVG.
 */
export function SafeZoneSettingsPanel({ enabled, platform, onEnabledChange, onPlatformChange }: SafeZoneSettingsPanelProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        Safe Zones
      </label>
      {enabled && (
        <Select value={platform} onValueChange={(value) => onPlatformChange(value as SafeZoneSelection)}>
          <SelectTrigger size="sm" aria-label="Safe zone platform" className="h-8 min-w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">All</SelectItem>
            {SAFE_ZONE_PLATFORM_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {PLATFORM_SAFE_ZONES[id].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
