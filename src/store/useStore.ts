import { create } from 'zustand';
import { getServerUrl, normalizeServerUrl, setServerUrl } from '../api/client';

const SHARE_KEY = 'dvr_storage_share';
const SERVERS_KEY = 'dvr_servers';
const ACTIVE_SERVER_KEY = 'dvr_active_server_id';
const PLAYBACK_REMUX_KEY = 'playback_prefer_remux';
const DIAGNOSTICS_ENABLED_KEY = 'diagnostics_enabled';

export interface ServerOption {
  id: string;
  name: string;
  url: string;
}

function makeServerId(): string {
  return `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseServers(raw: string | null): ServerOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ServerOption[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const name = String((item as { name?: unknown }).name ?? '').trim();
      const url = normalizeServerUrl(String((item as { url?: unknown }).url ?? ''));
      const idRaw = String((item as { id?: unknown }).id ?? '').trim();
      if (!name || !url) continue;
      out.push({ id: idRaw || makeServerId(), name, url });
    }
    return out;
  } catch {
    return [];
  }
}

function bootstrapServers(): { servers: ServerOption[]; activeServerId: string } {
  const legacyUrl = getServerUrl();
  const parsed = parseServers(localStorage.getItem(SERVERS_KEY));
  const servers = parsed.length > 0
    ? parsed
    : [{ id: 'default', name: 'Default', url: legacyUrl }];

  const requestedActive = (localStorage.getItem(ACTIVE_SERVER_KEY) ?? '').trim();
  const activeServerId = servers.some((s) => s.id === requestedActive)
    ? requestedActive
    : servers[0].id;

  return { servers, activeServerId };
}

function persistServers(servers: ServerOption[], activeServerId: string): void {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
  localStorage.setItem(ACTIVE_SERVER_KEY, activeServerId);
  const active = servers.find((s) => s.id === activeServerId) ?? servers[0];
  if (active) setServerUrl(active.url);
}

const boot = bootstrapServers();
const bootActive = boot.servers.find((s) => s.id === boot.activeServerId) ?? boot.servers[0];
persistServers(boot.servers, bootActive.id);

export interface AppState {
  servers: ServerOption[];
  activeServerId: string;
  serverUrl: string;
  serverChangeVersion: number;

  setActiveServer: (id: string) => void;
  setServers: (servers: ServerOption[]) => void;
  setServerUrl: (url: string) => void;

  // UNC / local path to the root of the DVR storage share, e.g.
  // e.g. \\192.168.x.x\AllMedia\Channels  — used to find SRT sidecar files.
  storageSharePath: string;
  setStorageSharePath: (path: string) => void;

  preferRemux: boolean;
  setPreferRemux: (value: boolean) => void;

  diagnosticsEnabled: boolean;
  setDiagnosticsEnabled: (value: boolean) => void;

  // Currently playing item – fileId drives the VideoPlayer
  nowPlayingId: string | null;
  nowPlayingKey: number;            // increments on every playItem call so the effect re-fires even for the same id
  nowPlayingTitle: string;
  nowPlayingFilePath: string;       // relative path from DVR API, e.g. TV/Show/Episode.mpg
  nowPlayingCommercials: number[];   // flat [start, end, start, end, …] in seconds
  playItem: (fileId: string, title: string, filePath?: string, commercials?: number[]) => void;
  stopPlayback: () => void;
}

export const useStore = create<AppState>((set) => ({
  servers: boot.servers,
  activeServerId: bootActive.id,
  serverUrl: bootActive.url,
  serverChangeVersion: 0,

  setActiveServer: (id: string) => {
    set((state) => {
      const next = state.servers.find((s) => s.id === id);
      if (!next || next.id === state.activeServerId) return state;
      persistServers(state.servers, next.id);
      return {
        activeServerId: next.id,
        serverUrl: next.url,
        serverChangeVersion: state.serverChangeVersion + 1,
        nowPlayingId: null,
        nowPlayingTitle: '',
        nowPlayingFilePath: '',
        nowPlayingCommercials: [],
      };
    });
  },

  setServers: (servers: ServerOption[]) => {
    const cleaned = servers
      .map((s) => ({
        id: s.id?.trim() || makeServerId(),
        name: s.name.trim(),
        url: normalizeServerUrl(s.url),
      }))
      .filter((s) => s.name && s.url);

    if (cleaned.length === 0) return;

    set((state) => {
      const activeServerId = cleaned.some((s) => s.id === state.activeServerId)
        ? state.activeServerId
        : cleaned[0].id;
      const active = cleaned.find((s) => s.id === activeServerId) ?? cleaned[0];
      persistServers(cleaned, active.id);
      return {
        servers: cleaned,
        activeServerId: active.id,
        serverUrl: active.url,
        serverChangeVersion: state.serverChangeVersion + 1,
        nowPlayingId: null,
        nowPlayingTitle: '',
        nowPlayingFilePath: '',
        nowPlayingCommercials: [],
      };
    });
  },

  setServerUrl: (url: string) => {
    const normalized = normalizeServerUrl(url);
    if (!normalized) return;
    set((state) => {
      const updatedServers = state.servers.map((s) =>
        s.id === state.activeServerId ? { ...s, url: normalized } : s
      );
      persistServers(updatedServers, state.activeServerId);
      return {
        servers: updatedServers,
        serverUrl: normalized,
        serverChangeVersion: state.serverChangeVersion + 1,
        nowPlayingId: null,
        nowPlayingTitle: '',
        nowPlayingFilePath: '',
        nowPlayingCommercials: [],
      };
    });
  },

  storageSharePath: localStorage.getItem(SHARE_KEY) ?? '',
  setStorageSharePath: (path: string) => {
    const trimmed = path.trim().replace(/[/\\]+$/, '');
    localStorage.setItem(SHARE_KEY, trimmed);
    set({ storageSharePath: trimmed });
  },

  preferRemux: localStorage.getItem(PLAYBACK_REMUX_KEY) !== 'false',
  setPreferRemux: (value: boolean) => {
    localStorage.setItem(PLAYBACK_REMUX_KEY, String(value));
    set({ preferRemux: value });
  },

  diagnosticsEnabled: localStorage.getItem(DIAGNOSTICS_ENABLED_KEY) === 'true',
  setDiagnosticsEnabled: (value: boolean) => {
    localStorage.setItem(DIAGNOSTICS_ENABLED_KEY, String(value));
    set({ diagnosticsEnabled: value });
  },

  nowPlayingId: null,
  nowPlayingKey: 0,
  nowPlayingTitle: '',
  nowPlayingFilePath: '',
  nowPlayingCommercials: [],
  playItem: (fileId, title, filePath = '', commercials = []) =>
    set(s => ({
      nowPlayingId: fileId,
      nowPlayingKey: s.nowPlayingKey + 1,
      nowPlayingTitle: title,
      nowPlayingFilePath: filePath,
      nowPlayingCommercials: commercials,
    })),
  stopPlayback: () => set({ nowPlayingId: null, nowPlayingTitle: '', nowPlayingFilePath: '', nowPlayingCommercials: [] }),
}));
