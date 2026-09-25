-- cleanup_orphaned_uploads_job (workers/tasks.py) runs a `LIKE 'upload://%'`
-- scan against sources.url/ranking_folder_clips.file_path/ranking_inputs.file_path
-- every night to find still-referenced uploads before sweeping orphans. None
-- of those columns had an index, so every run was a full sequential scan
-- that only grows as more tasks/rankings accumulate (rows are never
-- deleted from these tables). varchar_pattern_ops makes a left-anchored
-- LIKE 'prefix%' usable by a plain btree index regardless of locale.
CREATE INDEX IF NOT EXISTS idx_sources_url_pattern ON sources (url varchar_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_ranking_folder_clips_file_path_pattern ON ranking_folder_clips (file_path varchar_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_ranking_inputs_file_path_pattern ON ranking_inputs (file_path varchar_pattern_ops);
