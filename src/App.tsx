import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import VideoPlayer from './components/VideoPlayer';
import RecentRecordings from './pages/RecentRecordings';
import Live from './pages/Live';
import TVShows from './pages/TVShows';
import Movies from './pages/Movies';
import Library from './pages/Library';
import Settings from './pages/Settings';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route path="/"         element={<RecentRecordings />} />
            <Route path="/live"     element={<Live />} />
            <Route path="/tv"       element={<TVShows />} />
            <Route path="/movies"   element={<Movies />} />
            <Route path="/library"  element={<Library />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      {/* Full-screen overlay when a video is playing */}
      <VideoPlayer />
    </BrowserRouter>
  );
}

export default App;
