import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchChannels, fetchRecordings } from '../api/recordings';
import type { Channel, Recording } from '../api/types';
import { useStore } from '../store/useStore';
import type { AppState } from '../store/useStore';
import { applyLogoFallback, buildChannelLogoMap, logoForChannelKey } from '../lib/channelLogos';
import RecordingDetail from '../components/RecordingDetail';
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

function recLabel(rec: Recording) {
  return rec.episode_title ? `${rec.title} — "${rec.episode_title}"` : rec.title;
}

function logoForRecording(rec: Recording, logoMap: Record<string, string>): string | null {
  return logoForChannelKey(rec.channel, logoMap);
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
  const serverChangeVersion = useStore((s: AppState) => s.serverChangeVersion);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(null);
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
  }, [serverChangeVersion]);

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
                    const progress = rec.duration > 0
                      ? Math.min(((rec.playback_time ?? 0) / rec.duration) * 100, 100)
                      : 0;
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
                            onError={(e) => applyLogoFallback(e.currentTarget)}
                          />
                        )}
                        <span className="rec-item__main">
                          <span className="rec-item__title">{recLabel(rec)}</span>
                          {progress > 0 && !rec.watched && (
                            <span className="rec-item__progress" aria-hidden="true">
                              <span className="rec-item__progress-fill" style={{ width: `${progress}%` }} />
                            </span>
                          )}
                        </span>
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
          <RecordingDetail
            item={selected}
            onPlay={() => playItem(
              selected.id,
              recLabel(selected),
              selected.path,
              selected.commercials,
              '',
              selected.playback_time,
              selected.show_id ? 'episode' : 'movie'
            )}
            onNavigateToShow={selected.show_id
              ? () => navigate(`/tv?showId=${selected.show_id}`)
              : undefined
            }
          />
        ) : (
          <div className="page__empty">
            <p>Select a recording to see details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
