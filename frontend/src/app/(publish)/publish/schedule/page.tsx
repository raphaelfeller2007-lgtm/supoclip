"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatSupportMessage, parseApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";
import type { Channel, PublishSchedule } from "@/lib/publish-types";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

interface Clip {
  id: string;
  video_url: string;
  clip_order: number;
  metadata_title: string | null;
  hook_title: string | null;
}

function getClipUrl(videoUrl: string) {
  return videoUrl.startsWith("/api/") ? videoUrl : `/api${videoUrl}`;
}

function clipTitle(clip: Clip) {
  return clip.metadata_title || clip.hook_title || `Clip ${clip.clip_order}`;
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function isoDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function getCalendarDays(year: number, month: number) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const days: { date: Date; inMonth: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    days.push({ date: new Date(Date.UTC(year, month, -i)), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: new Date(Date.UTC(year, month, d)), inMonth: true });
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date;
    days.push({ date: new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 1)), inMonth: false });
  }
  return days;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SchedulePageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-10 w-96" />
      <div className="flex gap-8">
        <Skeleton className="h-96 w-[420px]" />
        <Skeleton className="h-96 flex-1" />
      </div>
    </div>
  );
}

function PublishScheduleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");
  const clipIdsParam = searchParams.get("clipIds") ?? "";
  const clipIds = useMemo(
    () => clipIdsParam.split(",").map((id) => id.trim()).filter(Boolean),
    [clipIdsParam],
  );

  const [clips, setClips] = useState<Clip[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [schedulesByClipId, setSchedulesByClipId] = useState<Record<string, PublishSchedule>>({});
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [visibleMonth, setVisibleMonth] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
  const [calendarSchedules, setCalendarSchedules] = useState<PublishSchedule[]>([]);

  const [detailsModalClipId, setDetailsModalClipId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftVisibility, setDraftVisibility] = useState<PublishSchedule["visibility"]>("public");
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const channelById = useMemo(
    () => Object.fromEntries(channels.map((channel) => [channel.id, channel])),
    [channels],
  );

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    try {
      const response = await fetch(`/api/publish/calendar?start=${start}&end=${end}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setCalendarSchedules((data.schedules ?? []) as PublishSchedule[]);
    } catch {
      // non-critical — calendar just stays stale until the next successful fetch
    }
  }, []);

  const load = useCallback(async () => {
    if (!taskId || clipIds.length === 0) {
      setError("No clips selected.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [clipsResponse, channelsResponse, schedulesResponse] = await Promise.all([
        fetch(`/api/tasks/${taskId}/clips`, { cache: "no-store" }),
        fetch(`/api/channels`, { cache: "no-store" }),
        fetch(`/api/publish/schedules?clip_ids=${clipIds.join(",")}`, { cache: "no-store" }),
      ]);
      if (!clipsResponse.ok) {
        const parsed = await parseApiError(clipsResponse, `Failed to load clips: ${clipsResponse.status}`);
        throw new Error(formatSupportMessage(parsed));
      }
      if (!channelsResponse.ok) {
        const parsed = await parseApiError(channelsResponse, `Failed to load channels: ${channelsResponse.status}`);
        throw new Error(formatSupportMessage(parsed));
      }
      if (!schedulesResponse.ok) {
        const parsed = await parseApiError(schedulesResponse, `Failed to load schedules: ${schedulesResponse.status}`);
        throw new Error(formatSupportMessage(parsed));
      }

      const clipsData = await clipsResponse.json();
      const channelsData = await channelsResponse.json();
      const schedulesData = await schedulesResponse.json();

      const clipIdSet = new Set(clipIds);
      const selectedClips = ((clipsData.clips ?? []) as Clip[])
        .filter((clip) => clipIdSet.has(clip.id))
        .sort((a, b) => a.clip_order - b.clip_order);
      setClips(selectedClips);
      setChannels((channelsData.channels ?? []) as Channel[]);

      const scheduleMap: Record<string, PublishSchedule> = {};
      for (const schedule of (schedulesData.schedules ?? []) as PublishSchedule[]) {
        scheduleMap[schedule.clip_id] = schedule;
      }
      setSchedulesByClipId(scheduleMap);

      const firstUnscheduled = selectedClips.find((clip) => !scheduleMap[clip.id]?.scheduled_at);
      setSelectedClipId(firstUnscheduled ? firstUnscheduled.id : (selectedClips[0]?.id ?? null));

      await fetchCalendar(now.getUTCFullYear(), now.getUTCMonth());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, clipIdsParam]);

  useEffect(() => {
    load();
  }, [load]);

  const applyScheduleUpdate = useCallback(
    async (clipId: string, patch: Record<string, unknown>, optimisticPatch?: Partial<PublishSchedule>) => {
      const previous = schedulesByClipId[clipId];
      if (optimisticPatch) {
        setSchedulesByClipId((prev) => ({
          ...prev,
          [clipId]: {
            ...(previous ?? ({ channel_ids: [] } as unknown as PublishSchedule)),
            ...optimisticPatch,
          } as PublishSchedule,
        }));
      }
      try {
        const response = await fetch(`/api/publish/clips/${clipId}/schedule`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!response.ok) {
          const parsed = await parseApiError(response, `Failed to update schedule: ${response.status}`);
          throw new Error(formatSupportMessage(parsed));
        }
        const data = await response.json();
        const schedule = data.schedule as PublishSchedule;
        setSchedulesByClipId((prev) => ({ ...prev, [clipId]: schedule }));
        return schedule;
      } catch (err) {
        setSchedulesByClipId((prev) => {
          const next = { ...prev };
          if (previous) next[clipId] = previous;
          else delete next[clipId];
          return next;
        });
        toast.error(err instanceof Error ? err.message : "Failed to update schedule");
        return null;
      }
    },
    [schedulesByClipId],
  );

  const handleToggleChannel = (clipId: string, channelId: string) => {
    const current = schedulesByClipId[clipId];
    const currentIds = current?.channel_ids ?? [];
    const nextIds = currentIds.includes(channelId)
      ? currentIds.filter((id) => id !== channelId)
      : [...currentIds, channelId];
    applyScheduleUpdate(clipId, { channel_ids: nextIds }, { channel_ids: nextIds });
  };

  const handleAssignDay = async (date: Date) => {
    if (!selectedClipId) return;
    const scheduledAt = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9, 0, 0),
    ).toISOString();
    const schedule = await applyScheduleUpdate(
      selectedClipId,
      { scheduled_at: scheduledAt },
      { scheduled_at: scheduledAt },
    );
    if (schedule) {
      fetchCalendar(visibleMonth.year, visibleMonth.month);
      const nextClip = clips.find(
        (clip) => clip.id !== selectedClipId && !schedulesByClipId[clip.id]?.scheduled_at,
      );
      setSelectedClipId(nextClip ? nextClip.id : null);
    }
  };

  const handleAutoSchedule = async () => {
    const unscheduled = clips.filter((clip) => !schedulesByClipId[clip.id]?.scheduled_at);
    if (unscheduled.length === 0) return;
    const cursor = new Date();
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    let succeeded = 0;
    for (const clip of unscheduled) {
      const scheduledAt = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 9, 0, 0),
      ).toISOString();
      const schedule = await applyScheduleUpdate(clip.id, { scheduled_at: scheduledAt }, { scheduled_at: scheduledAt });
      if (schedule) succeeded++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    await fetchCalendar(visibleMonth.year, visibleMonth.month);
    if (succeeded === unscheduled.length) {
      toast.success(`Scheduled ${succeeded} clip${succeeded === 1 ? "" : "s"}`);
    } else {
      toast.error(`Scheduled ${succeeded} of ${unscheduled.length} — some failed`);
    }
  };

  const openDetails = (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId);
    const schedule = schedulesByClipId[clipId];
    setDraftTitle(schedule?.title ?? clip?.metadata_title ?? clip?.hook_title ?? "");
    setDraftDescription(schedule?.description ?? "");
    setDraftTags(parseTags(schedule?.tags ?? null).join(", "));
    setDraftVisibility(schedule?.visibility ?? "public");
    setDetailsModalClipId(clipId);
  };

  const handleSaveDetails = async () => {
    if (!detailsModalClipId) return;
    setIsSavingDetails(true);
    const tags = draftTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const schedule = await applyScheduleUpdate(detailsModalClipId, {
      title: draftTitle || null,
      description: draftDescription || null,
      tags,
      visibility: draftVisibility,
    });
    setIsSavingDetails(false);
    if (schedule) {
      setDetailsModalClipId(null);
    }
  };

  const changeMonth = (delta: number) => {
    setVisibleMonth((prev) => {
      const next = new Date(Date.UTC(prev.year, prev.month + delta, 1));
      const nextMonth = { year: next.getUTCFullYear(), month: next.getUTCMonth() };
      fetchCalendar(nextMonth.year, nextMonth.month);
      return nextMonth;
    });
  };

  const calendarDays = useMemo(
    () => getCalendarDays(visibleMonth.year, visibleMonth.month),
    [visibleMonth],
  );

  const schedulesByDate = useMemo(() => {
    const map: Record<string, PublishSchedule[]> = {};
    for (const schedule of calendarSchedules) {
      if (!schedule.scheduled_at) continue;
      const key = isoDate(schedule.scheduled_at);
      (map[key] ??= []).push(schedule);
    }
    return map;
  }, [calendarSchedules]);

  const selectedClipDateIso = useMemo(() => {
    const schedule = selectedClipId ? schedulesByClipId[selectedClipId] : null;
    return schedule?.scheduled_at ? isoDate(schedule.scheduled_at) : null;
  }, [selectedClipId, schedulesByClipId]);

  const scheduledCount = clips.filter((clip) => schedulesByClipId[clip.id]?.status === "scheduled").length;

  if (isLoading) return <SchedulePageSkeleton />;

  if (error || !taskId) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <EmptyState
          icon={CalendarDays}
          title="Couldn't load schedule"
          description={error ?? undefined}
          action={{ label: "Back to projects", href: "/list" }}
        />
      </div>
    );
  }

  const monthLabel = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      <div className="py-8 space-y-2">
        <Link
          href={`/publish/select?taskId=${taskId}`}
          className="text-small text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to clip selection
        </Link>
        <div className="text-label uppercase text-muted-foreground">Step 2 of 2 — Publishing</div>
        <h1 className="text-headline">Schedule &amp; assign channels</h1>
        <p className="text-body text-muted-foreground">
          {clips.length} clip{clips.length === 1 ? "" : "s"} ready — channels are pre-selected from
          generation. Adjust and pick a date for each.
        </p>
      </div>

      <div className="flex gap-8 items-start">
        <div className="w-[420px] shrink-0 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-label uppercase text-muted-foreground">Clips ({clips.length})</span>
            <Button variant="outline" size="sm" onClick={handleAutoSchedule}>
              Auto-schedule remaining
            </Button>
          </div>

          <p className="bg-muted p-4 text-small text-muted-foreground">
            Select a clip, then click a date on the calendar to schedule it.
          </p>

          <div className="border border-border divide-y divide-border">
            {clips.map((clip) => {
              const schedule = schedulesByClipId[clip.id];
              const channelIds = schedule?.channel_ids ?? [];
              const isSelected = selectedClipId === clip.id;

              let statusText: string;
              let statusClass = "text-muted-foreground";
              if (schedule?.status === "scheduled" && schedule.scheduled_at) {
                const date = new Date(schedule.scheduled_at);
                statusText = `Scheduled · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · ${channelIds.length} channel${channelIds.length === 1 ? "" : "s"}`;
              } else if (schedule?.scheduled_at) {
                const date = new Date(schedule.scheduled_at);
                statusText = `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · 0 channels — pick one to finish scheduling`;
                statusClass = "text-accent-ink";
              } else {
                statusText = "Not scheduled — click a date →";
                statusClass = "text-accent-ink";
              }

              return (
                <div
                  key={clip.id}
                  className={`p-3 space-y-2 ${isSelected ? "bg-muted" : ""} border-l-2 ${isSelected ? "border-l-primary" : "border-l-transparent"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedClipId(clip.id)}
                    className="flex items-start gap-3 w-full text-left"
                  >
                    <video
                      src={getClipUrl(clip.video_url)}
                      className="w-10 h-16 object-cover bg-foreground shrink-0"
                      muted
                      playsInline
                    />
                    <span className="text-small font-medium leading-tight">{clipTitle(clip)}</span>
                  </button>

                  <div className="flex flex-wrap gap-1.5 pl-[52px]">
                    {channels.map((channel) => {
                      const active = channelIds.includes(channel.id);
                      return (
                        <Button
                          key={channel.id}
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className="rounded-full h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleChannel(clip.id, channel.id);
                          }}
                        >
                          {channel.title ?? channel.handle ?? "Channel"}
                        </Button>
                      );
                    })}
                  </div>

                  <div className="pl-[52px] flex items-center justify-between gap-2">
                    <span className={`text-label ${statusClass}`}>{statusText}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetails(clip.id);
                      }}
                      className="text-label font-medium underline text-muted-foreground hover:text-foreground shrink-0"
                    >
                      {schedule?.description || schedule?.tags ? "Edit details" : "Add details →"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-title">{monthLabel}</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon-sm" onClick={() => changeMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => changeMonth(1)} aria-label="Next month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-border border border-border">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="bg-foreground text-background text-center py-2 text-label uppercase"
              >
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border border border-t-0 border-border">
            {calendarDays.map(({ date, inMonth }) => {
              const iso = date.toISOString().slice(0, 10);
              const dayItems = schedulesByDate[iso] ?? [];
              const isSelectedClipDay = selectedClipDateIso === iso;
              return (
                <button
                  key={iso + (inMonth ? "-in" : "-out")}
                  type="button"
                  onClick={() => handleAssignDay(date)}
                  className={`bg-background text-left p-2 min-h-28 align-top ${
                    inMonth ? "" : "opacity-40"
                  } ${isSelectedClipDay ? "ring-2 ring-inset ring-foreground" : ""}`}
                >
                  <div className="text-small font-bold">{date.getUTCDate()}</div>
                  {dayItems.map((item) => {
                    const chNames =
                      item.channel_ids.length === 0
                        ? "No channel"
                        : item.channel_ids.length === 1
                          ? (channelById[item.channel_ids[0]]?.title ?? "Channel")
                          : `${item.channel_ids.length} channels`;
                    return (
                      <div
                        key={item.id}
                        className="mt-1.5 bg-foreground text-background text-label px-1.5 py-0.5 truncate"
                      >
                        {chNames} · {item.title ?? "Untitled"}
                      </div>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <p className="text-small text-muted-foreground">
            {scheduledCount} of {clips.length} scheduled
          </p>
          <Button
            disabled={scheduledCount === 0}
            onClick={() => {
              toast.success(`Scheduled ${scheduledCount} post${scheduledCount === 1 ? "" : "s"}`);
              router.push(`/tasks/${taskId}`);
            }}
          >
            Schedule {scheduledCount} posts
          </Button>
        </div>
      </div>

      <Dialog open={!!detailsModalClipId} onOpenChange={(open) => !open && setDetailsModalClipId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Video details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-label uppercase text-muted-foreground">Title</label>
              <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <label className="text-label uppercase text-muted-foreground">Description</label>
              <Textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="What this clip is about…"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-label uppercase text-muted-foreground">Tags</label>
                <Input
                  value={draftTags}
                  onChange={(e) => setDraftTags(e.target.value)}
                  placeholder="founders, startups"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-label uppercase text-muted-foreground">Visibility</label>
                <Select
                  value={draftVisibility}
                  onValueChange={(value) => setDraftVisibility(value as PublishSchedule["visibility"])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setDetailsModalClipId(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDetails} disabled={isSavingDetails}>
              {isSavingDetails ? "Saving…" : "Save details"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PublishSchedulePage() {
  return (
    <Suspense fallback={<SchedulePageSkeleton />}>
      <PublishScheduleContent />
    </Suspense>
  );
}
