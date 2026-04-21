import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import VideoPlayer from './components/VideoPlayer';
import RecentRecordings from './pages/RecentRecordings';
import Live from './pages/Live';
import TVShows from './pages/TVShows';
import Movies from './pages/Movies';
import Library from './pages/Library';
import Settings from './pages/Settings';
import { useStore } from './store/useStore';
import './App.css';

function App() {
  const { activeServerId, probeActiveServer } = useStore();
  const [probing, setProbing] = useState(true);

  // On startup and whenever the active server changes, probe the LAN URL and
  // automatically fall back to the Tailscale URL if the LAN is unreachable.
  // Block route rendering until the probe resolves so pages always fetch with
  // the correct server URL.
  useEffect(() => {
    setProbing(true);
    probeActiveServer().finally(() => setProbing(false));
  }, [activeServerId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          {probing ? (
            <div className="app-connecting">Connecting…</div>
          ) : (
            <Routes>
              <Route path="/"         element={<RecentRecordings />} />
              <Route path="/live"     element={<Live />} />
              <Route path="/tv"       element={<TVShows />} />
              <Route path="/movies"   element={<Movies />} />
              <Route path="/library"  element={<Library />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          )}
        </main>
      </div>
      {/* Full-screen overlay when a video is playing */}
      <VideoPlayer />
    </BrowserRouter>
  );
}

export default App;
