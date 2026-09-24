"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatSupportMessage, parseApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";
import type { Channel, ChannelAnalytics } from "@/lib/publish-types";
import { BarChart3 } from "lucide-react";

function formatCount(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function formatDayLabel(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function PublishAnalyticsPage() {
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<ChannelAnalytics | null>(null);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoadingChannels(true);
      try {
        const response = await fetch("/api/channels", { cache: "no-store" });
        if (!response.ok) {
          const parsed = await parseApiError(response, `Failed to load channels: ${response.status}`);
          throw new Error(formatSupportMessage(parsed));
        }
        const data = await response.json();
        setAllChannels((data.channels ?? []) as Channel[]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load channels");
      } finally {
        setIsLoadingChannels(false);
      }
    })();
  }, []);

  const loadAnalytics = useCallback(async () => {
    setIsLoadingAnalytics(true);
    try {
      const query = selectedChannelIds.length ? `?channel_ids=${selectedChannelIds.join(",")}` : "";
      const response = await fetch(`/api/channels/analytics${query}`, { cache: "no-store" });
      if (!response.ok) {
        const parsed = await parseApiError(response, `Failed to load analytics: ${response.status}`);
        throw new Error(formatSupportMessage(parsed));
      }
      setAnalytics((await response.json()) as ChannelAnalytics);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [selectedChannelIds]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
    );
  };

  const isAllActive = selectedChannelIds.length === 0;
  const maxViews = Math.max(1, ...(analytics?.views_by_day.map((day) => day.views ?? 0) ?? [1]));

  if (!isLoadingChannels && allChannels.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-headline mb-8">Analytics</h1>
        <EmptyState
          icon={BarChart3}
          title="No channels tracked yet"
          description="Add a channel to see its performance here."
          action={{ label: "Add a channel", href: "/publish/channels" }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-headline">Analytics</h1>
        <p className="text-body text-muted-foreground">Simple performance across your channels.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={isAllActive ? "default" : "outline"}
          className="rounded-full"
          onClick={() => setSelectedChannelIds([])}
        >
          All channels
        </Button>
        {allChannels.map((channel) => (
          <Button
            key={channel.id}
            size="sm"
            variant={selectedChannelIds.includes(channel.id) ? "default" : "outline"}
            className="rounded-full"
            onClick={() => toggleChannel(channel.id)}
          >
            {channel.title ?? channel.handle ?? "Channel"}
          </Button>
        ))}
      </div>

      {isLoadingAnalytics || !analytics ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <div className="border border-border p-6">
              <p className="text-label uppercase text-muted-foreground">Total views</p>
              <p className="text-headline mt-2">{formatCount(analytics.totals.views)}</p>
            </div>
            <div className="border border-border p-6">
              <p className="text-label uppercase text-muted-foreground">Watch time</p>
              <p className="text-title mt-2 text-muted-foreground">Not available</p>
            </div>
            <div className="border border-border p-6">
              <p className="text-label uppercase text-muted-foreground">Subscribers gained</p>
              <p className="text-headline mt-2">
                {analytics.subscribers_gained === null
                  ? "—"
                  : `+${formatCount(analytics.subscribers_gained)}`}
              </p>
              <p className="text-label text-muted-foreground mt-1">
                {analytics.subscribers_gained_window === "7_days" ? "Last 7 days" : "Since tracked"}
              </p>
            </div>
            <div className="border border-border p-6">
              <p className="text-label uppercase text-muted-foreground">Videos published</p>
              <p className="text-headline mt-2">{analytics.totals.videos}</p>
            </div>
          </div>

          <div>
            <h2 className="text-title mb-5">Views, last 7 days</h2>
            <div className="flex items-end gap-5">
              {analytics.views_by_day.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="text-label text-muted-foreground">
                    {day.views === null ? "—" : formatCount(day.views)}
                  </div>
                  <div className="w-full h-32 flex items-end">
                    {day.views === null ? (
                      <div className="w-full border-t border-dashed border-border" />
                    ) : (
                      <div
                        className="w-full bg-primary"
                        style={{ height: `${Math.max(4, (day.views / maxViews) * 100)}%` }}
                      />
                    )}
                  </div>
                  <div className="text-label uppercase text-muted-foreground">
                    {formatDayLabel(day.date)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-title mb-5">Recent videos</h2>
            {analytics.recent_videos.length === 0 ? (
              <p className="text-small text-muted-foreground">No synced videos yet.</p>
            ) : (
              <div className="divide-y divide-border border-t border-border">
                {analytics.recent_videos.map((video) => (
                  <div key={video.id} className="flex items-center gap-4 py-4">
                    {video.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.thumbnail_url}
                        alt=""
                        className="w-24 aspect-video object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium truncate">{video.title ?? "Untitled video"}</p>
                      <p className="text-small text-muted-foreground">
                        {video.published_at ? new Date(video.published_at).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div className="w-24 text-right text-small shrink-0">
                      {video.view_count === null ? "—" : formatCount(video.view_count)} views
                    </div>
                    <div className="w-24 text-right text-small shrink-0">
                      {video.like_count === null ? "—" : formatCount(video.like_count)} likes
                    </div>
                    <div className="w-28 text-right text-small shrink-0">
                      {video.comment_count === null ? "—" : formatCount(video.comment_count)} comments
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
