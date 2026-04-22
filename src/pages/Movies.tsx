import { useEffect, useMemo, useState } from 'react';
import { fetchMovies, setMovieWatched } from '../api/recordings';
import type { Movie } from '../api/types';
import MediaCard from '../components/MediaCard';
import { useStore } from '../store/useStore';
import './Page.css';

type SortMode = 'alpha' | 'date';

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
    return new Date(value).toLocaleString('en-US');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function movieAttributes(movie: Movie): Array<{ key: string; label: string; value: string }> {
  const hidden = new Set(['image_url', 'thumbnail_url', 'commercials']);
  return Object.entries(movie)
    .filter(([key, value]) => !hidden.has(key) && value != null && value !== '')
    .map(([key, value]) => ({ key, label: labelKey(key), value: formatValue(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Build MediaCard badges for a movie (mirrors the flags shown in RecordingDetail). */
function movieBadges(movie: Movie): { label: string; type: 'default' | 'favorite' | 'error' }[] {
  const out: { label: string; type: 'default' | 'favorite' | 'error' }[] = [];
  movie.tags?.forEach((t) => out.push({ label: t, type: 'default' }));
  if (movie.content_rating) out.push({ label: movie.content_rating, type: 'default' });
  if (movie.favorited)  out.push({ label: 'Favorited',   type: 'favorite' });
  if (movie.delayed)    out.push({ label: 'Delayed',     type: 'error' });
  if (movie.cancelled)  out.push({ label: 'Cancelled',   type: 'error' });
  if (movie.corrupted)  out.push({ label: 'Interrupted', type: 'error' });
  if (!movie.completed) out.push({ label: 'Recording',   type: 'error' });
  return out;
}

export default function Movies() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [watchBusyId, setWatchBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unwatched'>('all');
  const [sort, setSort] = useState<SortMode>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const serverChangeVersion = useStore((s) => s.serverChangeVersion);
  const playItem = useStore((s) => s.playItem);
  const apiVersionApproved = useStore((s) => s.apiVersionApproved);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setActionError(null);
    fetchMovies({ sort: 'date_added', order: 'desc' })
      .then((loaded) => {
        setMovies(loaded);
        setSelectedMovie((prev) => prev ? loaded.find((m) => m.id === prev.id) ?? prev : null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [serverChangeVersion]);

  const displayed = filter === 'unwatched' ? movies.filter((m) => !m.watched) : movies;
  const sortedDisplayed = useMemo(() => {
    const list = [...displayed];
    if (sort === 'alpha') {
      list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      if (sortOrder === 'desc') list.reverse();
    } else {
      list.sort((a, b) => b.created_at - a.created_at);
      if (sortOrder === 'asc') list.reverse();
    }
    return list;
  }, [displayed, sort, sortOrder]);

  async function toggleWatched(movie: Movie) {
    if (!apiVersionApproved) {
      setActionError('Server was updated — go to Settings → API Compatibility to review and approve before making changes.');
      return;
    }
    const nextWatched = !movie.watched;
    const previous = movies;

    setActionError(null);
    setWatchBusyId(movie.id);
    setMovies((list) => list.map((m) => (m.id === movie.id ? { ...m, watched: nextWatched } : m)));
    setSelectedMovie((prev) => (prev?.id === movie.id ? { ...prev, watched: nextWatched } : prev));

    try {
      await setMovieWatched(movie.id, nextWatched);
    } catch (e) {
      setMovies(previous);
      setSelectedMovie((prev) => {
        if (!prev || prev.id !== movie.id) return prev;
        const restored = previous.find((m) => m.id === prev.id);
        return restored ?? prev;
      });
      const msg = e instanceof Error ? e.message : String(e);
      setActionError(`Failed to update watched state: ${msg}`);
    } finally {
      setWatchBusyId(null);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Movies</h1>
        <div className="page__filters">
          <button
            className={`filter-btn ${filter === 'all' ? 'filter-btn--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`filter-btn ${filter === 'unwatched' ? 'filter-btn--active' : ''}`}
            onClick={() => setFilter('unwatched')}
          >
            Unwatched
          </button>
          <button
            className={`sort-btn ${sort === 'alpha' ? 'sort-btn--active' : ''}`}
            onClick={() => {
              if (sort === 'alpha') setSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
              else { setSort('alpha'); setSortOrder('asc'); }
            }}
          >
            A–Z{sort === 'alpha' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
          <button
            className={`sort-btn ${sort === 'date' ? 'sort-btn--active' : ''}`}
            onClick={() => {
              if (sort === 'date') setSortOrder((o) => o === 'desc' ? 'asc' : 'desc');
              else { setSort('date'); setSortOrder('desc'); }
            }}
          >
            Date{sort === 'date' ? (sortOrder === 'desc' ? ' ▼' : ' ▲') : ''}
          </button>
        </div>
      </header>

      {loading && <p className="page__status">Loading…</p>}
      {error && <p className="page__error">⚠ {error}</p>}
      {actionError && <p className="page__error">⚠ {actionError}</p>}

      {!loading && !error && (
        <>
          {selectedMovie && (
            <section className="media-detail media-detail--full">
              <button className="media-detail__back" onClick={() => setSelectedMovie(null)}>
                ← Back to movie list
              </button>
              <button
                className="media-detail__thumb"
                onClick={() => playItem(
                  selectedMovie.id,
                  selectedMovie.title,
                  selectedMovie.path,
                  selectedMovie.commercials,
                  '',
                  selectedMovie.playback_time,
                  'movie'
                )}
                title="Play movie"
              >
                <img src={selectedMovie.thumbnail_url || selectedMovie.image_url || ''} alt={selectedMovie.title} />
                <div className="media-detail__play-icon">▶</div>
              </button>
              <h2 className="media-detail__title">{selectedMovie.title}</h2>
              <p className="media-detail__meta">
                {new Date(selectedMovie.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
                {' · '}
                {new Date(selectedMovie.created_at).toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit',
                })}
                {selectedMovie.content_rating ? ` · ${selectedMovie.content_rating}` : ''}
              </p>
              {(selectedMovie.full_summary || selectedMovie.summary) && (
                <p className="media-detail__description">{selectedMovie.full_summary || selectedMovie.summary}</p>
              )}
              <dl className="media-attrs" aria-label="Movie details">
                {movieAttributes(selectedMovie).map((attr) => (
                  <div key={attr.key} className="media-attrs__row">
                    <dt>{attr.label}</dt>
                    <dd>{attr.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {!selectedMovie && (
            <div className="media-grid">
              {sortedDisplayed.map((movie) => (
                <MediaCard
                  key={movie.id}
                  id={movie.id}
                  title={movie.title}
                  subtitle={movie.release_year ? String(movie.release_year) : undefined}
                  imageUrl={movie.image_url}
                  thumbnailUrl={movie.thumbnail_url}
                  duration={movie.duration}
                  watched={movie.watched}
                  playbackTime={movie.playback_time}
                  badges={movieBadges(movie)}
                  completed={movie.completed}
                  commercials={movie.commercials}
                  filePath={movie.path}
                  recordedAt={movie.created_at}
                  recordedAtFormat="datetime"
                  onClick={() => setSelectedMovie(movie)}
                  onToggleWatched={() => {
                    void toggleWatched(movie);
                  }}
                  watchedActionBusy={watchBusyId === movie.id}
                  recordingKind="movie"
                  selected={false}
                  ariaLabel={`Select ${movie.title}`}
                />
              ))}
              {sortedDisplayed.length === 0 && <p className="page__status">No movies found.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
