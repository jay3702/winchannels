const CLIENT_ERROR_LOG_KEY = 'client_error_log_v1';
const LOG_RETENTION_MS = 48 * 60 * 60 * 1000;
const MAX_LOG_ENTRIES = 500;

interface ClientErrorLogEntry {
  timestamp: number;
  source: string;
  message: string;
}

let loggingInstalled = false;

function stringifyValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack && value.stack.trim().length > 0
      ? value.stack
      : `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function serializeConsoleArgs(args: unknown[]): string {
  return args.map((arg) => stringifyValue(arg)).join(' ');
}

function parseEntries(raw: string | null): ClientErrorLogEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        timestamp: Number((entry as { timestamp?: unknown }).timestamp ?? 0),
        source: String((entry as { source?: unknown }).source ?? '').trim(),
        message: String((entry as { message?: unknown }).message ?? '').trim(),
      }))
      .filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp > 0 && entry.source && entry.message);
  } catch {
    return [];
  }
}

function pruneEntries(entries: ClientErrorLogEntry[], now = Date.now()): ClientErrorLogEntry[] {
  const earliest = now - LOG_RETENTION_MS;
  return entries.filter((entry) => entry.timestamp >= earliest).slice(-MAX_LOG_ENTRIES);
}

function readEntries(): ClientErrorLogEntry[] {
  if (typeof window === 'undefined') return [];
  return pruneEntries(parseEntries(window.localStorage.getItem(CLIENT_ERROR_LOG_KEY)));
}

function saveEntries(entries: ClientErrorLogEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLIENT_ERROR_LOG_KEY, JSON.stringify(pruneEntries(entries)));
  } catch {
    // Ignore storage failures so error reporting never cascades into more errors.
  }
}

export function appendClientErrorLog(source: string, error: unknown): void {
  if (typeof window === 'undefined') return;
  const message = stringifyValue(error).trim();
  if (!message) return;

  const nextEntry: ClientErrorLogEntry = {
    timestamp: Date.now(),
    source: source.trim() || 'client',
    message,
  };

  const entries = readEntries();
  saveEntries([...entries, nextEntry]);
}

export function getRecentClientErrorLogText(): string {
  const entries = readEntries();
  if (entries.length === 0) {
    return 'No client errors captured in the last 48 hours.';
  }

  return entries
    .map((entry) => {
      const stamp = new Date(entry.timestamp).toISOString();
      return `[${stamp}] ${entry.source}\n${entry.message}`;
    })
    .join('\n\n');
}

export function installClientErrorLogging(): void {
  if (loggingInstalled || typeof window === 'undefined') return;
  loggingInstalled = true;

  saveEntries(readEntries());

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    appendClientErrorLog('console.error', serializeConsoleArgs(args));
    originalConsoleError(...args);
  };

  window.addEventListener('error', (event) => {
    const location = event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : 'window.error';
    appendClientErrorLog(location, event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    appendClientErrorLog('unhandledrejection', event.reason);
  });
}