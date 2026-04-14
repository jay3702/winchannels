import { useEffect, useMemo, useState } from 'react';
import { fetchVideoGroups, fetchVideosInGroup } from '../api/library';
import type { VideoGroup, Video } from '../api/types';
import MediaCard from '../components/MediaCard';
import { useStore } from '../store/useStore';
import './Page.css';

type SortMode = 'alpha' | 'date';

export default function Library() {
  const [groups, setGroups] = useState<VideoGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<VideoGroup | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [groupSort, setGroupSort] = useState<SortMode>('alpha');
  const [videoSort, setVideoSort] = useState<SortMode>('date');
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serverChangeVersion = useStore((s) => s.serverChangeVersion);

  const sortedGroups = useMemo(() => {
    const list = [...groups];
    if (groupSort === 'alpha') {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    } else {
      list.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    }
    return list;
  }, [groups, groupSort]);

  const sortedVideos = useMemo(() => {
    const list = [...videos];
    if (videoSort === 'alpha') {
      list.sort((a, b) => a.video_title.localeCompare(b.video_title, undefined, { sensitivity: 'base' }));
    } else {
      list.sort((a, b) => b.created_at - a.created_at);
    }
    return list;
  }, [videos, videoSort]);

  useEffect(() => {
    setLoadingGroups(true);
    setError(null);
    setSelectedGroup(null);
    setVideos([]);
    fetchVideoGroups()
      .then(setGroups)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingGroups(false));
  }, [serverChangeVersion]);

  function selectGroup(group: VideoGroup) {
    setSelectedGroup(group);
    setVideos([]);
    setLoadingVideos(true);
    fetchVideosInGroup(group.id)
      .then(setVideos)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingVideos(false));
  }

  return (
    <div className="page page--split">
      <aside className="show-list">
        <h2 className="show-list__title">Videos</h2>
        <div className="show-list__sort">
          <select
            className="page-sort-select"
            value={groupSort}
            onChange={(e) => setGroupSort(e.target.value as SortMode)}
            aria-label="Sort library list"
          >
            <option value="alpha">Alphabetical</option>
            <option value="date">Date Added</option>
          </select>
        </div>
        {loadingGroups && <p className="page__status">Loading…</p>}
        {error && <p className="page__error">⚠ {error}</p>}
        <ul className="show-list__items">
          {sortedGroups.map((g) => (
            <li key={g.id}>
              <button
                className={`show-item ${selectedGroup?.id === g.id ? 'show-item--active' : ''}`}
                onClick={() => selectGroup(g)}
              >
                {g.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="page__content">
        {selectedGroup ? (
          <>
            <header className="page__header">
              <h1 className="page__title">{selectedGroup.name}</h1>
              <div className="page__filters">
                <select
                  className="page-sort-select"
                  value={videoSort}
                  onChange={(e) => setVideoSort(e.target.value as SortMode)}
                  aria-label="Sort library grid"
                >
                  <option value="alpha">Alphabetical</option>
                  <option value="date">Date Added</option>
                </select>
              </div>
            </header>
            {loadingVideos && <p className="page__status">Loading videos…</p>}
            <div className="media-grid">
              {sortedVideos.map((v) => (
                <MediaCard
                  key={v.id}
                  id={v.id}
                  title={v.video_title}
                  imageUrl={v.image_url}
                  thumbnailUrl={v.thumbnail_url}
                  duration={v.duration}
                  watched={v.watched}
                  playbackTime={v.playback_time}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="page__empty">
            <p>Select a library section to browse videos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
