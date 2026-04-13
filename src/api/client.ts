// ── Base API Client ────────────────────────────────────────────────────────
// Server URL is read from localStorage so Settings page can update it.

const DEFAULT_SERVER = 'http://192.168.3.150:8089';

/**
 * Normalize a server URL: add http:// scheme if missing, fix single-slash
 * (http:/host → http://host), remove trailing slash.
 */
export function normalizeServerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) return url;
  // Fix single-slash: http:/host → http://host
  url = url.replace(/^(https?:\/(?!\/))/, '$1/');
  // Add scheme if missing entirely
  if (!/^https?:\/\//.test(url)) url = 'http://' + url;
  // Remove trailing slash
  return url.replace(/\/$/, '');
}

export function getServerUrl(): string {
  const stored = localStorage.getItem('dvr_server_url');
  return stored ? normalizeServerUrl(stored) : DEFAULT_SERVER;
}

export function setServerUrl(url: string): void {
  localStorage.setItem('dvr_server_url', normalizeServerUrl(url));
}

// Use Tauri's HTTP plugin fetch so requests go through Rust (bypasses CORS).
// Falls back to window.fetch when running outside Tauri (e.g. browser dev).
async function httpFetch(url: string): Promise<Response> {
  if (window.__TAURI_INTERNALS__) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url);
  }
  return fetch(url);
}

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const base = getServerUrl();
  const url = new URL(path, base);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  let res: Response;
  try {
    res = await httpFetch(url.toString());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Network error reaching ${url.host}: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${url.pathname}`);
  }
  const data = await res.json() as T;
  console.debug(`[API] ${url.pathname}`, data);
  return data;
}

export default request;

// ── Streaming URL helpers ─────────────────────────────────────────────────
// In dev mode use a relative URL so Vite's proxy forwards it to the DVR
// server (same-origin → no CORS, hls.js default XHR loader works).
// In production use the full server URL with the TauriLoader.

export function streamUrl(fileId: string): string {
  if (import.meta.env.DEV) {
    return `/dvr/files/${fileId}/hls/master.m3u8`;
  }
  return `${getServerUrl()}/dvr/files/${fileId}/hls/master.m3u8`;
}

export function previewUrl(fileId: string): string {
  // Thumbnail images are always absolute (displayed via <img>, not fetch)
  return `${getServerUrl()}/dvr/files/${fileId}/preview.jpg`;
}
