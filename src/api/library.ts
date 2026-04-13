import request from './client';
import type { Video, VideoGroup } from './types';

// ── Video Groups ────────────────────────────────────────────────────────────

export function fetchVideoGroups(): Promise<VideoGroup[]> {
  return request<VideoGroup[]>('/api/v1/video_groups');
}

export function fetchVideoGroup(id: string): Promise<VideoGroup> {
  return request<VideoGroup>(`/api/v1/video_groups/${id}`);
}

// ── Videos ─────────────────────────────────────────────────────────────────

export function fetchVideos(): Promise<Video[]> {
  return request<Video[]>('/api/v1/videos');
}

export function fetchVideo(id: string): Promise<Video> {
  return request<Video>(`/api/v1/videos/${id}`);
}

export function fetchVideosInGroup(groupId: string): Promise<Video[]> {
  return request<Video[]>(`/api/v1/video_groups/${groupId}/videos`);
}
