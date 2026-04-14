import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchShows, fetchEpisodesForShow } from '../api/recordings';
import type { Show, Episode } from '../api/types';
import MediaCard from '../components/MediaCard';
import { useStore } from '../store/useStore';
import './Page.css';

type SortMode = 'alpha' | 'date';

function showIconUrl(show: Show): string | undefined {
  const raw = (
    (show as Show & { PreferredImage?: string }).PreferredImage ||
    (show as Show & { Image?: string }).Image ||
    (show as Show & { preferred_image?: string }).preferred_image ||
    (show as Show & { image?: string }).image ||
    show.image_url
  );
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    url.searchParams.set('w', '80');
    url.searchParams.set('h', '60');
    return url.toString();
  } catch {
    return raw;
  }
}

function labelKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number' && String(value).length >= 12) {
    // Likely epoch ms timestamp.
    return new Date(value).toLocaleString('en-US');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function showAttributes(show: Show): Array<{ key: string; label: string; value: string }> {
  const hidden = new Set(['image_url', 'Image', 'PreferredImage', 'image', 'preferred_image']);
  const preferredOrder = ['id', 'name', 'summary', 'episode_count', 'number_unwatched', 'favorited', 'genres', 'created_at', 'updated_at'];

  const entries = Object.entries(show)
    .filter(([key, value]) => !hidden.has(key) && value != null && value !== '')
    .map(([key, value]) => ({ key, label: labelKey(key), value: formatValue(value) }));

  entries.sort((a, b) => {
    const ai = preferredOrder.indexOf(a.key);
    const bi = preferredOrder.indexOf(b.key);
    const av = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bv = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return av - bv || a.label.localeCompare(b.label);
  });

  return entries;
}

/** Build card title/subtitle with fallbacks for sparse DVR metadata. */
function epLabel(ep: Episode): { title: string; subtitle?: string } {
  const hasS = ep.season_number != null && Number.isFinite(Number(ep.season_number));
  const hasE = ep.episode_number != null && Number.isFinite(Number(ep.episode_number));
  const sub = ep.episode_title || ep.title || undefined;
  // When no season/episode info exists, use the recorded date — it's the only
  // field that uniquely identifies a specific airing (original_air_date is the
  // same for every re-run of the same old episode).
  const recordedLabel = ep.created_at
    ? new Date(ep.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown';
  if (hasS && hasE) return { title: `S${ep.season_number}E${ep.episode_number}`, subtitle: sub };
  if (hasS) return { title: `S${ep.season_number}`, subtitle: sub };
  if (hasE) return { title: `E${ep.episode_number}`, subtitle: sub };
  return { title: recordedLabel, subtitle: sub };
}

export default function TVShows() {
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [showSort, setShowSort] = useState<SortMode>('alpha');
  const [episodeSort, setEpisodeSort] = useState<SortMode>('date');
  const [loadingShows, setLoadingShows] = useState(true);
  const [loadingEps, setLoadingEps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epError, setEpError] = useState<string | null>(null);
  const [showMetaOpen, setShowMetaOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const serverChangeVersion = useStore((s) => s.serverChangeVersion);
  const playItem = useStore((s) => s.playItem);
  const requestedShowId = searchParams.get('showId');

  const sortedShows = useMemo(() => {
    const list = [...shows];
    if (showSort === 'alpha') {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    } else {
      list.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    }
    return list;
  }, [shows, showSort]);

  const sortedEpisodes = useMemo(() => {
    const list = [...episodes];
    if (episodeSort === 'alpha') {
      list.sort((a, b) => {
        const ak = (a.episode_title || a.title || '').trim();
        const bk = (b.episode_title || b.title || '').trim();
        return ak.localeCompare(bk, undefined, { sensitivity: 'base' });
      });
    } else {
      list.sort((a, b) => b.created_at - a.created_at);
    }
    return list;
  }, [episodes, episodeSort]);

  useEffect(() => {
    setLoadingShows(true);
    setError(null);
    setEpError(null);
    setSelectedShow(null);
    setEpisodes([]);
    setSelectedEpisode(null);
    setShowMetaOpen(false);
    fetchShows()
      .then((loaded) => {
        setShows(loaded);
        if (requestedShowId) {
          const match = loaded.find((s) => s.id === requestedShowId);
          if (match) selectShow(match);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingShows(false));
  }, [requestedShowId, serverChangeVersion]);

  function selectShow(show: Show) {
    setSelectedShow(show);
    setEpisodes([]);
    setSelectedEpisode(null);
    setShowMetaOpen(false);
    setEpError(null);
    setLoadingEps(true);
    fetchEpisodesForShow(String(show.id))
      .then((eps) => {
        setEpisodes(eps);
        setSelectedEpisode(eps[0] ?? null);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setEpError(msg);
      })
      .finally(() => setLoadingEps(false));
  }

  return (
    <div className="page page--split">
      {/* Show list */}
      <aside className="show-list">
        <h2 className="show-list__title">TV Shows</h2>
        <div className="show-list__sort">
          <select
            className="page-sort-select"
            value={showSort}
            onChange={(e) => setShowSort(e.target.value as SortMode)}
            aria-label="Sort TV Shows list"
          >
            <option value="alpha">Alphabetical</option>
            <option value="date">Date Added</option>
          </select>
        </div>
        {loadingShows && <p className="page__status">Loading…</p>}
        {error && <p className="page__error">⚠ {error}</p>}
        <ul className="show-list__items">
          {sortedShows.map((show) => (
            <li key={show.id}>
              <button
                className={`show-item ${selectedShow?.id === show.id ? 'show-item--active' : ''}`}
                onClick={() => selectShow(show)}
              >
                {showIconUrl(show) ? (
                  <img className="show-item__thumb" src={showIconUrl(show)} alt="" aria-hidden="true" />
                ) : (
                  <span className="show-item__icon" aria-hidden="true">📺</span>
                )}
                <span className="show-item__name">{show.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Episode grid */}
      <div className="page__content">
        {selectedShow ? (
          <>
            <header className="page__header">
              <h1 className="page__title">{selectedShow.name}</h1>
              <div className="page__filters">
                <select
                  className="page-sort-select"
                  value={episodeSort}
                  onChange={(e) => setEpisodeSort(e.target.value as SortMode)}
                  aria-label="Sort TV episodes grid"
                >
                  <option value="alpha">Alphabetical</option>
                  <option value="date">Date Added</option>
                </select>
              </div>
            </header>
            {loadingEps && <p className="page__status">Loading episodes…</p>}
            {epError && <p className="page__error">⚠ {epError}</p>}

            {selectedShow && (
              <section className="media-detail media-detail--full">
                {selectedShow.image_url && (
                  <button
                    className="media-detail__hero media-detail__hero-btn"
                    onClick={() => setShowMetaOpen(true)}
                    title="Show details"
                  >
                    <img src={selectedShow.image_url} alt={selectedShow.name} />
                  </button>
                )}
                {selectedShow.summary && (
                  <p className="media-detail__description">{selectedShow.summary}</p>
                )}
              </section>
            )}

            {selectedShow && showMetaOpen && (
              <div className="media-modal-backdrop" onClick={() => setShowMetaOpen(false)}>
                <div className="media-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="media-modal__header">
                    <h3>{selectedShow.name} Details</h3>
                    <button className="media-modal__close" onClick={() => setShowMetaOpen(false)} aria-label="Close details">
                      ✕
                    </button>
                  </div>
                  <dl className="media-attrs" aria-label="TV show details">
                    {showAttributes(selectedShow).map((attr) => (
                      <div key={attr.key} className="media-attrs__row">
                        <dt>{attr.label}</dt>
                        <dd>{attr.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}

            <div className="media-grid">
              {sortedEpisodes.map((ep) => {
                const { title, subtitle } = epLabel(ep);
                return (
                  <MediaCard
                    key={ep.id}
                    id={ep.id}
                    title={title}
                    subtitle={subtitle}
                    imageUrl={ep.image_url}
                    thumbnailUrl={ep.thumbnail_url}
                    duration={ep.duration}
                    watched={ep.watched}
                    playbackTime={ep.playback_time}
                    commercials={ep.commercials}
                    filePath={ep.path}
                    recordedAt={ep.created_at}
                    recordedAtFormat="datetime"
                    onClick={() => setSelectedEpisode(ep)}
                    onPlayAction={() => {
                      const { title, subtitle } = epLabel(ep);
                      const label = subtitle ? `${title} – ${subtitle}` : title;
                      playItem(ep.id, label, ep.path, ep.commercials);
                    }}
                    playActionLabel="Play episode"
                    selected={selectedEpisode?.id === ep.id}
                    ariaLabel={`Select ${subtitle ? `${title} – ${subtitle}` : title}`}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <div className="page__empty">
            <p>Select a show to see its episodes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
