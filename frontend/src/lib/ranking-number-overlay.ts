// Mirrors backend/src/ranking_templates.py's TEMPLATE_DEFAULTS["number_overlay"]
// shape and the enums backend/src/ranking_overlay.py actually accepts.
export type RankingOverlayStyle = "tile" | "stacked";
export type RankingOverlayPosition = "top" | "center" | "bottom";
export type RankingOverlayColor = "ink" | "paper" | "teal" | "blue";
// "stacked" ignores this entirely — build_ranking_overlay_ass hardcodes a
// fixed bounce with no animation parameter at all (see ranking_overlay.py).
export type RankingOverlayAnimation = "fade_pop" | "none" | "pop" | "slide";

export type RankingNumberOverlay = {
  style: RankingOverlayStyle;
  position: RankingOverlayPosition;
  color: RankingOverlayColor;
  animation: RankingOverlayAnimation;
};

export const DEFAULT_RANKING_NUMBER_OVERLAY: RankingNumberOverlay = {
  style: "tile",
  position: "bottom",
  color: "teal",
  animation: "fade_pop",
};
