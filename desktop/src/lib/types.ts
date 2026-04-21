/** Shared types for ubongo UI */

export type ResultType =
  | "file"
  | "app"
  | "system"
  | "music"
  | "web"
  | "task"
  | "answer"
  | "error";

export interface ResultItem {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  icon?: string;
  thumbnail?: string;
  meta?: string;
  url?: string;
  actions?: ResultAction[];
  preview?: PreviewData;
}

export interface ResultAction {
  label: string;
  shortcut?: string;
  primary?: boolean;
  action: () => void;
}

export interface PreviewData {
  type: ResultType;
  heading: string;
  subheading?: string;
  summary?: string;
  image?: string;
  thumbnails?: string[];
  links?: { label: string; url: string }[];
  metadata?: Record<string, string>;
  gauges?: GaugeData[];
  steps?: StepData[];
  music?: MusicData;
}

export interface GaugeData {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}

export interface StepData {
  text: string;
  status: "done" | "loading" | "pending" | "error";
  meta?: string;
  tool?: string;
}

export interface MusicData {
  track: string;
  artist: string;
  album?: string;
  artwork?: string;
  isPlaying: boolean;
  progress?: number;
  duration?: number;
}

export interface StatusData {
  display_name?: string;
  provider_display?: string;
  tier_class?: string;
  effective_tier?: string;
  model?: string;
  monthly_query_count?: number;
  query_limit?: number;
  internet?: boolean;
  anthropic_ready?: boolean;
}

// ── Rich Response Cards ──────────────────────────────────────────────────

export type CardType = "news" | "search" | "file" | "music" | "app" | "system" | "markdown" | "screenshot";

export interface NewsItem {
  headline: string;
  source: string;
  source_url: string;
  thumbnail_url?: string;
  date?: string;
  snippet: string;
  url: string;
}

export interface SearchItem {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export interface FileItem {
  name: string;
  path: string;
  size: string;
  extension: string;
  modified?: string;
}

export interface AppInfo {
  app_name: string;
  action: string;
  status: "success" | "failed" | "not_found";
}

export interface SystemMetric {
  label: string;
  value: number;
  max: number;
  unit: string;
}

export interface MusicInfo {
  track: string;
  artist: string;
  album?: string;
  artwork_url?: string;
  is_playing: boolean;
}

export interface ScreenshotInfo {
  path: string;
  filename: string;
  mode: "full" | "window" | "selection" | string;
  /** Inlined PNG (only when describe_screen was used — avoids a file-URL). */
  base64?: string;
  /** Vision-generated description (only when describe_screen was used). */
  description?: string;
}

export type ResponseCard =
  | { type: "news";       data: { items: NewsItem[] } }
  | { type: "search";     data: { query: string; items: SearchItem[] } }
  | { type: "file";       data: { items: FileItem[] } }
  | { type: "music";      data: MusicInfo }
  | { type: "app";        data: AppInfo }
  | { type: "system";     data: { metrics: SystemMetric[] } }
  | { type: "markdown";   data: { content: string } }
  | { type: "screenshot"; data: ScreenshotInfo };

export interface QueryResult {
  content?: string;
  model?: string;
  detail?: string;
  cards?: ResponseCard[];
  steps?: Array<{
    tool?: string;
    result: string;
    success: boolean;
  }>;
}
