import request from './client';
import type { Episode, Movie, Recording, Show, ListParams, Channel } from './types';

// ── Shows ──────────────────────────────────────────────────────────────────

export function fetchShows(): Promise<Show[]> {
  return request<Show[]>('/api/v1/shows');
}

export function fetchShow(id: string): Promise<Show> {
  return request<Show>(`/api/v1/shows/${id}`);
}

export function fetchChannels(): Promise<Channel[]> {
  return request<Channel[]>('/api/v1/channels');
}

// ── Episodes ───────────────────────────────────────────────────────────────

export function fetchEpisodes(params?: ListParams): Promise<Episode[]> {
  const p: Record<string, string> = {};
  if (params?.sort) p.sort = params.sort;
  if (params?.order) p.order = params.order;
  if (params?.watched !== undefined) p.watched = String(params.watched);
  if (params?.favorited !== undefined) p.favorited = String(params.favorited);
  return request<Episode[]>('/api/v1/episodes', p);
}

export function fetchEpisode(id: string): Promise<Episode> {
  return request<Episode>(`/api/v1/episodes/${id}`);
}

export function fetchEpisodesForShow(showId: string): Promise<Episode[]> {
  return request<Episode[]>(`/api/v1/shows/${showId}/episodes`);
}

// ── Movies ─────────────────────────────────────────────────────────────────

export function fetchMovies(params?: ListParams): Promise<Movie[]> {
  const p: Record<string, string> = {};
  if (params?.sort) p.sort = params.sort;
  if (params?.order) p.order = params.order;
  if (params?.watched !== undefined) p.watched = String(params.watched);
  if (params?.favorited !== undefined) p.favorited = String(params.favorited);
  return request<Movie[]>('/api/v1/movies', p);
}

export function fetchMovie(id: string): Promise<Movie> {
  return request<Movie>(`/api/v1/movies/${id}`);
}

// ── All Recordings ─────────────────────────────────────────────────────────

export function fetchRecordings(): Promise<Recording[]> {
  return request<Recording[]>('/api/v1/all', {
    sort: 'date_added',
    order: 'desc',
    source: 'recordings',
  });
}
