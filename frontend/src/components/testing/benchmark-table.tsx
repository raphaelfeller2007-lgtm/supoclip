"use client";

import { Fragment, useState } from "react";

import { Badge } from "@/components/ui/badge";

import { JsonViewer } from "./json-viewer";
import type { BenchmarkRow } from "./types";

export function BenchmarkTable({ rows }: { rows: BenchmarkRow[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (rows.length === 0) return null;

  return (
    <div className="border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="p-2 font-medium">Run</th>
            <th className="p-2 font-medium">Provider</th>
            <th className="p-2 font-medium">Time</th>
            <th className="p-2 font-medium">Cost (est.)</th>
            <th className="p-2 font-medium">Output</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <Fragment key={idx}>
              <tr className="border-b border-border last:border-b-0">
                <td className="p-2 font-medium">{row.label}</td>
                <td className="p-2">
                  <Badge variant="outline">{row.provider}</Badge>
                  {row.error && <Badge variant="destructive" className="ml-1">error</Badge>}
                </td>
                <td className="p-2 tabular-nums">{row.timing_ms}ms</td>
                <td className="p-2 tabular-nums">${row.cost_estimate.toFixed(4)}</td>
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === idx ? null : idx)}
                    className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                  >
                    {expanded === idx ? "Hide" : "View"}
                  </button>
                </td>
              </tr>
              {expanded === idx && (
                <tr className="border-b border-border last:border-b-0">
                  <td colSpan={5} className="p-2 bg-muted/20">
                    {row.error ? (
                      <p className="text-sm">{row.error}</p>
                    ) : (
                      <JsonViewer data={row.output} />
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
