"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatSupportMessage, parseApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";
import type { Channel } from "@/lib/publish-types";
import { Youtube } from "lucide-react";

const SYNC_STATUS_LABEL: Record<Channel["sync_status"], string> = {
  pending: "Syncing…",
  syncing: "Syncing…",
  synced: "Synced",
  error: "Sync failed",
};

function formatCount(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function PublishChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newChannelInput, setNewChannelInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingChannel, setRemovingChannel] = useState<Channel | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChannels = useCallback(async () => {
    const response = await fetch("/api/channels", { cache: "no-store" });
    if (!response.ok) {
      const parsed = await parseApiError(response, `Failed to load channels: ${response.status}`);
      throw new Error(formatSupportMessage(parsed));
    }
    const data = await response.json();
    return (data.channels ?? []) as Channel[];
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        setChannels(await fetchChannels());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load channels");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [fetchChannels]);

  // Poll while any channel is still syncing, so a freshly-added channel's
  // status updates without a manual refresh.
  useEffect(() => {
    const hasPending = channels.some(
      (channel) => channel.sync_status === "pending" || channel.sync_status === "syncing",
    );
    if (!hasPending) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        setChannels(await fetchChannels());
      } catch {
        // transient — next tick retries
      }
    }, 5000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [channels, fetchChannels]);

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = newChannelInput.trim();
    if (!input) return;
    setIsAdding(true);
    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!response.ok) {
        const parsed = await parseApiError(response, `Failed to add channel: ${response.status}`);
        throw new Error(formatSupportMessage(parsed));
      }
      const data = await response.json();
      const channel = data.channel as Channel;
      setChannels((prev) => [channel, ...prev]);
      setNewChannelInput("");
      toast.success(`Tracking ${channel.title ?? input}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add channel");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async () => {
    if (!removingChannel) return;
    setIsRemoving(true);
    try {
      const response = await fetch(`/api/channels/${removingChannel.id}`, { method: "DELETE" });
      if (!response.ok) {
        const parsed = await parseApiError(response, `Failed to remove channel: ${response.status}`);
        throw new Error(formatSupportMessage(parsed));
      }
      setChannels((prev) => prev.filter((channel) => channel.id !== removingChannel.id));
      toast.success("Channel removed");
      setRemovingChannel(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove channel");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-headline">Channels</h1>
        <p className="text-body text-muted-foreground">
          Track a YouTube channel and its videos — no sign-in required.
        </p>
      </div>

      <form onSubmit={handleAddChannel} className="flex gap-3">
        <Input
          value={newChannelInput}
          onChange={(e) => setNewChannelInput(e.target.value)}
          placeholder="youtube.com/@channelhandle or channel ID"
          className="flex-1"
          disabled={isAdding}
        />
        <Button type="submit" disabled={isAdding || !newChannelInput.trim()}>
          {isAdding ? "Adding…" : "Add channel"}
        </Button>
      </form>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : channels.length === 0 ? (
        <EmptyState
          icon={Youtube}
          title="No channels tracked yet"
          description="Add a channel above to start tracking its videos and stats."
        />
      ) : (
        <div className="border-t border-border">
          {channels.map((channel) => (
            <div key={channel.id} className="flex items-center gap-4 py-5 border-b border-border">
              <Avatar className="w-12 h-12">
                <AvatarImage src={channel.thumbnail_url ?? undefined} alt={channel.title ?? ""} />
                <AvatarFallback>
                  {(channel.title ?? channel.handle ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-title truncate">{channel.title ?? channel.added_input}</p>
                <p className="text-small text-muted-foreground">
                  {channel.handle ?? channel.added_input}
                </p>
              </div>
              <div className="w-56 text-small text-muted-foreground shrink-0">
                {formatCount(channel.subscriber_count)} subscribers · {formatCount(channel.video_count)}{" "}
                videos
              </div>
              <div className="w-40 text-small shrink-0">
                {channel.sync_status === "error" ? (
                  <span className="text-accent-ink">{channel.sync_error ?? "Sync failed"}</span>
                ) : (
                  <span className="text-muted-foreground">
                    {channel.sync_status === "synced"
                      ? `Synced ${timeAgo(channel.last_synced_at)}`
                      : SYNC_STATUS_LABEL[channel.sync_status]}
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setRemovingChannel(channel)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!removingChannel} onOpenChange={(open) => !open && setRemovingChannel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tracking this channel?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {removingChannel?.title ?? "this channel"} and its synced videos, and clears
              it from any clip you&apos;ve scheduled to publish there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={isRemoving}>
              {isRemoving ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
