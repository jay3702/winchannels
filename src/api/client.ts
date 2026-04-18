// ── Base API Client ────────────────────────────────────────────────────────
// Server URL is read from localStorage so Settings page can update it.

const DEFAULT_SERVER = 'http://localhost:8089';

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
async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  if (window.__TAURI_INTERNALS__) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url, init);
  }
  return fetch(url, init);
}

export async function requestFromServer<T>(
  serverUrl: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  return requestFromServerWithInit<T>(serverUrl, path, { params, method: 'GET' });
}

interface RequestWithInitOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, string>;
  body?: unknown;
  bodyEncoding?: 'json' | 'form';
}

async function requestFromServerWithInit<T>(
  serverUrl: string,
  path: string,
  options: RequestWithInitOptions
): Promise<T> {
  const base = normalizeServerUrl(serverUrl);
  const url = new URL(path, base);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const init: RequestInit = { method: options.method };
  if (options.body !== undefined) {
    if (options.bodyEncoding === 'form') {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(options.body as Record<string, unknown>)) {
        form.set(key, String(value));
      }
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
      init.body = form.toString();
    } else {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(options.body);
    }
  }

  let res: Response;
  try {
    res = await httpFetch(url.toString(), init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Network error reaching ${url.host}: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${options.method} ${url.pathname}`);
  }

  let data: T;
  if (res.status === 204) {
    data = undefined as T;
  } else {
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('application/json')) {
      data = await res.json() as T;
    } else {
      data = await res.text() as T;
    }
  }

  console.debug(`[API] ${url.pathname}`, data);
  return data;
}

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  return requestFromServer<T>(getServerUrl(), path, params);
}

export async function requestWithMethod<T = unknown>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  params?: Record<string, string>,
  bodyEncoding: 'json' | 'form' = 'json'
): Promise<T> {
  return requestFromServerWithInit<T>(getServerUrl(), path, { method, body, params, bodyEncoding });
}

export default request;

// ── Streaming URL helpers ─────────────────────────────────────────────────
// In dev mode use a relative URL so Vite's proxy forwards it to the DVR
// server (same-origin → no CORS, hls.js default XHR loader works).
// In production use the full server URL with the TauriLoader.

export function streamUrl(fileId: string): string {
  // In browser-only dev, keep using Vite proxy for convenience.
  // In Tauri dev/prod, always use absolute URL so active server selection is honored.
  if (import.meta.env.DEV && !window.__TAURI_INTERNALS__) {
    return `/dvr/files/${fileId}/hls/master.m3u8`;
  }
  return `${getServerUrl()}/dvr/files/${fileId}/hls/master.m3u8`;
}

export function previewUrl(fileId: string): string {
  // Thumbnail images are always absolute (displayed via <img>, not fetch)
  return `${getServerUrl()}/dvr/files/${fileId}/preview.jpg`;
}
