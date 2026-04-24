// ── Channels DVR Server API Types ──────────────────────────────────────────

export interface Episode {
  id: string;
  show_id: string;
  program_id: string;
  path: string;
  channel: string;
  season_number: number;
  episode_number: number;
  title: string;
  episode_title: string;
  event_title?: string;
  summary: string;
  full_summary?: string;
  content_rating?: string;
  image_url?: string;
  thumbnail_url?: string;
  duration: number;
  playback_time: number;
  original_air_date?: string;
  genres?: string[];
  tags?: string[];
  labels?: string[];
  categories?: string[];
  cast?: string[];
  directors?: string[];
  commercials?: number[];
  watched: boolean;
  favorited: boolean;
  delayed: boolean;
  cancelled: boolean;
  corrupted: boolean;
  completed: boolean;
  processed: boolean;
  locked: boolean;
  verified: boolean;
  last_watched_at?: number;
  created_at: number;
  updated_at: number;
}

export interface Show {
  id: string;
  name: string;          // API uses 'name', not 'title'
  summary?: string;
  image_url?: string;
  genres?: string[];
  episode_count?: number;
  number_unwatched?: number;
  favorited?: boolean;
  last_watched_at?: number;
  last_recorded_at?: number;
  created_at?: number;
  updated_at?: number;
}

export interface Movie {
  id: string;
  program_id: string;
  path: string;
  channel: string;
  title: string;
  summary: string;
  full_summary?: string;
  content_rating?: string;
  image_url?: string;
  thumbnail_url?: string;
  duration: number;
  playback_time: number;
  release_year?: number;
  release_date?: string;
  genres?: string[];
  tags?: string[];
  labels?: string[];
  categories?: string[];
  cast?: string[];
  directors?: string[];
  commercials?: number[];
  watched: boolean;
  favorited: boolean;
  delayed: boolean;
  cancelled: boolean;
  corrupted: boolean;
  completed: boolean;
  processed: boolean;
  verified: boolean;
  last_watched_at?: number;
  created_at: number;
  updated_at: number;
}

export interface VideoGroup {
  id: string;
  name: string;          // API uses 'name', not 'title'
  summary?: string;
  image_url?: string;
  video_count?: number;
  number_unwatched?: number;
  favorited?: boolean;
  last_watched_at?: number;
  created_at?: number;
  updated_at?: number;
}

export interface Video {
  id: string;
  video_group_id: string;  // API uses 'video_group_id', not 'group_id'
  title: string;           // group name
  video_title: string;     // individual video title
  summary?: string;
  image_url?: string;
  thumbnail_url?: string;
  duration: number;
  playback_time: number;
  watched: boolean;
  favorited: boolean;
  created_at: number;
  updated_at: number;
}

export interface Channel {
  id: string;
  name: string;
  number: string;
  logo_url?: string;
  hd?: boolean;
  favorited?: boolean;
  hidden?: boolean;
  source_name?: string;
  source_id?: string;
  station_id?: string;
}

// Unified recording returned by /api/v1/all?source=recordings (covers episodes + movies)
export interface Recording {
  id: string;
  show_id?: string;
  program_id: string;
  path: string;
  channel: string;
  title: string;
  episode_title?: string;
  summary?: string;
  full_summary?: string;
  content_rating?: string;
  image_url?: string;
  thumbnail_url: string;
  duration: number;
  playback_time: number;
  original_air_date?: string;
  release_year?: number;
  release_date?: string;
  season_number?: number;
  episode_number?: number;
  genres?: string[];
  tags?: string[];
  categories?: string[];
  cast?: string[];
  directors?: string[];
  commercials?: number[];
  watched: boolean;
  favorited: boolean;
  delayed: boolean;
  cancelled: boolean;
  corrupted: boolean;
  completed: boolean;
  processed: boolean;
  locked: boolean;
  verified: boolean;
  last_watched_at?: number;
  created_at: number;
  updated_at: number;
}

// Raw DVR file record returned by /dvr/files/{id}
export interface DvrFile {
  ID: string;
  RuleID: string;   // non-empty when the file was created by a DVR rule/pass
  GroupID: string;
  JobID: string;
  Path: string;
  CreatedAt: number;
  Duration: number;
}

// Query params shared across list endpoints
export interface ListParams {
  sort?: string;
  order?: 'asc' | 'desc';
  watched?: boolean;
  favorited?: boolean;
}
