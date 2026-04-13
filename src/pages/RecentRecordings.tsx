import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getServerUrl } from '../api/client';
import { fetchChannels, fetchRecordings } from '../api/recordings';
import type { Channel, Recording } from '../api/types';
import { useStore } from '../store/useStore';
import type { AppState } from '../store/useStore';
import './Page.css';

// ── Helpers ────────────────────────────────────────────────────────────────

function groupByDayTime(recordings: Recording[]) {
  const groups: {
    dateKey: string;
    label: string;
    timeGroups: { timeKey: string; timeLabel: string; items: Recording[] }[];
  }[] = [];
  let lastKey = '';
  let lastTimeKey = '';
  for (const rec of recordings) {
    const d = new Date(rec.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const timeLabel = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const timeKey = `${key}-${timeLabel}`;
    if (key !== lastKey) {
      const label = d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });
      groups.push({ dateKey: key, label, timeGroups: [] });
      lastKey = key;
      lastTimeKey = '';
    }
    if (timeKey !== lastTimeKey) {
      groups[groups.length - 1].timeGroups.push({ timeKey, timeLabel, items: [] });
      lastTimeKey = timeKey;
    }
    groups[groups.length - 1].timeGroups[groups[groups.length - 1].timeGroups.length - 1].items.push(rec);
  }
  return groups;
}

function formatDateTime(ms: number) {
  const d = new Date(ms);
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function recLabel(rec: Recording) {
  return rec.episode_title ? `${rec.title} — "${rec.episode_title}"` : rec.title;
}

function buildChannelLogoMap(channels: Channel[]): Record<string, string> {
  const server = getServerUrl();
  const map: Record<string, string> = {};
  for (const ch of channels) {
    const logo = ch.logo_url?.trim() || (ch.station_id
      ? `${server}/tmsimg/assets/s${ch.station_id}_ll_h15_ab.png?w=360&h=270`
      : undefined);
    if (!logo) continue;
    const keys = [ch.id, ch.name, ch.number]
      .filter((k): k is string => Boolean(k && k.trim()))
      .map((k) => k.trim());
    for (const key of keys) {
      map[key] = logo;
      map[key.toLowerCase()] = logo;
    }
  }
  return map;
}

function logoForRecording(rec: Recording, logoMap: Record<string, string>): string | null {
  const key = (rec.channel ?? '').trim();
  if (!key) return null;
  return logoMap[key] ?? logoMap[key.toLowerCase()] ?? null;
}

function nextLogoVariant(url: string): string | null {
  const m = url.match(/_ll_h15_(ab|ac|aa)\.png\?w=360&h=270$/i);
  if (!m) return null;
  const current = m[1].toLowerCase();
  const next = current === 'ab' ? 'ac' : current === 'ac' ? 'aa' : null;
  return next ? url.replace(/_ll_h15_(ab|ac|aa)\.png\?w=360&h=270$/i, `_ll_h15_${next}.png?w=360&h=270`) : null;
}

function handleLogoError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const next = nextLogoVariant(img.src);
  if (next && next !== img.src) {
    img.src = next;
    return;
  }
  img.style.display = 'none';
}

// ── Component ──────────────────────────────────────────────────────────────

export default function RecentRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [channelLogos, setChannelLogos] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const navigate = useNavigate();
  const playItem = useStore((s: AppState) => s.playItem);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loadedRecordings, loadedChannels] = await Promise.all([
          fetchRecordings(),
          fetchChannels().catch(() => [] as Channel[]),
        ]);
        if (cancelled) return;
        setRecordings(loadedRecordings);
        setChannelLogos(buildChannelLogoMap(loadedChannels));
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const groups = useMemo(() => groupByDayTime(recordings), [recordings]);

  return (
    <div className={`page page--split ${isResizing ? 'resizing' : ''}`}>
      {/* LEFT: recordings list */}
      <aside className="rec-list" style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}>
        <h2 className="show-list__title">Recent Recordings</h2>
        {loading && <p className="page__status">Loading…</p>}
        {error && <p className="page__error">⚠ {error}</p>}
        <div className="rec-list__items">
          {groups.map((group) => (
            <div key={group.dateKey}>
              <div className="rec-day-header">{group.label}</div>
              {group.timeGroups.map((timeGroup) => (
                <div key={timeGroup.timeKey}>
                  <div className="rec-time-group-header">{timeGroup.timeLabel}</div>
                  {timeGroup.items.map((rec) => {
                    const logoUrl = logoForRecording(rec, channelLogos);
                    return (
                      <button
                        key={rec.id}
                        className={`rec-item ${selected?.id === rec.id ? 'rec-item--active' : ''}`}
                        onClick={() => setSelected(rec)}
                      >
                        {logoUrl && (
                          <img
                            src={logoUrl}
                            alt={rec.channel}
                            className="rec-item__logo"
                            onError={handleLogoError}
                          />
                        )}
                        <span className="rec-item__title">{recLabel(rec)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* RESIZE HANDLE */}
      <div
        className={`resize-handle ${isResizing ? 'resize-handle--active' : ''}`}
        onMouseDown={handleMouseDown}
      />

      {/* RIGHT: detail pane */}
      <div className="page__content">
        {selected ? (
          <div className="rec-detail">
            <button
              className="rec-detail__thumb"
              onClick={() => playItem(selected.id, recLabel(selected), selected.path, selected.commercials)}
              title="Play recording"
            >
              <img src={selected.thumbnail_url} alt={recLabel(selected)} />
              <div className="rec-detail__play-icon">▶</div>
            </button>

            <div className="rec-detail__body">
              <h2 className="rec-detail__title">{selected.title}</h2>

              {selected.episode_title && (
                <p className="rec-detail__episode">
                  {selected.season_number != null && selected.episode_number != null
                    ? `S${selected.season_number}E${selected.episode_number} — `
                    : ''}
                  {selected.episode_title}
                </p>
              )}

              <p className="rec-detail__meta">
                <span>{formatDateTime(selected.created_at)}</span>
                {selected.content_rating && (
                  <span className="rec-detail__badge">{selected.content_rating}</span>
                )}
                <span className="rec-detail__duration">{formatDuration(selected.duration)}</span>
              </p>

              {(selected.full_summary ?? selected.summary) && (
                <p className="rec-detail__description">
                  {selected.full_summary ?? selected.summary}
                </p>
              )}

              {selected.genres && selected.genres.length > 0 && (
                <p className="rec-detail__genres">{selected.genres.join(' · ')}</p>
              )}

              {selected.show_id && (
                <button
                  className="rec-detail__show-link"
                  onClick={() => navigate(`/tv?showId=${selected.show_id}`)}
                >
                  View all episodes of {selected.title} →
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="page__empty">
            <p>Select a recording to see details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
