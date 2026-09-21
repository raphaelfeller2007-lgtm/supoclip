"use client";

import { useState } from "react";

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">null</span>;
  }
  if (typeof value === "string") {
    return <span className="text-foreground">&quot;{value}&quot;</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-foreground">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {value.map((item, idx) => (
          <div key={idx} className="border-l border-border pl-2">
            <span className="text-muted-foreground">[{idx}] </span>
            <JsonNode value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {entries.map(([key, val]) => (
          <div key={key} className="border-l border-border pl-2">
            <span className="font-medium text-foreground">{key}: </span>
            <JsonNode value={val} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

export function JsonViewer({ data }: { data: unknown }) {
  const [raw, setRaw] = useState(false);

  if (data === null || data === undefined) {
    return <p className="text-sm text-muted-foreground">No output.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setRaw((r) => !r)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {raw ? "Formatted" : "Raw JSON"}
        </button>
      </div>
      {raw ? (
        <pre className="text-xs font-mono bg-muted/30 border border-border p-3 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <div className="text-xs font-mono bg-muted/30 border border-border p-3 overflow-x-auto">
          <JsonNode value={data} />
        </div>
      )}
    </div>
  );
}
