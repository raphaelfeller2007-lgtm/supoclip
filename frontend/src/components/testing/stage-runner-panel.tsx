"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatSupportMessage, parseApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";
import { Loader2 } from "lucide-react";

import { BenchmarkTable } from "./benchmark-table";
import { DiffView } from "./diff-view";
import { JsonViewer } from "./json-viewer";
import type { BenchmarkRow, FixtureSummary, RunMode, StageRunResult, StageSpec } from "./types";

type InputSource = "fixture" | "prior_run" | "manual";

interface PriorRunTask {
  task_id: string;
  title: string | null;
  status: string;
  created_at: string | null;
  has_cached_artifacts: boolean;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const info = await parseApiError(response, "Request failed");
    throw new Error(formatSupportMessage(info));
  }
  return response.json();
}

export function StageRunnerPanel({ stage }: { stage: StageSpec }) {
  const [inputSource, setInputSource] = useState<InputSource>(
    stage.fixture_stub_supported ? "fixture" : "manual"
  );
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<string>("");
  const [priorRuns, setPriorRuns] = useState<PriorRunTask[]>([]);
  const [selectedPriorRun, setSelectedPriorRun] = useState<string>("");
  const [inputText, setInputText] = useState("{}");

  const [mode, setMode] = useState<RunMode>(stage.external_service ? "stub" : "real");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [costEstimate, setCostEstimate] = useState<{ cost_estimate: number; note: string } | null>(null);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StageRunResult | null>(null);

  const [compareMode, setCompareMode] = useState(false);
  const [compareProvider, setCompareProvider] = useState("");
  const [compareModel, setCompareModel] = useState("");
  const [compareResult, setCompareResult] = useState<StageRunResult | null>(null);

  const [benchmarkRows, setBenchmarkRows] = useState<BenchmarkRow[] | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);

  const [saveFixtureName, setSaveFixtureName] = useState("");

  // Reset everything when switching stages.
  useEffect(() => {
    setInputSource(stage.fixture_stub_supported ? "fixture" : "manual");
    setSelectedFixture("");
    setInputText("{}");
    setMode(stage.external_service ? "stub" : "real");
    setProvider("");
    setModel("");
    setCostEstimate(null);
    setResult(null);
    setCompareMode(false);
    setCompareResult(null);
    setBenchmarkRows(null);
  }, [stage]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(
          `/api/testing/fixtures?tool=${stage.tool}&stage_id=${stage.id}`
        );
        if (!response.ok) return;
        const data = await response.json();
        setFixtures(data.fixtures ?? []);
      } catch {
        // fixtures are a convenience, not required
      }
    })();
  }, [stage]);

  // Manual mode still benefits from a real example instead of a blank "{}"
  // — pull the first fixture's input as a starting point once fixtures load.
  useEffect(() => {
    if (inputSource !== "manual" || inputText !== "{}" || fixtures.length === 0) return;
    (async () => {
      try {
        const response = await fetch(`/api/testing/fixtures/${stage.tool}/${stage.id}/${fixtures[0].name}`);
        if (!response.ok) return;
        const data = await response.json();
        setInputText(JSON.stringify(data.input ?? {}, null, 2));
      } catch {
        // manual mode still works with the blank default
      }
    })();
  }, [inputSource, inputText, fixtures, stage]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`/api/testing/prior-runs?tool=${stage.tool}`);
        if (!response.ok) return;
        const data = await response.json();
        setPriorRuns(data.tasks ?? []);
      } catch {
        // optional
      }
    })();
  }, [stage]);

  const loadFixtureInput = useCallback(
    async (name: string) => {
      const response = await fetch(`/api/testing/fixtures/${stage.tool}/${stage.id}/${name}`);
      if (!response.ok) return;
      const data = await response.json();
      setInputText(JSON.stringify(data.input ?? {}, null, 2));
    },
    [stage]
  );

  useEffect(() => {
    if (inputSource === "fixture" && selectedFixture) {
      loadFixtureInput(selectedFixture);
    }
  }, [inputSource, selectedFixture, loadFixtureInput]);

  const loadPriorRunInput = useCallback(
    async (taskId: string) => {
      try {
        const response = await fetch(`/api/testing/prior-runs/${taskId}/${stage.id}`);
        if (!response.ok) {
          toast.error("No cached artifact for that task/stage yet.");
          return;
        }
        const data = await response.json();
        setInputText(JSON.stringify(data.input ?? data.output ?? {}, null, 2));
      } catch {
        toast.error("Failed to load prior-run artifact.");
      }
    },
    [stage]
  );

  useEffect(() => {
    if (inputSource === "prior_run" && selectedPriorRun) {
      loadPriorRunInput(selectedPriorRun);
    }
  }, [inputSource, selectedPriorRun, loadPriorRunInput]);

  function parsedInput(): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(inputText);
      if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
      return parsed as Record<string, unknown>;
    } catch {
      toast.error("Input must be valid JSON.");
      return null;
    }
  }

  async function handleEstimateCost() {
    const input = parsedInput();
    if (!input) return;
    try {
      const data = await postJson<{ cost_estimate: number; note: string }>(
        `/api/testing/stages/${stage.tool}/${stage.id}/estimate-cost`,
        { input }
      );
      setCostEstimate(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to estimate cost.");
    }
  }

  async function handleRun() {
    const input = parsedInput();
    if (!input) return;
    setRunning(true);
    setResult(null);
    setCompareResult(null);
    try {
      const data = await postJson<StageRunResult>(
        `/api/testing/stages/${stage.tool}/${stage.id}/run`,
        { input, mode, provider: provider || undefined, model: model || undefined }
      );
      setResult(data);
      if (data.error) toast.error(data.error);
      else toast.success(`Ran in ${data.timing_ms}ms`);

      if (compareMode) {
        const compareData = await postJson<StageRunResult>(
          `/api/testing/stages/${stage.tool}/${stage.id}/run`,
          { input, mode, provider: compareProvider || undefined, model: compareModel || undefined }
        );
        setCompareResult(compareData);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stage run failed.");
    } finally {
      setRunning(false);
    }
  }

  async function handleSaveFixture() {
    const input = parsedInput();
    if (!input || !saveFixtureName.trim()) {
      toast.error("Enter a fixture name first.");
      return;
    }
    try {
      await postJson(`/api/testing/fixtures`, {
        tool: stage.tool,
        stage_id: stage.id,
        name: saveFixtureName.trim(),
        description: `Saved from Testing tab on ${new Date().toISOString().slice(0, 10)}`,
        input,
        output: result?.output ?? undefined,
      });
      toast.success("Fixture saved.");
      setSaveFixtureName("");
      const response = await fetch(`/api/testing/fixtures?tool=${stage.tool}&stage_id=${stage.id}`);
      if (response.ok) {
        const data = await response.json();
        setFixtures(data.fixtures ?? []);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save fixture.");
    }
  }

  async function handleBenchmark() {
    const input = parsedInput();
    if (!input) return;
    setBenchmarking(true);
    setBenchmarkRows(null);
    try {
      const runs = [
        { provider: provider || undefined, model: model || undefined, label: `${provider || "default"}${model ? `:${model}` : ""}` },
        {
          provider: compareProvider || undefined,
          model: compareModel || undefined,
          label: `${compareProvider || "default"}${compareModel ? `:${compareModel}` : ""}`,
        },
      ];
      const data = await postJson<{ runs: BenchmarkRow[] }>(`/api/testing/benchmark`, {
        tool: stage.tool,
        stage_id: stage.id,
        input,
        runs,
        mode,
      });
      setBenchmarkRows(data.runs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Benchmark failed.");
    } finally {
      setBenchmarking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{stage.name}</h2>
          <Badge variant="outline">{stage.tool}</Badge>
          {stage.external_service ? (
            <Badge variant="outline">calls: {stage.external_service}</Badge>
          ) : (
            <Badge variant="outline">local only</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{stage.description}</p>
      </div>

      <Separator />

      {/* Input source */}
      <div className="space-y-2">
        <Label>Input source</Label>
        <div className="flex gap-2">
          {(["fixture", "prior_run", "manual"] as InputSource[]).map((source) => (
            <Button
              key={source}
              type="button"
              variant={inputSource === source ? "default" : "outline"}
              size="sm"
              onClick={() => setInputSource(source)}
            >
              {source === "fixture" ? "Fixture" : source === "prior_run" ? "From prior run" : "Manual"}
            </Button>
          ))}
        </div>

        {inputSource === "fixture" && (
          <Select value={selectedFixture} onValueChange={setSelectedFixture}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a fixture..." />
            </SelectTrigger>
            <SelectContent>
              {fixtures.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  {f.name} — {f.description || "no description"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {inputSource === "prior_run" && (
          <Select value={selectedPriorRun} onValueChange={setSelectedPriorRun}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a prior run..." />
            </SelectTrigger>
            <SelectContent>
              {priorRuns.map((t) => (
                <SelectItem key={t.task_id} value={t.task_id}>
                  {(t.title || t.task_id).slice(0, 60)} {t.has_cached_artifacts ? "" : "(no cache)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Stage input (JSON)</Label>
          {Object.keys(stage.input_shape).length > 0 && (
            <p className="text-xs text-muted-foreground">
              Fields: {Object.entries(stage.input_shape).map(([field, desc]) => `${field} (${desc})`).join(", ")}
            </p>
          )}
        </div>
        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          rows={10}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </div>

      {/* Mode / provider */}
      {stage.external_service && (
        <div className="space-y-2">
          <Label>Mode</Label>
          <div className="flex items-center gap-2">
            <span className={mode === "stub" ? "font-semibold" : "text-muted-foreground"}>Stub</span>
            <Switch checked={mode === "real"} onCheckedChange={(v) => setMode(v ? "real" : "stub")} />
            <span className={mode === "real" ? "font-semibold" : "text-muted-foreground"}>Real</span>
          </div>
          {mode === "real" && (
            <div className="border border-border p-3 space-y-2">
              <p className="text-sm">
                Real mode calls <strong>{stage.external_service}</strong> and may cost money.
              </p>
              <div className="flex gap-2 items-end">
                <Button type="button" variant="outline" size="sm" onClick={handleEstimateCost}>
                  Estimate cost
                </Button>
                {costEstimate && (
                  <p className="text-sm text-muted-foreground">
                    ~${costEstimate.cost_estimate.toFixed(4)} — {costEstimate.note}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Provider override</Label>
                  <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="ollama / gemini" />
                </div>
                <div>
                  <Label className="text-xs">Model override</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. llama3.2:3b" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Switch checked={compareMode} onCheckedChange={setCompareMode} />
        <Label className="text-sm">Compare against a second provider/model</Label>
      </div>
      {compareMode && (
        <div className="grid grid-cols-2 gap-2 border border-border p-3">
          <div>
            <Label className="text-xs">Provider B</Label>
            <Input value={compareProvider} onChange={(e) => setCompareProvider(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Model B</Label>
            <Input value={compareModel} onChange={(e) => setCompareModel(e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" onClick={handleRun} disabled={running}>
          {running && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Run
        </Button>
        {stage.external_service && (
          <Button type="button" variant="outline" onClick={handleBenchmark} disabled={benchmarking}>
            {benchmarking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Benchmark (2 configs)
          </Button>
        )}
      </div>

      {result && (
        <div className="space-y-3 border border-border p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{result.provider}</Badge>
            <span className="tabular-nums text-muted-foreground">{result.timing_ms}ms</span>
            {result.cost_estimate > 0 && (
              <span className="tabular-nums text-muted-foreground">~${result.cost_estimate.toFixed(4)}</span>
            )}
            {result.warnings.map((w, i) => (
              <Badge key={i} variant="outline">{w}</Badge>
            ))}
          </div>
          {result.error ? (
            <p className="text-sm font-semibold">{result.error}</p>
          ) : compareMode && compareResult ? (
            <DiffView
              left={result.output}
              right={compareResult.output}
              leftLabel={provider || "default"}
              rightLabel={compareProvider || "default"}
            />
          ) : (
            <JsonViewer data={result.output} />
          )}

          <div className="flex gap-2 items-end pt-2">
            <div className="flex-1">
              <Label className="text-xs">Save as fixture</Label>
              <Input
                value={saveFixtureName}
                onChange={(e) => setSaveFixtureName(e.target.value)}
                placeholder="fixture-name"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleSaveFixture}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(result.output, null, 2));
                toast.success("Output copied.");
              }}
            >
              Copy output
            </Button>
          </div>
        </div>
      )}

      {benchmarkRows && (
        <div className="space-y-2">
          <Label>Benchmark results</Label>
          <BenchmarkTable rows={benchmarkRows} />
        </div>
      )}
    </div>
  );
}
