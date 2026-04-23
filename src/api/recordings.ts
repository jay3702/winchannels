import request, { requestWithMethod } from './client';
import type { Episode, Movie, Recording, Show, ListParams, Channel, DvrFile } from './types';

// ── Shows ──────────────────────────────────────────────────────────────────

export function fetchShows(): Promise<Show[]> {
  return request<Show[]>('/api/v1/shows');
}

export function fetchShow(id: string): Promise<Show> {
  return request<Show>(`/api/v1/shows/${encodeURIComponent(id)}`);
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
  return request<Episode>(`/api/v1/episodes/${encodeURIComponent(id)}`);
}

export function fetchEpisodesForShow(showId: string): Promise<Episode[]> {
  return request<Episode[]>(`/api/v1/shows/${encodeURIComponent(showId)}/episodes`, {
    sort: 'date_added',
    order: 'desc',
  });
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
  return request<Movie>(`/api/v1/movies/${encodeURIComponent(id)}`);
}

// ── All Recordings ─────────────────────────────────────────────────────────

export function fetchRecordings(): Promise<Recording[]> {
  return request<Recording[]>('/api/v1/all', {
    sort: 'date_added',
    order: 'desc',
    source: 'recordings',
  });
}

interface MutationCandidate {
  path: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  bodyEncoding?: 'json' | 'form';
}

let lastRecordingMutationDebug: string | null = null;
let lastRecordingMutationFailure: string | null = null;

export function getLastRecordingMutationDebug(): string | null {
  return lastRecordingMutationDebug;
}

export function getLastRecordingMutationFailure(): string | null {
  return lastRecordingMutationFailure;
}

async function runMutationCandidates(candidates: MutationCandidate[]): Promise<void> {
  const errors: string[] = [];

  for (const candidate of candidates) {
    const mode = candidate.body
      ? `${candidate.bodyEncoding === 'form' ? 'form-body' : 'json-body'}`
      : (candidate.params ? 'query-params' : 'no-body');
    const label = `${candidate.method} ${candidate.path} (${mode})`;
    try {
      await requestWithMethod(candidate.path, candidate.method, candidate.body, candidate.params, candidate.bodyEncoding ?? 'json');
      lastRecordingMutationDebug = label;
      lastRecordingMutationFailure = null;
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${label}: ${msg}`);
    }
  }

  lastRecordingMutationFailure = errors[0] ?? 'No compatible mutation endpoint found.';
  throw new Error(`No compatible mutation endpoint found. Tried:\n${errors.join('\n')}`);
}

function buildWatchedCandidates(id: string, watched: boolean): MutationCandidate[] {
  const dvrFilePath = `/dvr/files/${encodeURIComponent(id)}`;
  // HAR-confirmed in Channels web client for both watched and unwatched actions.
  return [{ path: `${dvrFilePath}/${watched ? 'watch' : 'unwatch'}`, method: 'PUT' }];
}

function buildPlaybackCandidates(id: string, playbackTime: number): MutationCandidate[] {
  const seconds = Math.max(0, Math.floor(playbackTime));
  // HAR-confirmed in Channels web client.
  return [{ path: `/dvr/files/${encodeURIComponent(id)}/playback_time/${seconds}`, method: 'PUT' }];
}

export function setEpisodeWatched(id: string, watched: boolean): Promise<void> {
  return runMutationCandidates(buildWatchedCandidates(id, watched));
}

export function setMovieWatched(id: string, watched: boolean): Promise<void> {
  return runMutationCandidates(buildWatchedCandidates(id, watched));
}

export function setEpisodePlaybackTime(id: string, playbackTime: number): Promise<void> {
  return runMutationCandidates(buildPlaybackCandidates(id, playbackTime));
}

export function setMoviePlaybackTime(id: string, playbackTime: number): Promise<void> {
  return runMutationCandidates(buildPlaybackCandidates(id, playbackTime));
}

// ── Destructive mutations ──────────────────────────────────────────────────

/** Fetch the raw DVR file record. Used to check RuleID (pass association). */
export function fetchDvrFile(id: string): Promise<DvrFile> {
  return request<DvrFile>(`/dvr/files/${encodeURIComponent(id)}`);
}

/** Permanently delete the recording file from the DVR. */
export function trashRecording(id: string): Promise<void> {
  return runMutationCandidates([{ path: `/dvr/files/${encodeURIComponent(id)}`, method: 'DELETE' }]);
}

/**
 * Mark a program as "not recorded" so the DVR will re-record it.
 * Uses the program_id field (EPxxxxxxxx) from the recording.
 */
export function markAsNotRecorded(programId: string): Promise<void> {
  const encoded = encodeURIComponent(programId);
  return runMutationCandidates([{ path: `/dvr/programs/${encoded}`, method: 'DELETE' }]);
}
