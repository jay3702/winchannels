import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { invoke } from '@tauri-apps/api/core';
import request, { streamUrl } from '../api/client';
import { useStore } from '../store/useStore';
import { buildTauriHlsLoader } from '../lib/hlsTauriLoader';
import './VideoPlayer.css';

// Cache the Tauri HLS loader at module level so the dynamic import
// only fires once and never hangs on subsequent play attempts.
let tauriLoaderCache: Awaited<ReturnType<typeof buildTauriHlsLoader>> | null = null;
let tauriLoaderPromise: Promise<void> | null = null;
function getTauriLoader() {
  if (tauriLoaderCache !== null) return Promise.resolve(tauriLoaderCache);
  if (!tauriLoaderPromise) {
    tauriLoaderPromise = buildTauriHlsLoader().then(l => { tauriLoaderCache = l ?? null; });
  }
  return tauriLoaderPromise.then(() => tauriLoaderCache);
}
// Pre-warm in production so the loader is ready before the first play attempt.
if (import.meta.env.PROD) void getTauriLoader();

// Cache the DVR server's storage root path (e.g. "/tank/AllMedia/Channels").
// Fetched once from /dvr and used to strip the absolute prefix from file paths
// before joining with the Windows share path.
let dvrStorageRootCache: string | null = null;
async function getDvrStorageRoot(): Promise<string> {
  if (dvrStorageRootCache !== null) return dvrStorageRootCache;
  try {
    const data = await request<{ path?: string }>('/dvr');
    dvrStorageRootCache = (data.path ?? '').replace(/\/+$/, '');
  } catch {
    dvrStorageRootCache = '';
  }
  return dvrStorageRootCache;
}

/** Convert an SRT string to WebVTT. Returns null if input is empty/blank. */
function srtToVtt(srt: string): string | null {
  const trimmed = srt.trim();
  if (!trimmed) return null;
  // Replace SRT timestamp commas with dots and prepend the WEBVTT header.
  // SRT: 00:01:23,456 --> 00:01:25,789
  // VTT: 00:01:23.456 --> 00:01:25.789
  const vtt = trimmed.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + vtt;
}

const SKIP_FWD = 30;
const SKIP_BACK = 10;
const RE_ENABLE_BEFORE = 30; // seek this many seconds before block start to re-enable auto-skip
type CaptionMode = 'off' | 'broadcast' | 'srt';

function formatBitrate(bitsPerSec: number | undefined): string {
  if (!bitsPerSec || !Number.isFinite(bitsPerSec) || bitsPerSec <= 0) return 'n/a';
  const mbps = bitsPerSec / 1_000_000;
  if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
  return `${(bitsPerSec / 1000).toFixed(0)} kbps`;
}

function withQuery(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export default function VideoPlayer() {
  const {
    nowPlayingId,
    nowPlayingKey,
    nowPlayingTitle,
    nowPlayingCommercials,
    nowPlayingFilePath,
    storageSharePath,
    stopPlayback,
    serverChangeVersion,
    preferRemux,
    diagnosticsEnabled,
  } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const subtitleBlobUrl = useRef<string | null>(null);
  const activeManifestUrlRef = useRef<string>('');
  // Flag to distinguish programmatic seeks from user seeks
  const isAutoSeekRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [skipAds, setSkipAds] = useState(true);
  const [skipping, setSkipping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Indices of blocks where auto-skip has been manually overridden
  const [disabledBlocks, setDisabledBlocks] = useState<Set<number>>(new Set());
  const [hasSrt, setHasSrt] = useState(false);
  const [hasBroadcast, setHasBroadcast] = useState(false);
  const [captionMode, setCaptionMode] = useState<CaptionMode>('off');
  const [reportCopied, setReportCopied] = useState(false);
  const captionModeRef = useRef<CaptionMode>('off');
  captionModeRef.current = captionMode;

  useEffect(() => {
    dvrStorageRootCache = null;
  }, [serverChangeVersion]);

  function getCaptionTracks(video: HTMLVideoElement) {
    const tracks = Array.from(video.textTracks);
    const srt = tracks.find((t) => t.label === 'Subtitles' && t.kind === 'subtitles') ?? null;
    const broadcast = tracks.find((t) => t !== srt && (t.kind === 'captions' || t.kind === 'subtitles')) ?? null;
    return { tracks, srt, broadcast };
  }

  function applyCaptionMode(video: HTMLVideoElement, mode: CaptionMode) {
    const { tracks, srt, broadcast } = getCaptionTracks(video);
    tracks.forEach((t) => {
      if (t.kind === 'captions' || t.kind === 'subtitles') t.mode = 'hidden';
    });
    if (mode === 'srt' && srt) srt.mode = 'showing';
    if (mode === 'broadcast' && broadcast) broadcast.mode = 'showing';
  }

  function syncCaptionState(video: HTMLVideoElement) {
    const { srt, broadcast } = getCaptionTracks(video);
    setHasSrt(Boolean(srt));
    setHasBroadcast(Boolean(broadcast));

    let next = captionModeRef.current;
    if (next === 'srt' && !srt) next = broadcast ? 'broadcast' : 'off';
    if (next === 'broadcast' && !broadcast) next = srt ? 'srt' : 'off';

    if (next !== captionModeRef.current) setCaptionMode(next);
    applyCaptionMode(video, next);
  }

  // Refs so event handlers always see current values without re-registration
  const skipAdsRef = useRef(skipAds);
  const disabledBlocksRef = useRef(disabledBlocks);
  skipAdsRef.current = skipAds;
  disabledBlocksRef.current = disabledBlocks;

  const adBlocks = useMemo<[number, number][]>(() => {
    const blocks: [number, number][] = [];
    for (let i = 0; i + 1 < nowPlayingCommercials.length; i += 2) {
      blocks.push([nowPlayingCommercials[i], nowPlayingCommercials[i + 1]]);
    }
    return blocks;
  }, [nowPlayingCommercials]);

  const adBlocksRef = useRef(adBlocks);
  adBlocksRef.current = adBlocks;

  // Reset UI state when item changes
  useEffect(() => {
    setHasSrt(false);
    setHasBroadcast(false);
    setCaptionMode('off');
    setCurrentTime(0);
    setDuration(0);
    setDisabledBlocks(new Set());
    setSkipping(false);
  }, [nowPlayingKey]);

  // HLS setup
  useEffect(() => {
    const video = videoRef.current;
    // Always clear the error so the video element stays visible and the
    // ref is available even if a previous play attempt failed.
    setError(null);
    if (!video || !nowPlayingId) return;

    const src = streamUrl(nowPlayingId);
    const remuxSrc = withQuery(src, 'encoder', 'remux');
    activeManifestUrlRef.current = preferRemux ? remuxSrc : src;

    if (Hls.isSupported()) {
      let cancelled = false;

      void (async () => {
        // Use the Tauri loader whenever we're running inside Tauri (dev or prod)
        // so HLS requests bypass browser CORS restrictions.
        const tauriLoader = window.__TAURI_INTERNALS__ ? await getTauriLoader() : undefined;
        // Fetch DVR storage root for SRT path stripping (cached after first call)
        const dvrStorageRoot = storageSharePath ? await getDvrStorageRoot() : '';

        if (cancelled) return;

        // Local-network DVR: assume high bandwidth from the start so ABR
        // picks the highest quality tier immediately instead of ramping up.
        // enableWorker:false — hls.js workers fail to load scripts under the
        // tauri:// custom protocol used in production builds.
        const hlsConfig = {
          enableWorker: false,
          testBandwidth: false,
          startLevel: 999,
          capLevelToPlayerSize: false,
          abrEwmaDefaultEstimate: 20_000_000,
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          abrBandWidthFactor: 0.98,
          abrBandWidthUpFactor: 0.5,
          // Extract CEA-608/708 closed captions embedded in TS segments and
          // expose them as native video text tracks (selectable via the
          // browser's built-in CC button in the video controls bar).
          enableCEA708Captions: true,
          ...(tauriLoader ? { loader: tauriLoader as any } : {}),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hls = new Hls(hlsConfig as any);
        hlsRef.current = hls;
        let usedRemuxManifest = preferRemux;

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.error('HLS error:', data.type, data.details, data.fatal,
            'url:', data.url, 'response:', data.response);

          // Some DVR/server combinations may not honor encoder=remux. If the
          // remux-preferred manifest fails to load, retry once with default URL.
          if (
            data.fatal &&
            usedRemuxManifest &&
            data.details === 'manifestLoadError'
          ) {
            usedRemuxManifest = false;
            activeManifestUrlRef.current = src;
            hls.loadSource(src);
            return;
          }

          if (data.fatal && !cancelled) {
            const status = data.response?.code ? ` (HTTP ${data.response.code})` : '';
            const errUrl = data.url ?? activeManifestUrlRef.current;
            setError(
              `Playback failed\n` +
              `Type: ${data.type}\n` +
              `Detail: ${data.details}${status}\n` +
              `URL: ${errUrl}`
            );
          }
        });

        hls.loadSource(preferRemux ? remuxSrc : src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          if (!cancelled) {
            // Lock to the best available quality level by bitrate.
            // ABR relies on bandwidth samples from the loader; the Tauri HTTP
            // loader buffers the full response before returning it, so timing
            // data is unreliable and ABR incorrectly downgrades quality.
            // On a local network there's no reason to use ABR at all.
            const bestLevelIndex = data.levels.reduce((bestIdx, level, idx, arr) => {
              const best = arr[bestIdx];
              const byBitrate = (level.bitrate ?? 0) - (best.bitrate ?? 0);
              if (byBitrate !== 0) return byBitrate > 0 ? idx : bestIdx;

              const levelPixels = (level.width ?? 0) * (level.height ?? 0);
              const bestPixels = (best.width ?? 0) * (best.height ?? 0);
              return levelPixels > bestPixels ? idx : bestIdx;
            }, 0);
            hls.currentLevel = bestLevelIndex;
            video.play().catch((e: Error) => { if (!cancelled) setError(e.message); });
            syncCaptionState(video);

            // Try to load a sidecar .srt subtitle file if a share path is configured.
            if (storageSharePath && nowPlayingFilePath) {
              // Strip the DVR server's absolute storage root prefix so we get
              // a path relative to the share root, e.g.:
              //   /tank/AllMedia/Channels/TV/Show/ep.mpg → TV\Show\ep.srt
              let relPath = nowPlayingFilePath;
              if (dvrStorageRoot && relPath.startsWith(dvrStorageRoot)) {
                relPath = relPath.slice(dvrStorageRoot.length);
              }
              const rel = relPath.replace(/^[\/\\]+/, '').replace(/\//g, '\\').replace(/\.[^.\\]+$/, '.srt');
              const base = storageSharePath.replace(/[/\\]+$/, '');
              const srtPath = `${base}\\${rel}`;
              (invoke('read_text_file', { path: srtPath }) as Promise<string>)
                .then((srt) => {
                  if (cancelled) return;
                  const vtt = srtToVtt(srt);
                  if (!vtt) return;
                  // Revoke any previous blob URL
                  if (subtitleBlobUrl.current) URL.revokeObjectURL(subtitleBlobUrl.current);
                  const blob = new Blob([vtt], { type: 'text/vtt' });
                  const blobUrl = URL.createObjectURL(blob);
                  subtitleBlobUrl.current = blobUrl;
                  // Remove any existing sidecar tracks, then inject the new one
                  const existing = video.querySelectorAll('track[data-srt]');
                  existing.forEach((t) => t.remove());
                  const track = document.createElement('track');
                  track.kind = 'subtitles';
                  track.label = 'Subtitles';
                  track.srclang = 'en';
                  track.default = true;
                  track.src = blobUrl;
                  track.dataset.srt = '1';
                  track.addEventListener('load', () => {
                    syncCaptionState(video);
                  });
                  video.appendChild(track);
                })
                .catch((e: unknown) => {
                  console.warn('[SRT] Could not load subtitle file:', srtPath, e);
                });
            }
          }
        });
      })();

      return () => {
        cancelled = true;
        hlsRef.current?.destroy();
        hlsRef.current = null;
        if (subtitleBlobUrl.current) {
          URL.revokeObjectURL(subtitleBlobUrl.current);
          subtitleBlobUrl.current = null;
        }
        // Remove injected subtitle track from video element
        const video2 = videoRef.current;
        if (video2) {
          video2.querySelectorAll('track[data-srt]').forEach((t) => t.remove());
        }
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.play().catch((e: Error) => setError(e.message));
      return () => { /* nothing hls-specific to destroy */ };
    } else {
      setError('HLS playback is not supported in this environment.');
    }
  }, [nowPlayingKey, preferRemux]);

  // Track additions/removals happen asynchronously (especially broadcast CEA tracks).
  // Keep availability + current mode in sync whenever TextTracks changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !nowPlayingId) return;

    const list = video.textTracks as TextTrackList & {
      onaddtrack?: ((this: TextTrackList, ev: TrackEvent) => any) | null;
      onremovetrack?: ((this: TextTrackList, ev: TrackEvent) => any) | null;
    };

    const onChange = () => syncCaptionState(video);
    const prevAdd = list.onaddtrack ?? null;
    const prevRemove = list.onremovetrack ?? null;

    list.onaddtrack = () => onChange();
    list.onremovetrack = () => onChange();
    onChange();

    return () => {
      list.onaddtrack = prevAdd;
      list.onremovetrack = prevRemove;
    };
  }, [nowPlayingId]);

  // Video event listeners — set up once per item, read mutable state via refs
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function onTimeUpdate() {
      if (!video) return;
      const t = video.currentTime;
      setCurrentTime(t);

      if (!skipAdsRef.current) return;
      const blocks = adBlocksRef.current;
      const disabled = disabledBlocksRef.current;
      for (let i = 0; i < blocks.length; i++) {
        if (disabled.has(i)) continue;
        const [start, end] = blocks[i];
        if (t >= start && t < end) {
          isAutoSeekRef.current = true;
          video.currentTime = end;
          setSkipping(true);
          setTimeout(() => setSkipping(false), 1500);
          break;
        }
      }
    }

    function onLoadedMetadata() {
      if (video) setDuration(video.duration);
    }

    function onSeeked() {
      // Ignore programmatic auto-skips
      if (isAutoSeekRef.current) {
        isAutoSeekRef.current = false;
        return;
      }
      const t = video!.currentTime;
      const blocks = adBlocksRef.current;
      setDisabledBlocks((prev) => {
        const next = new Set(prev);
        blocks.forEach(([start, end], i) => {
          if (t < start - RE_ENABLE_BEFORE) {
            // Well before the block — re-enable auto-skip
            next.delete(i);
          } else if (t >= start - 5 && t <= end) {
            // Seeked into or just before the commercial zone — disable auto-skip
            next.add(i);
          }
        });
        return next;
      });
    }

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [nowPlayingId]);

  function skipBy(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
  }

  function setCaptionModeAndApply(mode: CaptionMode) {
    setCaptionMode(mode);
    const video = videoRef.current;
    if (!video) return;
    applyCaptionMode(video, mode);
  }

  async function copyPlaybackReport() {
    if (!nowPlayingId) return;
    const hls = hlsRef.current;
    const video = videoRef.current;
    const levelLines: string[] = [];
    let selectedLine = 'Selected level: n/a';
    let bandwidthLine = 'Estimated bandwidth: n/a';

    if (hls) {
      bandwidthLine = `Estimated bandwidth: ${formatBitrate(hls.bandwidthEstimate)}`;
      const selected = hls.currentLevel;
      selectedLine = `Selected level: ${selected >= 0 ? selected : 'auto'}`;

      hls.levels.forEach((level, idx) => {
        const levelDesc = [
          `${idx}:`,
          `${level.width || '?'}x${level.height || '?'}`,
          formatBitrate(level.bitrate),
          level.videoCodec ? `v=${level.videoCodec}` : '',
          level.audioCodec ? `a=${level.audioCodec}` : '',
        ].filter(Boolean).join(' ');
        levelLines.push(levelDesc);
      });

      if (selected >= 0 && selected < hls.levels.length) {
        const l = hls.levels[selected];
        selectedLine = `Selected level: ${selected} (${l.width || '?'}x${l.height || '?'} @ ${formatBitrate(l.bitrate)})`;
      }
    }

    const report = [
      'WinChannels Playback Report',
      `Time: ${new Date().toISOString()}`,
      `Title: ${nowPlayingTitle}`,
      `File ID: ${nowPlayingId}`,
      `Prefer remux: ${preferRemux ? 'on' : 'off'}`,
      `Manifest URL: ${activeManifestUrlRef.current || streamUrl(nowPlayingId)}`,
      `Video element: ${video?.videoWidth || '?'}x${video?.videoHeight || '?'}`,
      `Current time: ${Math.floor(currentTime)}s / ${Math.floor(duration)}s`,
      selectedLine,
      bandwidthLine,
      'Levels:',
      ...(levelLines.length > 0 ? levelLines : ['n/a']),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(report);
      setReportCopied(true);
      setTimeout(() => setReportCopied(false), 1800);
      console.info(report);
    } catch {
      console.info(report);
      setError('Could not copy report to clipboard. Report was printed to console.');
    }
  }

  if (!nowPlayingId) return null;

  return (
    <div className="video-overlay">
      <div className="video-header">
        <span className="video-title">{nowPlayingTitle}</span>
        <div className="video-header__controls">
          {(hasBroadcast || hasSrt) && (
            <label className="video-cc-wrap" title="Caption track selection">
              <span className="video-cc-label">CC</span>
              <select
                className="video-cc-select"
                value={captionMode}
                onChange={(e) => setCaptionModeAndApply(e.target.value as CaptionMode)}
              >
                <option value="off">Off</option>
                {hasBroadcast && <option value="broadcast">Broadcast</option>}
                {hasSrt && <option value="srt">Py-Captions (SRT)</option>}
              </select>
            </label>
          )}
          {adBlocks.length > 0 && (
            <button
              className={`video-skip-toggle ${skipAds ? 'video-skip-toggle--on' : ''}`}
              onClick={() => setSkipAds((v) => !v)}
              title={skipAds ? 'Commercial skipping ON — click to disable' : 'Commercial skipping OFF — click to enable'}
            >
              {skipAds ? '⏭ Skip Ads: On' : '⏭ Skip Ads: Off'}
            </button>
          )}
          <button className="video-jump-btn" onClick={() => skipBy(-SKIP_BACK)} title={`Back ${SKIP_BACK} seconds`}>
            ↺ {SKIP_BACK}s
          </button>
          <button className="video-jump-btn" onClick={() => skipBy(SKIP_FWD)} title={`Forward ${SKIP_FWD} seconds`}>
            {SKIP_FWD}s ↻
          </button>
          {diagnosticsEnabled && (
            <button className="video-report-btn" onClick={copyPlaybackReport} title="Copy playback diagnostics report">
              {reportCopied ? 'Copied' : 'Copy Report'}
            </button>
          )}
          <button className="video-close" onClick={stopPlayback} aria-label="Close player">
            ✕
          </button>
        </div>
      </div>

      {/* Commercial indicator bar */}
      {adBlocks.length > 0 && duration > 0 && (
        <div className="video-ad-bar" aria-label="Timeline with commercial markers">
          {adBlocks.map(([start, end], i) => (
            <div
              key={i}
              className={`video-ad-segment ${disabledBlocks.has(i) ? 'video-ad-segment--disabled' : ''}`}
              style={{
                left: `${(start / duration) * 100}%`,
                width: `${Math.max(0.4, ((end - start) / duration) * 100)}%`,
              }}
              title={disabledBlocks.has(i)
                ? `Commercial block ${i + 1} — auto-skip disabled (seeked manually)`
                : `Commercial block ${i + 1}`}
            />
          ))}
          <div
            className="video-ad-bar__playhead"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      )}

      {skipping && <div className="video-skip-toast">Skipping commercial…</div>}

      {error ? (
        <div className="video-error">
          <span className="video-error__icon">⚠</span>
          <p className="video-error__msg">{error}</p>
          <button className="video-error__close" onClick={stopPlayback}>Close</button>
        </div>
      ) : null}
      <video
        ref={videoRef}
        className="video-element"
        style={error ? { visibility: 'hidden' } : undefined}
        controls
        onEnded={stopPlayback}
      />
    </div>
  );
}
