import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchEpisodes, fetchMovies, fetchShows } from '../api/recordings';
import { fetchVideos } from '../api/library';
import type { Episode, Movie, Show, Video } from '../api/types';
import { useStore } from '../store/useStore';
import './Page.css';

type SearchType = 'any' | 'title' | 'summary' | 'series-name';
type ResultType = 'TV Episode' | 'TV Series' | 'Movie' | 'Video';
const SEARCH_STATE_KEY = 'winchannels_search_state_v1';

interface SearchResultRow {
  key: string;
  type: ResultType;
  createdAt: number | null;
  updatedAt: number | null;
  title: string;
  episodeTitle: string;
  summary: string;
  fullSummary: string;
  navigateTo: string;
}

function includesNeedle(value: string | undefined, needle: string): boolean {
  if (!value) return false;
  return value.toLocaleLowerCase().includes(needle);
}

function formatDate(ms: number | null): string {
  if (!ms || !Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function loadSearchState(): { keyword: string; submittedKeyword: string; searchType: SearchType } {
  try {
    const raw = localStorage.getItem(SEARCH_STATE_KEY);
    if (!raw) return { keyword: '', submittedKeyword: '', searchType: 'any' };
    const parsed = JSON.parse(raw) as Partial<{ keyword: string; submittedKeyword: string; searchType: SearchType }>;
    const searchType = parsed.searchType;
    const safeType: SearchType =
      searchType === 'any' || searchType === 'title' || searchType === 'summary' || searchType === 'series-name'
        ? searchType
        : 'any';
    return {
      keyword: parsed.keyword ?? '',
      submittedKeyword: parsed.submittedKeyword ?? '',
      searchType: safeType,
    };
  } catch {
    return { keyword: '', submittedKeyword: '', searchType: 'any' };
  }
}

export default function Search() {
  const initialState = loadSearchState();
  const [keyword, setKeyword] = useState(initialState.keyword);
  const [submittedKeyword, setSubmittedKeyword] = useState(initialState.submittedKeyword);
  const [searchType, setSearchType] = useState<SearchType>(initialState.searchType);
  const [shows, setShows] = useState<Show[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const serverChangeVersion = useStore((s) => s.serverChangeVersion);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchShows(), fetchEpisodes(), fetchMovies(), fetchVideos()])
      .then(([nextShows, nextEpisodes, nextMovies, nextVideos]) => {
        setShows(nextShows);
        setEpisodes(nextEpisodes);
        setMovies(nextMovies);
        setVideos(nextVideos);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [serverChangeVersion]);

  useEffect(() => {
    setSubmittedKeyword(keyword);
  }, [searchType]);

  useEffect(() => {
    localStorage.setItem(
      SEARCH_STATE_KEY,
      JSON.stringify({ keyword, submittedKeyword, searchType }),
    );
  }, [keyword, searchType, submittedKeyword]);

  const results = useMemo(() => {
    const needle = submittedKeyword.trim().toLocaleLowerCase();
    if (!needle) return [] as SearchResultRow[];

    const rows: SearchResultRow[] = [];

    const matchingShowIdsByName = new Set(
      shows
        .filter((s) => includesNeedle(s.name, needle))
        .map((s) => s.id),
    );

    for (const show of shows) {
      const inAny = [show.id, show.name, show.summary].some((v) => includesNeedle(v, needle));
      const inTitle = includesNeedle(show.name, needle);
      const inSummary = includesNeedle(show.summary, needle);
      const inSeriesName = matchingShowIdsByName.has(show.id);

      const matched =
        (searchType === 'any' && inAny) ||
        (searchType === 'title' && inTitle) ||
        (searchType === 'summary' && inSummary) ||
        (searchType === 'series-name' && inSeriesName);

      if (!matched) continue;

      rows.push({
        key: `series:${show.id}`,
        type: 'TV Series',
        createdAt: show.created_at ?? null,
        updatedAt: show.updated_at ?? null,
        title: show.name,
        episodeTitle: '',
        summary: show.summary ?? '',
        fullSummary: '',
        navigateTo: `/tv?showId=${encodeURIComponent(show.id)}`,
      });
    }

    for (const ep of episodes) {
      const inAny = [
        ep.show_id,
        ep.program_id,
        ep.title,
        ep.episode_title,
        ep.summary,
        ep.full_summary,
      ].some((v) => includesNeedle(v, needle));
      const inTitle = [ep.title, ep.episode_title].some((v) => includesNeedle(v, needle));
      const inSummary = [ep.summary, ep.full_summary].some((v) => includesNeedle(v, needle));
      const inSeriesName = matchingShowIdsByName.has(ep.show_id);

      const matched =
        (searchType === 'any' && inAny) ||
        (searchType === 'title' && inTitle) ||
        (searchType === 'summary' && inSummary) ||
        (searchType === 'series-name' && inSeriesName);

      if (!matched) continue;

      rows.push({
        key: `episode:${ep.id}`,
        type: 'TV Episode',
        createdAt: ep.created_at,
        updatedAt: ep.updated_at,
        title: ep.title,
        episodeTitle: ep.episode_title,
        summary: ep.summary,
        fullSummary: ep.full_summary ?? '',
        navigateTo: `/tv?showId=${encodeURIComponent(ep.show_id)}&episodeId=${encodeURIComponent(ep.id)}`,
      });
    }

    for (const movie of movies) {
      const inAny = [movie.program_id, movie.title, movie.summary, movie.full_summary].some((v) => includesNeedle(v, needle));
      const inTitle = includesNeedle(movie.title, needle);
      const inSummary = [movie.summary, movie.full_summary].some((v) => includesNeedle(v, needle));
      const matched =
        (searchType === 'any' && inAny) ||
        (searchType === 'title' && inTitle) ||
        (searchType === 'summary' && inSummary);

      if (!matched) continue;

      rows.push({
        key: `movie:${movie.id}`,
        type: 'Movie',
        createdAt: movie.created_at,
        updatedAt: movie.updated_at,
        title: movie.title,
        episodeTitle: '',
        summary: movie.summary,
        fullSummary: movie.full_summary ?? '',
        navigateTo: `/movies?movieId=${encodeURIComponent(movie.id)}`,
      });
    }

    for (const video of videos) {
      const inAny = [video.title, video.video_title, video.summary].some((v) => includesNeedle(v, needle));
      const inTitle = includesNeedle(video.title, needle);
      const inSummary = includesNeedle(video.summary, needle);
      const matched =
        (searchType === 'any' && inAny) ||
        (searchType === 'title' && inTitle) ||
        (searchType === 'summary' && inSummary);

      if (!matched) continue;

      rows.push({
        key: `video:${video.id}`,
        type: 'Video',
        createdAt: video.created_at,
        updatedAt: video.updated_at,
        title: video.title,
        episodeTitle: video.video_title,
        summary: video.summary ?? '',
        fullSummary: '',
        navigateTo: `/library?groupId=${encodeURIComponent(video.video_group_id)}&videoId=${encodeURIComponent(video.id)}`,
      });
    }

    const rank: Record<ResultType, number> = {
      'TV Series': 0,
      'TV Episode': 1,
      Movie: 2,
      Video: 3,
    };
    rows.sort((a, b) => {
      const byType = rank[a.type] - rank[b.type];
      if (byType !== 0) return byType;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
    return rows;
  }, [episodes, movies, searchType, shows, submittedKeyword, videos]);

  function runSearch(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setSubmittedKeyword(keyword);
  }

  function clearSearch() {
    setKeyword('');
    setSubmittedKeyword('');
  }

  return (
    <div className="page">
      <header className="page__header page__header--search">
        <h1 className="page__title">Search</h1>
      </header>

      <form className="search-panel" aria-label="Search controls" onSubmit={runSearch}>
        <label className="search-panel__label" htmlFor="search-keyword">Keyword</label>
        <div className="search-panel__input-row">
          <div className="search-panel__input-wrap">
            <input
              id="search-keyword"
              className="search-panel__input"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setSubmittedKeyword(keyword);
                }
              }}
              placeholder="Enter a keyword"
            />
            {keyword && (
              <button type="button" className="search-panel__clear-btn" onClick={clearSearch} aria-label="Clear search">
                ✕
              </button>
            )}
          </div>
          <button type="submit" className="filter-btn filter-btn--active">🔍 Search</button>
        </div>

        <fieldset className="search-panel__types">
          <legend>Search Type</legend>
          <label>
            <input
              type="radio"
              name="search-type"
              value="any"
              checked={searchType === 'any'}
              onChange={() => setSearchType('any')}
            />
            Any
          </label>
          <label>
            <input
              type="radio"
              name="search-type"
              value="title"
              checked={searchType === 'title'}
              onChange={() => setSearchType('title')}
            />
            Title
          </label>
          <label>
            <input
              type="radio"
              name="search-type"
              value="summary"
              checked={searchType === 'summary'}
              onChange={() => setSearchType('summary')}
            />
            Summary
          </label>
          <label>
            <input
              type="radio"
              name="search-type"
              value="series-name"
              checked={searchType === 'series-name'}
              onChange={() => setSearchType('series-name')}
            />
            Series Name
          </label>
        </fieldset>
      </form>

      {loading && <p className="page__status">Loading search index…</p>}
      {error && <p className="page__error">⚠ {error}</p>}

      {!loading && !error && (
        <section className="search-results" aria-label="Search results">
          <div className="search-results__summary">
            {submittedKeyword.trim() ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Enter a keyword to search'}
          </div>
          <div className="search-results__table-wrap">
            <table className="search-results__table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Created Date</th>
                  <th>Modified Date</th>
                  <th>Title</th>
                  <th>Episode Title</th>
                  <th>Summary</th>
                  <th>Full Summary</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr
                    key={row.key}
                    className="search-results__row"
                    onClick={() => navigate(row.navigateTo)}
                  >
                    <td>{row.type}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{formatDate(row.updatedAt)}</td>
                    <td>{row.title}</td>
                    <td>{row.episodeTitle}</td>
                    <td>{row.summary}</td>
                    <td>{row.fullSummary}</td>
                  </tr>
                ))}
                {submittedKeyword.trim() && results.length === 0 && (
                  <tr>
                    <td colSpan={7} className="search-results__empty">No matches found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
