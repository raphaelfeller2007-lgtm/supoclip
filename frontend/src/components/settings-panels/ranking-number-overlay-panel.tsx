"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RankingNumberOverlay } from "@/lib/ranking-number-overlay";

interface RankingNumberOverlayPanelProps {
  value: RankingNumberOverlay;
  onChange: (value: RankingNumberOverlay) => void;
}

/**
 * Ranking's rank-number tile settings — style (tile vs. the always-visible
 * stacked list), position, color, and entrance animation. First-version
 * component: there is no other settings UI for this anywhere in the
 * product yet (see backend/src/api/routes/ranking.py's already-existing but
 * currently unused PATCH /ranking/tasks/{id}/settings, which this could
 * feed once a real Ranking settings UI exists).
 */
export function RankingNumberOverlayPanel({ value, onChange }: RankingNumberOverlayPanelProps) {
  const isStacked = value.style === "stacked";

  return (
    <div className="border border-border p-3 space-y-3">
      <div>
        <div className="text-sm font-medium text-foreground">Rank number overlay</div>
        <div className="text-xs text-muted-foreground">
          &quot;Tile&quot; shows one rank at a time; &quot;stacked&quot; keeps every rank visible on the left for the whole video.
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Style</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(["tile", "stacked"] as const).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => onChange({ ...value, style })}
              className={`px-2 py-1.5 rounded-md text-xs font-medium border capitalize transition-colors ${
                value.style === style
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:bg-border"
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {!isStacked && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Position</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["top", "center", "bottom"] as const).map((position) => (
              <button
                key={position}
                type="button"
                onClick={() => onChange({ ...value, position })}
                className={`px-2 py-1.5 rounded-md text-xs font-medium border capitalize transition-colors ${
                  value.position === position
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:bg-border"
                }`}
              >
                {position}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isStacked && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Color</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(["ink", "paper", "teal", "blue"] as const).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange({ ...value, color })}
                className={`px-2 py-1.5 rounded-md text-xs font-medium border capitalize transition-colors ${
                  value.color === color
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:bg-border"
                }`}
              >
                {color}
              </button>
            ))}
          </div>
        </div>
      )}

      {isStacked ? (
        <p className="text-xs text-muted-foreground">
          Stacked always uses a fixed per-rank medal coloring and bounce reveal — no position/color/animation knobs yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Animation</label>
          <Select value={value.animation} onValueChange={(animation) => onChange({ ...value, animation: animation as RankingNumberOverlay["animation"] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fade_pop">Fade + Pop</SelectItem>
              <SelectItem value="pop">Pop</SelectItem>
              <SelectItem value="slide">Slide</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
