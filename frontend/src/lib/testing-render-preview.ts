// Shape of a Testing tab render-preview request — mirrors
// backend/src/api/routes/testing.py's RenderPreviewPayload.
export interface RenderPreviewPayload {
  media_path?: string;
  session_clip_key?: string;
  start_time?: number;
  end_time?: number;
  add_subtitles?: boolean;
  font_family?: string | null;
  font_size?: number | null;
  font_color?: string | null;
  caption_template?: string;
  output_format?: string;
  keep_ranges?: number[][];
  hook_title?: string | null;
  hook_style?: Record<string, unknown> | null;
  social_overlay?: Record<string, unknown> | null;
  reactions?: Record<string, unknown>[] | null;
  cleanup_settings?: Record<string, unknown> | null;
}

export interface RankingRenderPreviewPayload {
  template_id?: string;
  number_overlay?: Record<string, unknown> | null;
  use_global_sfx?: boolean | null;
}

export interface TemplateSummary {
  id: string;
  name: string;
  section_count: number;
}
