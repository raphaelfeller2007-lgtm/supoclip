-- Channel tracking + publish scheduling. Channels are looked up and synced
-- via the public YouTube Data API v3 (no OAuth, no login) — see
-- youtube_utils.py's resolve_channel_identifier/fetch_channel_* helpers and
-- ChannelService (backend/src/services/channel_service.py), synced
-- periodically by an ARQ cron job (workers/tasks.py::poll_channel_updates_job).
-- "Publish" here only means "track an intended date/channels/metadata for a
-- clip in our own DB" — there is no real upload pipeline yet (that needs a
-- later OAuth phase), so clip_publish_schedules.status intentionally only
-- has draft/scheduled, and clip_publish_targets carries no per-channel
-- status/error columns — nothing to track per-channel until uploads exist.

CREATE TABLE IF NOT EXISTS channels (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    youtube_channel_id VARCHAR(64) NOT NULL,
    handle VARCHAR(255),
    title VARCHAR(255),
    thumbnail_url VARCHAR(500),
    uploads_playlist_id VARCHAR(64),
    subscriber_count BIGINT,
    view_count BIGINT,
    video_count INTEGER,
    added_input VARCHAR(500) NOT NULL,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
    sync_error TEXT,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, youtube_channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channels_user_id ON channels(user_id);

CREATE TABLE IF NOT EXISTS channel_videos (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    channel_id VARCHAR(36) NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    youtube_video_id VARCHAR(32) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    thumbnail_url VARCHAR(500),
    published_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    view_count BIGINT,
    like_count BIGINT,
    comment_count BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (channel_id, youtube_video_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_videos_channel_id ON channel_videos(channel_id, published_at DESC);

-- Our own daily history of each channel's totals — the public Data API
-- returns only current totals, never a historical per-day breakdown (that
-- needs OAuth + the YouTube Analytics API), so a "views this week" chart is
-- built from day-over-day deltas of these snapshots, starting thin for a
-- freshly-added channel and filling in over time.
CREATE TABLE IF NOT EXISTS channel_stats_snapshots (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    channel_id VARCHAR(36) NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    subscriber_count BIGINT,
    view_count BIGINT,
    video_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (channel_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_channel_stats_snapshots_channel_id ON channel_stats_snapshots(channel_id, snapshot_date);

-- One row per clip (UNIQUE clip_id): a single scheduled date/metadata plan,
-- fanned out to any number of channels via clip_publish_targets below.
CREATE TABLE IF NOT EXISTS clip_publish_schedules (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    clip_id VARCHAR(36) NOT NULL REFERENCES generated_clips(id) ON DELETE CASCADE,
    -- Denormalized: generated_clips has no direct user_id (only via
    -- task_id -> tasks.user_id), so ownership/calendar queries don't need a
    -- join through tasks on every read.
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    title VARCHAR(100),
    description TEXT,
    tags TEXT,
    visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'unlisted', 'private')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clip_id)
);

CREATE INDEX IF NOT EXISTS idx_clip_publish_schedules_user_id ON clip_publish_schedules(user_id, scheduled_at);

CREATE TABLE IF NOT EXISTS clip_publish_targets (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    schedule_id VARCHAR(36) NOT NULL REFERENCES clip_publish_schedules(id) ON DELETE CASCADE,
    channel_id VARCHAR(36) NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (schedule_id, channel_id)
);
