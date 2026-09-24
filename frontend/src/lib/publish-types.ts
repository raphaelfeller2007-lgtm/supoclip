/**
 * Shared shapes for the Publish tool (channels, publish scheduling,
 * analytics) — mirrors the backend's JSON responses exactly
 * (backend/src/repositories/channel_repository.py,
 * publish_schedule_repository.py). Types only, no logic — consumed by the 4
 * pages under `(publish)/`.
 */

export interface Channel {
  id: string;
  user_id: string;
  youtube_channel_id: string;
  handle: string | null;
  title: string | null;
  thumbnail_url: string | null;
  uploads_playlist_id: string | null;
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
  added_input: string;
  sync_status: "pending" | "syncing" | "synced" | "error";
  sync_error: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelVideo {
  id: string;
  channel_id: string;
  youtube_video_id: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface PublishSchedule {
  id: string;
  clip_id: string;
  user_id: string;
  scheduled_at: string | null;
  title: string | null;
  description: string | null;
  /**
   * Raw stored value — a JSON-encoded array string (e.g. '["a","b"]'), or
   * null. The backend writes this with `json.dumps` but never decodes it
   * back on any read path (verified directly against
   * publish_schedule_repository.py / publish_service.py), so every
   * consumer must `JSON.parse` defensively and fall back to `[]`. The
   * PATCH *request* body's `tags` field is a plain `string[]` — only the
   * stored/returned value on this type is the raw string.
   */
  tags: string | null;
  visibility: "public" | "unlisted" | "private";
  status: "draft" | "scheduled";
  created_at: string;
  updated_at: string;
  channel_ids: string[];
}

export interface ChannelAnalytics {
  channels: Channel[];
  totals: { views: number; subscribers: number; videos: number };
  watch_time_minutes: number | null;
  watch_time_available: boolean;
  subscribers_gained: number | null;
  subscribers_gained_window: "7_days" | "since_tracked";
  views_by_day: { date: string; views: number | null }[];
  recent_videos: ChannelVideo[];
}
