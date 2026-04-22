import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchShows, fetchEpisodesForShow, setEpisodeWatched, trashRecording, markAsNotRecorded, fetchDvrFile } from '../api/recordings';
import type { Show, Episode } from '../api/types';
import MediaCard from '../components/MediaCard';
import RecordingDetail from '../components/RecordingDetail';
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

/** Build MediaCard badges for an episode (mirrors the flags shown in RecordingDetail). */
function epBadges(ep: Episode): { label: string; type: 'default' | 'favorite' | 'error' }[] {
  const out: { label: string; type: 'default' | 'favorite' | 'error' }[] = [];
  ep.tags?.forEach((t) => out.push({ label: t, type: 'default' }));
  if (ep.content_rating) out.push({ label: ep.content_rating, type: 'default' });
  if (ep.favorited)  out.push({ label: 'Favorited',   type: 'favorite' });
  if (ep.delayed)    out.push({ label: 'Delayed',     type: 'error' });
  if (ep.cancelled)  out.push({ label: 'Cancelled',   type: 'error' });
  if (ep.corrupted)  out.push({ label: 'Interrupted', type: 'error' });
  if (!ep.completed) out.push({ label: 'Recording',   type: 'error' });
  return out;
}

export default function TVShows() {
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [showSort, setShowSort] = useState<SortMode>('alpha');
  const [showSortOrder, setShowSortOrder] = useState<'asc' | 'desc'>('asc');
  const [episodeSort, setEpisodeSort] = useState<SortMode>('date');
  const [episodeSortOrder, setEpisodeSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<'all' | 'unwatched'>('all');
  const [loadingShows, setLoadingShows] = useState(true);
  const [loadingEps, setLoadingEps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epError, setEpError] = useState<string | null>(null);
  const [watchBusyId, setWatchBusyId] = useState<string | null>(null);
  const [selectedEpisodeRuleId, setSelectedEpisodeRuleId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const serverChangeVersion = useStore((s) => s.serverChangeVersion);
  const playItem = useStore((s) => s.playItem);
  const apiVersionApproved = useStore((s) => s.apiVersionApproved);
  const requestedShowId = searchParams.get('showId');

  useEffect(() => {
    const rawFilter = searchParams.get('filter');
    const nextFilter: 'all' | 'unwatched' = rawFilter === 'unwatched' ? 'unwatched' : 'all';
    setFilter((prev) => (prev === nextFilter ? prev : nextFilter));
  }, [searchParams]);

  function updateFilter(next: 'all' | 'unwatched') {
    setFilter(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', next);
    }
    setSearchParams(params, { replace: true });
  }

  const sortedShows = useMemo(() => {
    const list = [...shows];
    if (showSort === 'alpha') {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      if (showSortOrder === 'desc') list.reverse();
    } else {
      list.sort((a, b) => (b.updated_at ?? b.created_at ?? 0) - (a.updated_at ?? a.created_at ?? 0));
      if (showSortOrder === 'asc') list.reverse();
    }
    return list;
  }, [shows, showSort, showSortOrder]);

  const sortedEpisodes = useMemo(() => {
    const list = filter === 'unwatched' ? episodes.filter((ep) => !ep.watched) : [...episodes];
    if (episodeSort === 'alpha') {
      list.sort((a, b) => {
        const ak = (a.episode_title || a.title || '').trim();
        const bk = (b.episode_title || b.title || '').trim();
        return ak.localeCompare(bk, undefined, { sensitivity: 'base' });
      });
      if (episodeSortOrder === 'desc') list.reverse();
    } else {
      list.sort((a, b) => b.updated_at - a.updated_at);
      if (episodeSortOrder === 'asc') list.reverse();
    }
    return list;
  }, [episodes, filter, episodeSort, episodeSortOrder]);

  useEffect(() => {
    setLoadingShows(true);
    setError(null);
    setEpError(null);
    setSelectedShow(null);
    setEpisodes([]);
    setSelectedEpisode(null);
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
    console.log('[selectShow] called with:', show);
    setSelectedShow(show);
    setEpisodes([]);
    setSelectedEpisode(null);
    setSelectedEpisodeRuleId(null);
    setEpError(null);
    setLoadingEps(true);
    fetchEpisodesForShow(String(show.id))
      .then((eps) => {
        console.log('[selectShow] episodes loaded:', eps);
        setEpisodes(eps);
        setSelectedEpisode(null);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[selectShow] error loading episodes:', msg);
        setEpError(msg);
      })
      .finally(() => {
        setLoadingEps(false);
        console.log('[selectShow] done');
      });
  }

  async function toggleWatched(episode: Episode) {
    if (!apiVersionApproved) {
      setEpError('Server was updated — go to Settings → API Compatibility to review and approve before making changes.');
      return;
    }
    const nextWatched = !episode.watched;
    const previous = episodes;

    setEpError(null);
    setWatchBusyId(episode.id);
    setEpisodes((list) => list.map((ep) => (ep.id === episode.id ? { ...ep, watched: nextWatched } : ep)));
    setSelectedEpisode((prev) => (prev?.id === episode.id ? { ...prev, watched: nextWatched } : prev));

    try {
      await setEpisodeWatched(episode.id, nextWatched);
    } catch (e) {
      setEpisodes(previous);
      setSelectedEpisode((prev) => {
        if (!prev || prev.id !== episode.id) return prev;
        const restored = previous.find((ep) => ep.id === prev.id);
        return restored ?? prev;
      });
      const msg = e instanceof Error ? e.message : String(e);
      setEpError(`Failed to update watched state: ${msg}`);
    } finally {
      setWatchBusyId(null);
    }
  }

  function selectEpisode(ep: Episode) {
    setSelectedEpisode(ep);
    setSelectedEpisodeRuleId(null);
    fetchDvrFile(ep.id)
      .then((file) => setSelectedEpisodeRuleId(file.RuleID || null))
      .catch(() => setSelectedEpisodeRuleId(null));
  }

  async function handleTrashEpisode(episode: Episode) {
    if (!apiVersionApproved) {
      setEpError('Server was updated — go to Settings → API Compatibility to review and approve before making changes.');
      return;
    }
    try {
      await trashRecording(episode.id);
      setEpisodes((list) => list.filter((ep) => ep.id !== episode.id));
      setSelectedEpisode(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setEpError(`Failed to trash recording: ${msg}`);
    }
  }

  async function handleMarkNotRecorded(episode: Episode) {
    if (!apiVersionApproved) {
      setEpError('Server was updated — go to Settings → API Compatibility to review and approve before making changes.');
      return;
    }
    const programId = episode.program_id;
    if (!programId) {
      setEpError('Cannot mark as not recorded: program_id is missing.');
      return;
    }
    try {
      await markAsNotRecorded(programId);
      setSelectedEpisode(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setEpError(`Failed to mark as not recorded: ${msg}`);
    }
  }

  return (
    <div className="page page--split">
      {/* Show list */}
      <aside className="show-list">
        <h2 className="show-list__title">TV Shows</h2>
        <div className="show-list__sort">
          <button
            className={`sort-btn ${showSort === 'alpha' ? 'sort-btn--active' : ''}`}
            onClick={() => {
              if (showSort === 'alpha') setShowSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
              else { setShowSort('alpha'); setShowSortOrder('asc'); }
            }}
          >
            A–Z{showSort === 'alpha' ? (showSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
          <button
            className={`sort-btn ${showSort === 'date' ? 'sort-btn--active' : ''}`}
            onClick={() => {
              if (showSort === 'date') setShowSortOrder((o) => o === 'desc' ? 'asc' : 'desc');
              else { setShowSort('date'); setShowSortOrder('desc'); }
            }}
          >
            Date{showSort === 'date' ? (showSortOrder === 'desc' ? ' ▼' : ' ▲') : ''}
          </button>
        </div>
        {loadingShows && <p className="page__status">Loading…</p>}
        {error && <p className="page__error">⚠ {error}</p>}
        <ul className="show-list__items">
          {sortedShows.map((show) => (
            <li key={show.id}>
              <button
                className={`show-item ${selectedShow?.id === show.id ? 'show-item--active' : ''}`}
                onClick={() => {
                  console.log('[show card] clicked', show);
                  selectShow(show);
                }}
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

      {/* Main content */}
      <div className="page__content">
        {selectedEpisode ? (
          /* ── Episode detail view ── */
          <RecordingDetail
            item={selectedEpisode}
            onPlay={() => {
              const { title, subtitle } = epLabel(selectedEpisode);
              const label = subtitle ? `${title} – ${subtitle}` : title;
              playItem(selectedEpisode.id, label, selectedEpisode.path, selectedEpisode.commercials, '', selectedEpisode.playback_time, 'episode');
            }}
            onNavigateToShow={() => setSelectedEpisode(null)}
            onTrash={() => void handleTrashEpisode(selectedEpisode)}
            onMarkNotRecorded={selectedEpisodeRuleId && selectedEpisode.program_id ? () => void handleMarkNotRecorded(selectedEpisode) : undefined}
          />
        ) : selectedShow ? (
          /* ── Series detail view ── */
          <>
            <header className="page__header">
              <h1 className="page__title">{selectedShow.name}</h1>
              <div className="page__filters">
                <button
                  className={`filter-btn ${filter === 'all' ? 'filter-btn--active' : ''}`}
                  onClick={() => updateFilter('all')}
                >
                  All
                </button>
                <button
                  className={`filter-btn ${filter === 'unwatched' ? 'filter-btn--active' : ''}`}
                  onClick={() => updateFilter('unwatched')}
                >
                  Unwatched
                </button>
                <button
                  className={`sort-btn ${episodeSort === 'alpha' ? 'sort-btn--active' : ''}`}
                  onClick={() => {
                    if (episodeSort === 'alpha') setEpisodeSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
                    else { setEpisodeSort('alpha'); setEpisodeSortOrder('asc'); }
                  }}
                >
                  A–Z{episodeSort === 'alpha' ? (episodeSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
                <button
                  className={`sort-btn ${episodeSort === 'date' ? 'sort-btn--active' : ''}`}
                  onClick={() => {
                    if (episodeSort === 'date') setEpisodeSortOrder((o) => o === 'desc' ? 'asc' : 'desc');
                    else { setEpisodeSort('date'); setEpisodeSortOrder('desc'); }
                  }}
                >
                  Date{episodeSort === 'date' ? (episodeSortOrder === 'desc' ? ' ▼' : ' ▲') : ''}
                </button>
              </div>
            </header>
            {loadingEps && <p className="page__status">Loading episodes…</p>}
            {epError && <p className="page__error">⚠ {epError}</p>}

            {(selectedShow.image_url || selectedShow.summary) && (
              <section className="tv-series-info">
                {selectedShow.image_url && (
                  <img className="tv-series-info__image" src={selectedShow.image_url} alt={selectedShow.name} />
                )}
                {selectedShow.summary && (
                  <p className="tv-series-info__description">{selectedShow.summary}</p>
                )}
              </section>
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
                    badges={epBadges(ep)}
                    completed={ep.completed}
                    commercials={ep.commercials}
                    filePath={ep.path}
                    recordedAt={ep.created_at}
                    recordedAtFormat="datetime"
                    onClick={() => selectEpisode(ep)}
                    onPlayAction={() => {
                      const { title, subtitle } = epLabel(ep);
                      const label = subtitle ? `${title} – ${subtitle}` : title;
                      playItem(ep.id, label, ep.path, ep.commercials, '', ep.playback_time, 'episode');
                    }}
                    playActionLabel="Play episode"
                    onToggleWatched={() => {
                      void toggleWatched(ep);
                    }}
                    watchedActionBusy={watchBusyId === ep.id}
                    recordingKind="episode"
                    ariaLabel={`Select ${subtitle ? `${title} – ${subtitle}` : title}`}
                  />
                );
              })}
              {sortedEpisodes.length === 0 && <p className="page__status">No episodes found.</p>}
            </div>
          </>
        ) : (
          /* ── Empty state ── */
          <div className="page__empty">
            <p>Select a show to see its episodes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
