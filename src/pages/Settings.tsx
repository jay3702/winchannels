import { useState } from 'react';
import { useStore } from '../store/useStore';
import request, { normalizeServerUrl } from '../api/client';
import './Page.css';

export default function Settings() {
  const { serverUrl, setServerUrl, storageSharePath, setStorageSharePath } = useStore();
  const [draft, setDraft] = useState(serverUrl);
  const [shareDraft, setShareDraft] = useState(storageSharePath);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const normalized = normalizeServerUrl(draft);
  const urlInvalid = draft.trim() !== '' && !/^https?:\/\/.+:\d+$/.test(normalized);

  function save() {
    const clean = normalizeServerUrl(draft);
    if (!clean) return;
    setServerUrl(clean);
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const [episodes, movies, shows] = await Promise.all([
        request<unknown[]>('/api/v1/episodes'),
        request<unknown[]>('/api/v1/movies'),
        request<unknown[]>('/api/v1/shows'),
      ]);
      setTestResult(
        `✓ Connected!\n` +
        `  Episodes: ${Array.isArray(episodes) ? episodes.length : 'bad format → ' + JSON.stringify(episodes).slice(0, 100)}\n` +
        `  Movies:   ${Array.isArray(movies) ? movies.length : 'bad format'}\n` +
        `  Shows:    ${Array.isArray(shows) ? shows.length : 'bad format'}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult(`✗ ${msg}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">Settings</h1>
      </header>

      <div className="settings-form">
        <section className="settings-section">
          <h2 className="settings-section__title">Server</h2>
          <label className="settings-label" htmlFor="server-url">
            Channels DVR Server URL
          </label>
          <div className="settings-row">
            <input
              id="server-url"
              className="settings-input"
              type="url"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
              placeholder="http://192.168.3.150:8089"
              spellCheck={false}
            />
            <button className="settings-save-btn" onClick={save}>
              {saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          {urlInvalid && (
            <p className="settings-hint settings-hint--warn">
              URL should be in the form <code>http://192.168.x.x:8089</code> — include the port number.
            </p>
          )}
          <p className="settings-hint">
            Change this if your server IP address changes. Reload the app after saving.
          </p>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">Subtitles</h2>
          <label className="settings-label" htmlFor="share-path">
            Storage Share Path
          </label>
          <div className="settings-row">
            <input
              id="share-path"
              className="settings-input"
              type="text"
              value={shareDraft}
              onChange={(e) => setShareDraft(e.target.value)}
              placeholder="\\192.168.3.150\AllMedia\Channels"
              spellCheck={false}
            />
            <button
              className="settings-save-btn"
              onClick={() => { setStorageSharePath(shareDraft); }}
            >
              Save
            </button>
          </div>
          <p className="settings-hint">
            UNC or local path to the root of your DVR storage (where recordings are saved).
            Used to load <code>.srt</code> subtitle files alongside recordings.
            Leave blank to disable subtitle loading.
          </p>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">Diagnostics</h2>
          <button className="settings-save-btn" onClick={testConnection} disabled={testing}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          {testResult && (
            <pre className={`settings-test-result ${testResult.startsWith('✓') ? 'settings-test-result--ok' : 'settings-test-result--err'}`}>
              {testResult}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
