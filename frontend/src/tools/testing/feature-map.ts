// Explicit sub-tab list for the Testing tab, replacing the old "group the
// flat stage registry by tool" derivation. "llm" entries map 1:1 to a
// backend StageSpec (transcribe/metadata/policy/etc. — the fixture/stub/
// real/benchmark UI still fits these); "visual" entries are features you
// look at, handled entirely on the frontend via VisualFeaturePanel /
// RankingVisualFeaturePanel — see CLAUDE.md's "Testing Tab" section for how
// to decide which pattern a new feature should follow.
export type TestingFeature =
  | { kind: "llm"; tool: "clipping" | "ranking"; stageId: string; label: string }
  | { kind: "visual"; tool: "clipping"; feature: "hook" | "captions" | "emoji" | "safe_zones" | "filler_cuts"; label: string }
  | { kind: "visual"; tool: "ranking"; feature: "bounce" | "sfx_alignment"; label: string };

export const TESTING_FEATURES: Record<"clipping" | "ranking", TestingFeature[]> = {
  clipping: [
    { kind: "llm", tool: "clipping", stageId: "transcribe", label: "Transcribe" },
    { kind: "visual", tool: "clipping", feature: "hook", label: "Hook" },
    { kind: "visual", tool: "clipping", feature: "captions", label: "Captions" },
    { kind: "visual", tool: "clipping", feature: "emoji", label: "Emoji" },
    { kind: "visual", tool: "clipping", feature: "safe_zones", label: "Safe zones" },
    { kind: "visual", tool: "clipping", feature: "filler_cuts", label: "Filler cuts" },
    { kind: "llm", tool: "clipping", stageId: "detect_clips", label: "Detect clips" },
    { kind: "llm", tool: "clipping", stageId: "generate_metadata", label: "Metadata" },
    { kind: "llm", tool: "clipping", stageId: "policy_check", label: "Policy" },
    { kind: "llm", tool: "clipping", stageId: "generate_hooks", label: "Hook text variants" },
    { kind: "llm", tool: "clipping", stageId: "upload", label: "Upload" },
    { kind: "llm", tool: "clipping", stageId: "export", label: "Export" },
  ],
  ranking: [
    { kind: "visual", tool: "ranking", feature: "bounce", label: "Bounce / number overlay" },
    { kind: "visual", tool: "ranking", feature: "sfx_alignment", label: "SFX alignment" },
    { kind: "llm", tool: "ranking", stageId: "folder_scan", label: "Folder scan" },
    { kind: "llm", tool: "ranking", stageId: "select_clips", label: "Clip selection" },
    { kind: "llm", tool: "ranking", stageId: "text_memory", label: "Text memory" },
  ],
};

export function testingFeatureKey(feature: TestingFeature): string {
  return feature.kind === "llm" ? `${feature.tool}.llm.${feature.stageId}` : `${feature.tool}.visual.${feature.feature}`;
}
