import { useEffect, useMemo, useState } from 'react';
import { fetchChannels } from '../api/recordings';
import request, { getServerUrl } from '../api/client';
import type { Channel } from '../api/types';
import { useStore } from '../store/useStore';
import { applyLogoFallback, channelLogoUrl } from '../lib/channelLogos';
import './Page.css';

type SortMode = 'alpha' | 'number';
type DiagnosticsSortMode = 'number' | 'name';
type FilterMode = 'all' | 'favorites' | `source:${string}`;
type ChannelRow = {
  id: string;
  channel: Channel;
  sourceName: string;
  sourceId: string;
  sourceFilterLabel: string;
};
type DiagnosticsGroup = {
  key: string;
  number: string;
  names: string[];
  sortName: string;
  minNumberValue: number;
  bySource: Map<string, ChannelRow[]>;
};

type GuideChannel = {
  ID?: string;
  ChannelID?: string;
  Number?: string;
  Favorite?: boolean;
};
const TEXT = new Intl.Collator(undefined, { sensitivity: 'base' });

function channelNumberValue(numberText: string | undefined): number {
  const parsed = Number.parseFloat(numberText ?? '');
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function channelCollectionName(channel: Channel): string {
  const maybe = channel as Channel & {
    collection?: string;
    collection_name?: string;
    group?: string;
    group_name?: string;
  };
  return (
    maybe.source_name ||
    maybe.collection_name ||
    maybe.collection ||
    maybe.group_name ||
    maybe.group ||
    ''
  ).trim();
}

function channelFilterLabel(filter: FilterMode): string {
  if (filter === 'all') return 'All Channels';
  if (filter === 'favorites') return 'Favorites';
  if (filter.startsWith('source:')) return filter.replace('source:', '');
  return filter.replace('collection:', '');
}

function favoriteKeyForChannel(channel: Channel): string[] {
  const keys = [channel.id, channel.number]
    .filter((v): v is string => Boolean(v && String(v).trim()))
    .map((v) => String(v).trim().toLowerCase());
  return Array.from(new Set(keys));
}

function parseGuideFavorites(data: unknown): Set<string> {
  const out = new Set<string>();
  if (!data || typeof data !== 'object') return out;

  for (const value of Object.values(data as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const channel = value as GuideChannel;
    if (!channel.Favorite) continue;
    const keys = [channel.ID, channel.ChannelID, channel.Number]
      .filter((v): v is string => Boolean(v && String(v).trim()))
      .map((v) => String(v).trim().toLowerCase());
    for (const key of keys) out.add(key);
  }

  return out;
}

function isFavoriteChannel(
  channel: Channel,
  guideFavorites: Set<string>
): boolean {
  if (channel.favorited === true) return true;
  if (channel.favorited === false) return false;
  const keys = favoriteKeyForChannel(channel);
  return keys.some((k) => guideFavorites.has(k));
}

function normalizedChannelName(name: string | undefined): string {
  return (name || '')
    .toLowerCase()
    .replace(/\(hd\)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeKey(row: ChannelRow): string {
  const number = (row.channel.number || '').trim();
  const name = (row.channel.name || '').trim().toLowerCase();
  const id = (row.channel.id || '').trim().toLowerCase();
  return `${number}|${name || id}`;
}

function rowPriority(row: ChannelRow): number {
  return (row.channel.favorited ? 4 : 0)
    + (row.channel.logo_url ? 2 : 0)
    + (row.channel.hd ? 1 : 0);
}

function dedupeRows(rows: ChannelRow[]): ChannelRow[] {
  const byKey = new Map<string, ChannelRow>();
  for (const row of rows) {
    const key = dedupeKey(row);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, row);
      continue;
    }
    const currentScore = rowPriority(current);
    const nextScore = rowPriority(row);
    if (nextScore > currentScore) {
      byKey.set(key, row);
      continue;
    }
    if (nextScore === currentScore) {
      const currentTie = `${current.sourceName}|${current.channel.source_id || ''}|${current.channel.id || ''}`;
      const nextTie = `${row.sourceName}|${row.channel.source_id || ''}|${row.channel.id || ''}`;
      if (TEXT.compare(nextTie, currentTie) < 0) byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

function toAbsoluteUrl(raw: string, serverUrl: string): string {
  try {
    return new URL(raw, serverUrl).toString();
  } catch {
    return raw;
  }
}

function candidateLiveManifestUrls(channel: Channel): string[] {
  const server = getServerUrl();
  const asAny = channel as Channel & {
    url?: string;
    stream_url?: string;
    m3u8_url?: string;
    manifest_url?: string;
    hls_url?: string;
    playback_url?: string;
  };

  const fromFields = [
    asAny.manifest_url,
    asAny.m3u8_url,
    asAny.hls_url,
    asAny.stream_url,
    asAny.playback_url,
    asAny.url,
  ]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .map((v) => toAbsoluteUrl(v, server));

  const id = encodeURIComponent(channel.id || '');
  const number = encodeURIComponent(channel.number || '');
  const sourceId = encodeURIComponent(channel.source_id || '');

  const guessed = [
    // Match Channels Web UI play URLs first.
    `${server}/devices/ANY/channels/${number}/hls`,
    sourceId ? `${server}/devices/${sourceId}/channels/${number}/hls` : '',
    // Also support id-based channel addressing where present.
    `${server}/devices/ANY/channels/${id}/hls`,
    sourceId ? `${server}/devices/${sourceId}/channels/${id}/hls` : '',
    // Some servers expect explicit master playlist path.
    `${server}/devices/ANY/channels/${number}/hls/master.m3u8`,
    sourceId ? `${server}/devices/${sourceId}/channels/${number}/hls/master.m3u8` : '',
    `${server}/devices/ANY/channels/${id}/hls/master.m3u8`,
    sourceId ? `${server}/devices/${sourceId}/channels/${id}/hls/master.m3u8` : '',
  ];

  const unique: string[] = [];
  for (const url of [...fromFields, ...guessed]) {
    if (url && !unique.includes(url)) unique.push(url);
  }
  return unique;
}

async function resolveLiveManifestUrl(channel: Channel): Promise<string> {
  const candidates = candidateLiveManifestUrls(channel);
  if (candidates.length === 0) return '';

  // In browser-only dev, prefer first candidate to avoid CORS probe failures.
  if (!window.__TAURI_INTERNALS__) return candidates[0];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*',
        },
      });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('mpegurl')) return url;
      const text = await res.text();
      if (text.includes('#EXTM3U')) return url;
    } catch {
      // Continue trying the next candidate URL.
    }
  }

  // Fallback: let player try the first candidate directly.
  return candidates[0];
}

export default function Live() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [guideFavorites, setGuideFavorites] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('number');
  const [diagnosticsSortMode, setDiagnosticsSortMode] = useState<DiagnosticsSortMode>('number');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [playPendingRowId, setPlayPendingRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const serverChangeVersion = useStore((s) => s.serverChangeVersion);
  const playItem = useStore((s) => s.playItem);
  const diagnosticsEnabled = useStore((s) => s.diagnosticsEnabled);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedChannelId(null);
    Promise.all([
      fetchChannels(),
      request<Record<string, unknown>>('/dvr/guide/channels').catch(() => ({})),
    ])
      .then(([loadedChannels, loadedGuide]) => {
        if (cancelled) return;
        setChannels(loadedChannels);
        setGuideFavorites(parseGuideFavorites(loadedGuide));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [serverChangeVersion]);

  const rows = useMemo<ChannelRow[]>(() => {
    const seen = new Map<string, number>();
    return channels.map((channel) => {
      const sourceName = channelCollectionName(channel);
      const sourceId = (channel.source_id || 'unknown-source-id').trim();
      const sourceFilterLabel = `${sourceName || 'Unknown Source'} (${sourceId})`;
      const base = [
        channel.id ?? '',
        sourceId,
        channel.station_id ?? '',
        channel.number ?? '',
        channel.name ?? '',
        sourceName,
      ].join('|');
      const next = (seen.get(base) ?? 0) + 1;
      seen.set(base, next);
      return {
        id: `${base}|${next}`,
        channel,
        sourceName,
        sourceId,
        sourceFilterLabel,
      };
    });
  }, [channels]);

  const sourceFilters = useMemo(() => {
    const labels = rows
      .map((row) => row.sourceFilterLabel)
      .filter(Boolean);
    return Array.from(new Set(labels)).sort((a, b) => TEXT.compare(a, b));
  }, [rows]);

  const channelsBySource = useMemo(() => {
    const map = new Map<string, ChannelRow[]>();
    for (const row of rows) {
      const key = row.sourceFilterLabel || 'Unknown Source';
      const list = map.get(key);
      if (list) {
        list.push(row);
      } else {
        map.set(key, [row]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const byNumber = channelNumberValue(a.channel.number) - channelNumberValue(b.channel.number);
        if (byNumber !== 0) return byNumber;
        return TEXT.compare(a.channel.name, b.channel.name);
      });
    }
    return Array.from(map.entries()).sort((a, b) => TEXT.compare(a[0], b[0]));
  }, [rows]);

  const diagnosticsSources = useMemo(() => channelsBySource.map(([source]) => source), [channelsBySource]);

  const diagnosticsGroups = useMemo<DiagnosticsGroup[]>(() => {
    const groups = new Map<string, DiagnosticsGroup>();

    for (const row of rows) {
      const key = normalizedChannelName(row.channel.name) || `id:${row.channel.id || row.id}`;
      const rowNumber = (row.channel.number || '').trim() || '-';
      const rowNumberValue = channelNumberValue(row.channel.number);
      const existing = groups.get(key);
      if (!existing) {
        const names = row.channel.name ? [row.channel.name] : [];
        const bySource = new Map<string, ChannelRow[]>();
        bySource.set(row.sourceFilterLabel, [row]);
        groups.set(key, {
          key,
          number: rowNumber,
          names,
          sortName: (row.channel.name || '').trim(),
          minNumberValue: rowNumberValue,
          bySource,
        });
        continue;
      }

      if (row.channel.name && !existing.names.includes(row.channel.name)) {
        existing.names.push(row.channel.name);
        existing.names.sort((a, b) => TEXT.compare(a, b));
        existing.sortName = existing.names[0] || existing.sortName;
      }

      if (rowNumberValue < existing.minNumberValue) {
        existing.minNumberValue = rowNumberValue;
        existing.number = rowNumber;
      }

      const sourceItems = existing.bySource.get(row.sourceFilterLabel);
      if (sourceItems) {
        sourceItems.push(row);
      } else {
        existing.bySource.set(row.sourceFilterLabel, [row]);
      }
    }

    const out = Array.from(groups.values());
    for (const group of out) {
      for (const items of group.bySource.values()) {
        items.sort((a, b) => {
          const byName = TEXT.compare(a.channel.name || '', b.channel.name || '');
          if (byName !== 0) return byName;
          return TEXT.compare(a.channel.id || '', b.channel.id || '');
        });
      }
    }

    out.sort((a, b) => {
      if (diagnosticsSortMode === 'name') {
        const byName = TEXT.compare(a.sortName || '', b.sortName || '');
        if (byName !== 0) return byName;
      }
      const byNumber = a.minNumberValue - b.minNumberValue;
      if (byNumber !== 0) return byNumber;
      return TEXT.compare(a.sortName || '', b.sortName || '');
    });

    return out;
  }, [rows, diagnosticsSortMode]);

  const availableFilters = useMemo(() => {
    const base: FilterMode[] = ['all', 'favorites'];
    for (const sourceFilter of sourceFilters) {
      base.push(`source:${sourceFilter}`);
    }
    return base;
  }, [sourceFilters]);

  useEffect(() => {
    if (!availableFilters.includes(filterMode)) {
      setFilterMode('all');
    }
  }, [availableFilters, filterMode]);

  const visibleRows = useMemo(() => {
    let list = rows;

    if (filterMode === 'favorites') {
      list = list.filter((row) => {
        return isFavoriteChannel(row.channel, guideFavorites);
      });
    } else if (filterMode.startsWith('source:')) {
      const wanted = filterMode.replace('source:', '');
      list = list.filter((row) => row.sourceFilterLabel === wanted);
    }

    if (filterMode === 'all') {
      list = dedupeRows(list);
    }

    const sorted = [...list];
    if (sortMode === 'alpha') {
      sorted.sort((a, b) => TEXT.compare(a.channel.name, b.channel.name));
    } else {
      sorted.sort((a, b) => {
        const byNumber = channelNumberValue(a.channel.number) - channelNumberValue(b.channel.number);
        if (byNumber !== 0) return byNumber;
        return TEXT.compare(a.channel.name, b.channel.name);
      });
    }
    return sorted;
  }, [rows, filterMode, sortMode, guideFavorites]);

  useEffect(() => {
    if (selectedChannelId && !visibleRows.some((row) => row.id === selectedChannelId)) {
      setSelectedChannelId(visibleRows[0]?.id ?? null);
    }
    if (!selectedChannelId && visibleRows.length > 0) {
      setSelectedChannelId(visibleRows[0].id);
    }
  }, [visibleRows, selectedChannelId]);

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Live TV</h1>
        <div className="page__filters page__filters--wrap">
          {availableFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-btn ${filterMode === filter ? 'filter-btn--active' : ''}`}
              onClick={() => setFilterMode(filter)}
            >
              {channelFilterLabel(filter)}
            </button>
          ))}
          <select
            className="page-sort-select"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            aria-label="Sort live channel list"
          >
            <option value="number">Channel Number</option>
            <option value="alpha">Alphabetical</option>
          </select>
          {diagnosticsEnabled && (
            <button
              type="button"
              className="page-sort-select"
              onClick={() => setDiagnosticsOpen(true)}
              aria-label="Open live diagnostics"
            >
              Source Diagnostics
            </button>
          )}
        </div>
      </header>
      <p className="page__status live-count">
        {visibleRows.length} channel{visibleRows.length === 1 ? '' : 's'} • {channelFilterLabel(filterMode)}
      </p>

      {loading && <p className="page__status">Loading channels…</p>}
      {error && <p className="page__error">⚠ {error}</p>}

      {!loading && !error && (
        <ul className="show-list__items live-list">
          {visibleRows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={`show-item ${selectedChannelId === row.id ? 'show-item--active' : ''}`}
                title={row.channel.name}
                onClick={async () => {
                  setSelectedChannelId(row.id);
                  setPlayPendingRowId(row.id);
                  const manifestUrl = await resolveLiveManifestUrl(row.channel);
                  const source = row.sourceName || 'Unknown Source';
                  const label = `${row.channel.number} ${row.channel.name} · ${source}`;
                  playItem(row.channel.id || row.id, label, '', [], manifestUrl);
                  setPlayPendingRowId(null);
                }}
                aria-pressed={selectedChannelId === row.id}
              >
                {channelLogoUrl(row.channel) ? (
                  <img
                    className="show-item__thumb"
                    src={channelLogoUrl(row.channel)}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => applyLogoFallback(e.currentTarget)}
                  />
                ) : (
                  <span className="show-item__icon" aria-hidden="true">📺</span>
                )}
                <span className="live-item__text">
                  <span className="show-item__name">
                    {row.channel.number} {row.channel.name}
                    {playPendingRowId === row.id ? ' • opening…' : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {visibleRows.length === 0 && (
            <li>
              <p className="page__status">No channels for the selected filter.</p>
            </li>
          )}
        </ul>
      )}

      {diagnosticsEnabled && diagnosticsOpen && (
        <div className="media-modal-backdrop" onClick={() => setDiagnosticsOpen(false)}>
          <div className="media-modal live-diag-modal" onClick={(e) => e.stopPropagation()}>
            <div className="media-modal__header">
              <h3>Live Source Diagnostics</h3>
              <div className="live-diag-header-controls">
                <select
                  className="page-sort-select"
                  value={diagnosticsSortMode}
                  onChange={(e) => setDiagnosticsSortMode(e.target.value as DiagnosticsSortMode)}
                  aria-label="Sort diagnostics table"
                >
                  <option value="number">Sort by Channel Number</option>
                  <option value="name">Sort by Channel Name</option>
                </select>
                <button className="media-modal__close" onClick={() => setDiagnosticsOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <p className="live-diag-summary">
              {rows.length} channels across {channelsBySource.length} source instance{channelsBySource.length === 1 ? '' : 's'} and {diagnosticsGroups.length} distinct channel number{diagnosticsGroups.length === 1 ? '' : 's'}.
            </p>
            <div className="live-diag-matrix-wrap">
              <table className="live-diag-matrix">
                <thead>
                  <tr>
                    <th className="live-diag-matrix__rowhead">Channel</th>
                    {channelsBySource.map(([source, sourceRows]) => (
                      <th key={source}>
                        <div className="live-diag-matrix__head-title">{source}</div>
                        <div className="live-diag-matrix__head-count">{sourceRows.length} channels</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diagnosticsGroups.map((group) => (
                    <tr key={group.key}>
                      <td className="live-diag-rowhead">
                        <div className="live-diag-rowhead__number">{group.number}</div>
                        <div className="live-diag-rowhead__names">{group.names.join(' / ') || '-'}</div>
                      </td>
                      {diagnosticsSources.map((source) => {
                        const items = group.bySource.get(source) ?? [];
                        return (
                          <td key={`${source}-${group.key}`}>
                            {items.length > 0 ? (
                              <div className="live-diag-cell-stack">
                                {items.map((item) => (
                                  <div key={item.id} className="live-diag-cell">
                                    <div className="live-diag-cell__line">
                                      {channelLogoUrl(item.channel) ? (
                                        <img
                                          className="live-diag-cell__logo"
                                          src={channelLogoUrl(item.channel)}
                                          alt=""
                                          aria-hidden="true"
                                          onError={(e) => applyLogoFallback(e.currentTarget)}
                                        />
                                      ) : (
                                        <span className="live-diag-cell__icon" aria-hidden="true">📺</span>
                                      )}
                                      <span className="live-diag-cell__name">{item.channel.name || '-'}</span>
                                      {isFavoriteChannel(item.channel, guideFavorites) && (
                                        <span className="live-diag-cell__favorite">favorite</span>
                                      )}
                                    </div>
                                    <div className="live-diag-cell__meta">{item.channel.id || '-'}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="live-diag-cell__empty">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}