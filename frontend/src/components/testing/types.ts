export interface StageSpec {
  id: string;
  tool: "clipping" | "ranking";
  name: string;
  description: string;
  external_service: string | null;
  input_shape: Record<string, string>;
  output_shape: Record<string, string>;
  fixture_stub_supported: boolean;
}

export interface FixtureSummary {
  name: string;
  description: string;
  has_output: boolean;
}

export interface StageRunResult {
  output: Record<string, unknown> | null;
  provider: string;
  raw_response: unknown;
  timing_ms: number;
  cost_estimate: number;
  error: string | null;
  warnings: string[];
}

export interface BenchmarkRow extends StageRunResult {
  label: string;
}

export type RunMode = "stub" | "real";
