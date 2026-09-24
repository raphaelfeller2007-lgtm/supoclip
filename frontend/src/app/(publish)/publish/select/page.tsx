"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { formatSupportMessage, parseApiError } from "@/lib/api-error";
import { ArrowLeft, Check, Clapperboard } from "lucide-react";

interface Clip {
  id: string;
  video_url: string;
  duration: number;
  clip_order: number;
  metadata_title: string | null;
  hook_title: string | null;
  virality_score: number;
}

interface TaskSummary {
  id: string;
  source_title: string | null;
}

function getClipUrl(videoUrl: string) {
  return videoUrl.startsWith("/api/") ? videoUrl : `/api${videoUrl}`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function SelectPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-10 w-96" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-9/16 w-full" />
        ))}
      </div>
    </div>
  );
}

function PublishSelectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");

  const [task, setTask] = useState<TaskSummary | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const showLoading = useDelayedFlag(isLoading);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!taskId) {
      setError("No project selected.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [taskResponse, clipsResponse] = await Promise.all([
        fetch(`/api/tasks/${taskId}`, { cache: "no-store" }),
        fetch(`/api/tasks/${taskId}/clips`, { cache: "no-store" }),
      ]);
      if (!taskResponse.ok) {
        const parsed = await parseApiError(taskResponse, `Failed to load project: ${taskResponse.status}`);
        throw new Error(formatSupportMessage(parsed));
      }
      if (!clipsResponse.ok) {
        const parsed = await parseApiError(clipsResponse, `Failed to load clips: ${clipsResponse.status}`);
        throw new Error(formatSupportMessage(parsed));
      }
      const taskData = await taskResponse.json();
      const clipsData = await clipsResponse.json();
      setTask({ id: taskData.id, source_title: taskData.source_title ?? null });
      const sortedClips = ([...(clipsData.clips ?? [])] as Clip[]).sort(
        (a, b) => a.clip_order - b.clip_order,
      );
      setClips(sortedClips);
      setSelectedClipIds(sortedClips.map((clip) => clip.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clips");
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const allSelected = clips.length > 0 && clips.every((clip) => selectedClipIds.includes(clip.id));
  const someSelected = selectedClipIds.length > 0 && !allSelected;

  const handleToggleAll = () => {
    setSelectedClipIds(allSelected ? [] : clips.map((clip) => clip.id));
  };

  const handleToggleClip = (clipId: string) => {
    setSelectedClipIds((prev) =>
      prev.includes(clipId) ? prev.filter((id) => id !== clipId) : [...prev, clipId],
    );
  };

  const handleNext = () => {
    if (!taskId || selectedClipIds.length === 0) return;
    router.push(`/publish/schedule?taskId=${taskId}&clipIds=${selectedClipIds.join(",")}`);
  };

  if (showLoading) {
    return <SelectPageSkeleton />;
  }

  if (error || !task) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <EmptyState
          icon={Clapperboard}
          title="Couldn't load clips"
          description={error ?? undefined}
          action={{ label: "Back to projects", href: "/list" }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-24">
      <div className="py-8 space-y-2">
        <Link
          href={`/tasks/${task.id}`}
          className="text-small text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to project
        </Link>
        <div className="text-label uppercase text-muted-foreground">Step 1 of 2 — Publishing</div>
        <h1 className="text-headline">Choose clips to publish</h1>
        <p className="text-body text-muted-foreground">
          {clips.length} clip{clips.length === 1 ? "" : "s"} generated from &ldquo;
          {task.source_title ?? "Untitled"}&rdquo;
        </p>
      </div>

      {clips.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="No clips yet"
          description="This project hasn't generated any clips yet."
          action={{ label: "Back to project", href: `/tasks/${task.id}` }}
        />
      ) : (
        <>
          <div className="flex items-center justify-between py-4 border-t border-border">
            <p className="text-body">Select which clips to move to Publishing.</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-small text-muted-foreground">
                {selectedClipIds.length} of {clips.length} selected
              </span>
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={handleToggleAll}
                aria-label="Select all clips"
              />
              <span className="text-small font-medium">Select all</span>
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 py-4">
            {clips.map((clip) => {
              const isSelected = selectedClipIds.includes(clip.id);
              return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => handleToggleClip(clip.id)}
                  className={`text-left border-2 p-1 transition-colors ${
                    isSelected ? "border-foreground" : "border-transparent"
                  }`}
                >
                  <div className="relative aspect-9/16 w-full bg-foreground overflow-hidden">
                    <video
                      src={getClipUrl(clip.video_url)}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                    <div
                      aria-hidden="true"
                      className={`absolute top-1.5 left-1.5 w-5 h-5 border-2 border-background flex items-center justify-center ${
                        isSelected ? "bg-background" : "bg-transparent"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-foreground" />}
                    </div>
                    <Badge variant="secondary" className="absolute top-1.5 right-1.5">
                      {formatDuration(clip.duration)}
                    </Badge>
                    <span className="absolute bottom-1.5 right-1.5 text-label font-bold text-accent-ink">
                      {clip.virality_score}
                    </span>
                  </div>
                  <p className="text-small font-medium truncate pt-2">
                    {clip.metadata_title || clip.hook_title || `Clip ${clip.clip_order}`}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {clips.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <p className="text-small text-muted-foreground">
              {selectedClipIds.length} of {clips.length} clips selected
            </p>
            <Button disabled={selectedClipIds.length === 0} onClick={handleNext}>
              Next: Schedule →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PublishSelectPage() {
  return (
    <Suspense fallback={<SelectPageSkeleton />}>
      <PublishSelectContent />
    </Suspense>
  );
}
