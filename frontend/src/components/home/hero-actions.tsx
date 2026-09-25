"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, ArrowRight } from "lucide-react";

import { setPendingFile } from "@/lib/pending-file-transfer";
import type { LastOpenedProject } from "@/lib/last-project";

interface HeroActionsProps {
  lastProject: LastOpenedProject | null;
}

/** "Start something" — the home screen's entry points into the clipping
 * flow, graded by weight rather than made equal: New Clip is the one
 * accent-filled cell on the page (DESIGN.md §2's "one shape a reader must
 * find first"), Import Video and Continue are quiet secondary actions beside
 * it. Drag-and-drop onto the page (handled by the parent, home-app.tsx) uses
 * the same pending-file handoff as "Import Video". */
export function HeroActions({ lastProject }: HeroActionsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setPendingFile(file);
    router.push("/create");
  };

  return (
    <section>
      <h2 className="text-label uppercase text-muted-foreground mb-3">Start something</h2>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <button
          type="button"
          onClick={() => router.push("/create")}
          className="lg:col-span-3 flex items-center gap-5 p-8 bg-primary text-primary-foreground text-left transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="w-8 h-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-title">New Clip</p>
            <p className="text-small">Paste a link or upload a video to get started</p>
          </div>
          <ArrowRight className="w-5 h-5 shrink-0" />
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-3 p-6 border border-border bg-background hover:border-foreground transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-small font-bold text-foreground">Import Video</p>
              <p className="text-small text-muted-foreground truncate">From this device</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleImportFile(e.target.files)}
            />
          </button>

          {lastProject && (
            <button
              type="button"
              onClick={() => router.push(`/tasks/${lastProject.id}`)}
              className="flex items-center gap-3 p-6 border border-border bg-background hover:border-foreground transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-small font-bold text-foreground">Continue</p>
                <p className="text-small text-muted-foreground truncate">{lastProject.title}</p>
              </div>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
