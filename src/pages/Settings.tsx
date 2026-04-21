import { useEffect, useState } from 'react';
import { useStore, type ServerOption } from '../store/useStore';
import { normalizeServerUrl, requestFromServer, probeUrl } from '../api/client';
import './Page.css';

function makeServerId(): string {
  return `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function areSameServers(a: ServerOption[], b: ServerOption[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, i) => {
    const right = b[i];
    return left.id === right.id && left.name === right.name && left.url === right.url && left.tailscaleUrl === right.tailscaleUrl;
  });
}

export default function Settings() {
  const {
    servers,
    setServers,
    storageSharePath,
    setStorageSharePath,
    preferRemux,
    setPreferRemux,
    diagnosticsEnabled,
    setDiagnosticsEnabled,
    showHiddenLiveChannels,
    setShowHiddenLiveChannels,
  } = useStore();
  const [draftServers, setDraftServers] = useState<ServerOption[]>(servers);
  const [shareDraft, setShareDraft] = useState(storageSharePath);
  const [saved, setSaved] = useState(false);
  const [serverSaveError, setServerSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setDraftServers(servers);
  }, [servers]);

  function updateServer(serverId: string, field: 'name' | 'url' | 'tailscaleUrl', value: string) {
    setDraftServers((prev) =>
      prev.map((server) =>
        server.id === serverId ? { ...server, [field]: value } : server
      )
    );
    setSaved(false);
    setServerSaveError(null);
  }

  function addServerRow() {
    setDraftServers((prev) => [...prev, { id: makeServerId(), name: '', url: '' }]);
    setSaved(false);
    setServerSaveError(null);
  }

  function removeServerRow(serverId: string) {
    setDraftServers((prev) => prev.filter((server) => server.id !== serverId));
    setSaved(false);
    setServerSaveError(null);
  }

  function validateServerDrafts(): ServerOption[] | null {
    const validated: ServerOption[] = [];

    for (const server of draftServers) {
      const name = server.name.trim();
      const rawUrl = server.url.trim();
      if (!name && !rawUrl) continue;
      if (!name || !rawUrl) {
        setServerSaveError('Each server row must include both Name and URL.');
        return null;
      }

      const normalized = normalizeServerUrl(rawUrl);
      if (!/^https?:\/\/.+:\d+$/.test(normalized)) {
        setServerSaveError(`Invalid URL for "${name}". Include scheme and port, e.g. http://192.168.1.4:8189`);
        return null;
      }
      const rawTailscale = (server.tailscaleUrl ?? '').trim();
      let tailscaleUrl: string | undefined;
      if (rawTailscale) {
        const normalizedTs = normalizeServerUrl(rawTailscale);
        if (!/^https?:\/\/.+:\d+$/.test(normalizedTs)) {
          setServerSaveError(`Invalid Tailscale URL for "${name}". Include scheme and port, e.g. http://100.64.0.1:8189`);
          return null;
        }
        tailscaleUrl = normalizedTs;
      }
      validated.push({ id: server.id || makeServerId(), name, url: normalized, ...(tailscaleUrl ? { tailscaleUrl } : {}) });
    }

    if (validated.length === 0) {
      setServerSaveError('Add at least one server with Name and URL.');
      return null;
    }

    return validated;
  }

  function saveServers(showSavedState = true): ServerOption[] | null {
    const validated = validateServerDrafts();
    if (!validated) return null;

    if (!areSameServers(validated, servers)) {
      setServers(validated);
    }
    setServerSaveError(null);
    if (showSavedState) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setTestResult(null);
    return validated;
  }

  async function testConnection() {
    const validatedServers = saveServers(false);
    if (!validatedServers) {
      setTestResult('✗ Fix server table errors, then test again.');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const lines: string[] = [];
      let okCount = 0;

      for (const server of validatedServers) {
        // Determine which URL to test: probe LAN, fall back to Tailscale
        let testUrl = server.url;
        let urlLabel = 'LAN';
        if (server.tailscaleUrl) {
          const lanOk = await probeUrl(server.url);
          if (!lanOk) {
            testUrl = server.tailscaleUrl;
            urlLabel = 'Tailscale';
          }
        }
        lines.push(`[${server.name}] ${testUrl} (${urlLabel})`);
        try {
          const [episodes, movies, shows] = await Promise.all([
            requestFromServer<unknown[]>(testUrl, '/api/v1/episodes'),
            requestFromServer<unknown[]>(testUrl, '/api/v1/movies'),
            requestFromServer<unknown[]>(testUrl, '/api/v1/shows'),
          ]);

          const ep = Array.isArray(episodes)
            ? episodes.length
            : `bad format -> ${JSON.stringify(episodes).slice(0, 80)}`;
          const mv = Array.isArray(movies) ? movies.length : 'bad format';
          const sh = Array.isArray(shows) ? shows.length : 'bad format';

          lines.push(`  ✓ Episodes: ${ep}  Movies: ${mv}  Shows: ${sh}`);
          okCount += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          lines.push(`  ✗ ${msg}`);
        }
        lines.push('');
      }

      const allOk = okCount === validatedServers.length;
      const header = allOk
        ? `✓ Server checks complete (${okCount}/${validatedServers.length} passed)`
        : `✗ Server checks complete (${okCount}/${validatedServers.length} passed)`;
      setTestResult([header, '', ...lines].join('\n').trim());
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
          <h2 className="settings-section__title">Servers</h2>
          <table className="settings-table" aria-label="Configured DVR servers">
            <thead>
              <tr>
                <th>Name</th>
                <th>LAN URL</th>
                <th>Tailscale URL</th>
              </tr>
            </thead>
            <tbody>
              {draftServers.map((server) => (
                <tr key={server.id}>
                  <td>
                    <input
                      className="settings-input"
                      type="text"
                      value={server.name}
                      onChange={(e) => updateServer(server.id, 'name', e.target.value)}
                      placeholder="Living Room"
                      spellCheck={false}
                    />
                  </td>
                  <td>
                    <div className="settings-table-url-cell">
                      <input
                        className="settings-input"
                        type="url"
                        value={server.url}
                        onChange={(e) => updateServer(server.id, 'url', e.target.value)}
                        placeholder="http://192.168.1.4:8189"
                        spellCheck={false}
                      />
                      <button
                        className="settings-row-delete-btn"
                        onClick={() => removeServerRow(server.id)}
                        aria-label={`Remove ${server.name || 'server'} row`}
                        title="Remove row"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      className="settings-input"
                      type="url"
                      value={server.tailscaleUrl ?? ''}
                      onChange={(e) => updateServer(server.id, 'tailscaleUrl', e.target.value)}
                      placeholder="http://100.64.0.1:8189 (optional)"
                      spellCheck={false}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="settings-row settings-row--top-gap">
            <button className="settings-save-btn settings-save-btn--secondary" onClick={addServerRow}>
              Add Server
            </button>
            <button className="settings-save-btn" onClick={() => saveServers()}>
              {saved ? '✓ Saved' : 'Save Servers'}
            </button>
          </div>
          {serverSaveError && <p className="settings-hint settings-hint--warn">{serverSaveError}</p>}
          <p className="settings-hint">
            Add as many servers as you like. Use the server dropdown in the left sidebar to switch instantly.
            The <strong>Tailscale URL</strong> is optional — if provided, WinChannels will probe the LAN URL on startup
            and fall back to the Tailscale address when it's unreachable.
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
          <h2 className="settings-section__title">Playback</h2>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={preferRemux}
              onChange={(e) => setPreferRemux(e.target.checked)}
            />
            <span>Prefer remux stream (best quality on local LAN)</span>
          </label>
          <p className="settings-hint">
            Turn this off for remote internet playback if startup/reliability is better with standard transcode behavior.
          </p>
          <label className="settings-toggle settings-toggle--top-gap">
            <input
              type="checkbox"
              checked={diagnosticsEnabled}
              onChange={(e) => setDiagnosticsEnabled(e.target.checked)}
            />
            <span>Enable diagnostics tools in player</span>
          </label>
          <p className="settings-hint">
            Shows in-player diagnostics tools, including a live stats overlay and report copy button for troubleshooting playback.
          </p>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">Live TV</h2>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={showHiddenLiveChannels}
              onChange={(e) => setShowHiddenLiveChannels(e.target.checked)}
            />
            <span>Show hidden channels</span>
          </label>
          <p className="settings-hint">
            When off, Live TV filters out channels marked hidden by your channel source or Channels DVR metadata.
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

        <section className="settings-section">
          <h2 className="settings-section__title">About</h2>
          <p className="settings-hint settings-hint--about">
            <strong>WinChannels</strong> v{__APP_VERSION__}
          </p>
          <p className="settings-hint settings-hint--about">
            Repository: <a className="settings-link" href={__APP_REPOSITORY_URL__} target="_blank" rel="noreferrer">{__APP_REPOSITORY_URL__}</a>
          </p>
        </section>
      </div>
    </div>
  );
}
