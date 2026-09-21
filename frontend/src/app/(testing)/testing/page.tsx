"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FlaskConical } from "lucide-react";

import { StageRunnerPanel } from "@/components/testing/stage-runner-panel";
import type { StageSpec } from "@/components/testing/types";

export default function TestingPage() {
  const [stages, setStages] = useState<StageSpec[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/testing/stages");
        if (!response.ok) {
          setLoadFailed(true);
          return;
        }
        const data = await response.json();
        const list: StageSpec[] = data.stages ?? [];
        setStages(list);
        if (list.length > 0) setSelectedKey(`${list[0].tool}.${list[0].id}`);
      } catch {
        setLoadFailed(true);
      }
    })();
  }, []);

  if (loadFailed) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <EmptyState
          icon={FlaskConical}
          title="Testing tab is unavailable"
          description="Set ENABLE_TESTING_TOOL=true on the backend to use this tab."
        />
      </div>
    );
  }

  const selectedStage = stages?.find((s) => `${s.tool}.${s.id}` === selectedKey) ?? null;
  const byTool = (stages ?? []).reduce<Record<string, StageSpec[]>>((acc, stage) => {
    (acc[stage.tool] ??= []).push(stage);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-[220px_1fr] gap-8">
      <aside className="space-y-6">
        {Object.entries(byTool).map(([tool, toolStages]) => (
          <div key={tool}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {tool}
            </h3>
            <div className="space-y-1">
              {toolStages.map((stage) => {
                const key = `${stage.tool}.${stage.id}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm border-l-2",
                      selectedKey === key
                        ? "border-l-foreground font-semibold"
                        : "border-l-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {stage.name}
                    {!stage.external_service && (
                      <Badge variant="outline" className="ml-2 align-middle">
                        free
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <main>{selectedStage ? <StageRunnerPanel stage={selectedStage} /> : null}</main>
    </div>
  );
}
