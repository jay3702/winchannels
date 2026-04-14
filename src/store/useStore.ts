import { create } from 'zustand';
import { getServerUrl, setServerUrl } from '../api/client';

const SHARE_KEY = 'dvr_storage_share';

export interface AppState {
  serverUrl: string;
  setServerUrl: (url: string) => void;

  // UNC / local path to the root of the DVR storage share, e.g.
  // e.g. \\192.168.x.x\AllMedia\Channels  — used to find SRT sidecar files.
  storageSharePath: string;
  setStorageSharePath: (path: string) => void;

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
  serverUrl: getServerUrl(),
  setServerUrl: (url: string) => {
    setServerUrl(url);
    set({ serverUrl: url });
  },

  storageSharePath: localStorage.getItem(SHARE_KEY) ?? '',
  setStorageSharePath: (path: string) => {
    const trimmed = path.trim().replace(/[/\\]+$/, '');
    localStorage.setItem(SHARE_KEY, trimmed);
    set({ storageSharePath: trimmed });
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
