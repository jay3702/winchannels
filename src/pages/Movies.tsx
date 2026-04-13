import { useEffect, useMemo, useState } from 'react';
import { fetchMovies } from '../api/recordings';
import type { Movie } from '../api/types';
import MediaCard from '../components/MediaCard';
import './Page.css';

type SortMode = 'alpha' | 'date';

export default function Movies() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unwatched'>('all');
  const [sort, setSort] = useState<SortMode>('date');

  useEffect(() => {
    fetchMovies({ sort: 'date_added', order: 'desc' })
      .then(setMovies)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const displayed = filter === 'unwatched' ? movies.filter((m) => !m.watched) : movies;
  const sortedDisplayed = useMemo(() => {
    const list = [...displayed];
    if (sort === 'alpha') {
      list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    } else {
      list.sort((a, b) => b.created_at - a.created_at);
    }
    return list;
  }, [displayed, sort]);

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
          <select
            className="page-sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            aria-label="Sort movies grid"
          >
            <option value="alpha">Alphabetical</option>
            <option value="date">Date Added</option>
          </select>
        </div>
      </header>

      {loading && <p className="page__status">Loading…</p>}
      {error && <p className="page__error">⚠ {error}</p>}

      {!loading && !error && (
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
              badge={movie.content_rating}
              commercials={movie.commercials}
              filePath={movie.path}
              recordedAt={movie.created_at}
            />
          ))}
          {sortedDisplayed.length === 0 && <p className="page__status">No movies found.</p>}
        </div>
      )}
    </div>
  );
}
