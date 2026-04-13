import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchShows, fetchEpisodesForShow } from '../api/recordings';
import type { Show, Episode } from '../api/types';
import MediaCard from '../components/MediaCard';
import './Page.css';

type SortMode = 'alpha' | 'date';

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
  const [showSort, setShowSort] = useState<SortMode>('alpha');
  const [episodeSort, setEpisodeSort] = useState<SortMode>('date');
  const [loadingShows, setLoadingShows] = useState(true);
  const [loadingEps, setLoadingEps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epError, setEpError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

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
    fetchShows()
      .then((loaded) => {
        setShows(loaded);
        const showId = searchParams.get('showId');
        if (showId) {
          const match = loaded.find((s) => s.id === showId);
          if (match) selectShow(match);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingShows(false));
  }, []);

  function selectShow(show: Show) {
    setSelectedShow(show);
    setEpisodes([]);
    setEpError(null);
    setLoadingEps(true);
    fetchEpisodesForShow(String(show.id))
      .then((eps) => {
        setEpisodes(eps);
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
                {show.name}
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
