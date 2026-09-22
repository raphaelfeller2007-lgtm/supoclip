"use client";

import { useState } from "react";
import { SafeZoneSettingsPanel } from "@/components/settings-panels/safe-zone-settings-panel";
import { SafeZoneOverlay } from "@/components/safe-zone-overlay";
import { VisualFeaturePanel } from "@/components/testing/visual-feature-panel";
import type { SafeZoneSelection } from "@/lib/safe-zones";

interface SafeZoneValue {
  enabled: boolean;
  platform: SafeZoneSelection;
}

const DEFAULT_VALUE: SafeZoneValue = { enabled: true, platform: "all" };

export function SafeZonesTestPanel() {
  const [value, setValue] = useState<SafeZoneValue>(DEFAULT_VALUE);

  return (
    <VisualFeaturePanel<SafeZoneValue>
      featureKey="safe_zones"
      title="Safe zones"
      description="Preview where each platform's own UI (username, caption, like/share rail) will sit over the frame. This overlay is frontend-only — it's never burned into an export, so there's no render step here, just an instant preview."
      featureLabel="Safe zones"
      templateSection="safe_zones"
      value={value}
      onValueChange={setValue}
      fromTemplateSettings={(settings) => ({
        enabled: Boolean(settings.safe_zone_enabled_default),
        platform: (settings.safe_zone_platform_default as SafeZoneSelection) || "all",
      })}
      toSectionValues={(v) => ({
        safe_zone_enabled_default: v.enabled,
        safe_zone_platform_default: v.platform,
      })}
      settingsSlot={
        <SafeZoneSettingsPanel
          enabled={value.enabled}
          platform={value.platform}
          onEnabledChange={(enabled) => setValue((v) => ({ ...v, enabled }))}
          onPlatformChange={(platform) => setValue((v) => ({ ...v, platform }))}
        />
      }
      buildRenderInput={null}
      overlaySlot={value.enabled ? <SafeZoneOverlay selection={value.platform} /> : undefined}
    />
  );
}
