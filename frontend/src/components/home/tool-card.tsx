"use client";

import { useState } from "react";
import Link from "next/link";

import type { Tool } from "@/tools/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * One card in the home screen's Tools grid — the primary discovery surface
 * for future tools (see CLAUDE.md's "Multi-Tool Platform Shell"). A
 * route-owning tool (`href` set — Clipping today) is active and clickable;
 * a mount-based tool with no route (Placeholder today, and any future stub
 * registered the same way) renders as a non-clickable "coming soon" tile.
 */
export function ToolCard({ tool, statusLabel }: { tool: Tool; statusLabel?: string }) {
  const isActive = Boolean(tool.href);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const thumbnail =
    tool.thumbnail && !thumbnailFailed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={tool.thumbnail}
        alt=""
        className="w-full h-24 object-cover border-b border-border"
        onError={() => setThumbnailFailed(true)}
      />
    ) : (
      // Fallback when a thumbnail is missing/fails to load: a plain
      // CSS-generated icon tile so a tool card never breaks visually.
      <div className="w-full h-24 flex items-center justify-center border-b border-border">
        <tool.icon className="w-8 h-8 text-muted-foreground" />
      </div>
    );

  return (
    <div className="border border-border bg-background hover:border-foreground transition-colors flex flex-col">
      {thumbnail}
      <div className="p-6 flex flex-col gap-4 flex-1">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <tool.icon className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="text-title text-foreground truncate">{tool.name}</span>
          </div>
          {statusLabel && (
            <Badge variant="outline" className="font-mono uppercase text-accent-ink border-accent-ink shrink-0">
              {statusLabel}
            </Badge>
          )}
        </div>
        <p className="text-small text-muted-foreground leading-snug flex-1">{tool.description}</p>
        {isActive ? (
          <Link href={tool.href!} className="w-full">
            <Button size="sm" variant="outline" className="w-full">
              Open
            </Button>
          </Link>
        ) : (
          <Button size="sm" variant="outline" disabled className="w-full text-muted-foreground">
            Coming soon
          </Button>
        )}
      </div>
    </div>
  );
}
