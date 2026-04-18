import { getServerUrl } from '../api/client';
import { useStore } from '../store/useStore';
import './MediaCard.css';

interface MediaCardProps {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  duration: number;
  watched: boolean;
  playbackTime?: number;
  badge?: string;
  commercials?: number[];
  filePath?: string;
  recordedAt?: number;
  recordedAtFormat?: 'time' | 'datetime';
  onClick?: () => void;
  selected?: boolean;
  ariaLabel?: string;
  onPlayAction?: () => void;
  playActionLabel?: string;
  onToggleWatched?: () => void;
  watchedActionLabel?: string;
  watchedActionBusy?: boolean;
  recordingKind?: 'episode' | 'movie' | null;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

export default function MediaCard({
  id,
  title,
  subtitle,
  imageUrl,
  thumbnailUrl,
  duration,
  watched,
  playbackTime = 0,
  badge,
  commercials,
  filePath,
  recordedAt,
  recordedAtFormat = 'time',
  onClick,
  selected = false,
  ariaLabel,
  onPlayAction,
  playActionLabel = 'Play',
  onToggleWatched,
  watchedActionLabel,
  watchedActionBusy = false,
  recordingKind = null,
}: MediaCardProps) {
  const { playItem } = useStore();
  const serverUrl = getServerUrl();

  // Resolve relative thumbnail URLs against the server
  const resolvedThumb =
    thumbnailUrl?.startsWith('http') ? thumbnailUrl
    : thumbnailUrl ? `${serverUrl}${thumbnailUrl}`
    : imageUrl ?? null;

  const progress = duration > 0 ? Math.min((playbackTime / duration) * 100, 100) : 0;
  const label = subtitle ? `${title} – ${subtitle}` : title;
  const handleClick = onClick ?? (() => playItem(id, label, filePath, commercials, '', playbackTime, recordingKind));
  const resolvedAriaLabel = ariaLabel ?? (onClick ? `Select ${label}` : `Play ${label}`);
  const toggleLabel = watchedActionLabel ?? (watched ? 'Mark unwatched' : 'Mark watched');

  return (
    <button
      className={`media-card ${watched ? 'media-card--watched' : ''} ${selected ? 'media-card--selected' : ''}`}
      onClick={handleClick}
      aria-label={resolvedAriaLabel}
    >
      <div className="media-card__art">
        {resolvedThumb ? (
          <img src={resolvedThumb} alt="" draggable={false} />
        ) : (
          <div className="media-card__art-placeholder">▶</div>
        )}
        {onPlayAction && (
          <button
            className="media-card__play-action"
            onClick={(e) => {
              e.stopPropagation();
              onPlayAction();
            }}
            aria-label={`${playActionLabel} ${label}`}
            title={playActionLabel}
          >
            ▶
          </button>
        )}
        {onToggleWatched && (
          <button
            className="media-card__watch-action"
            onClick={(e) => {
              e.stopPropagation();
              if (!watchedActionBusy) onToggleWatched();
            }}
            aria-label={`${toggleLabel} ${label}`}
            title={toggleLabel}
            disabled={watchedActionBusy}
          >
            {watchedActionBusy ? '…' : (watched ? '↺' : '✓')}
          </button>
        )}
        {badge && <span className="media-card__badge">{badge}</span>}
        {watched && !onToggleWatched && <span className="media-card__watched-dot" aria-label="Watched" />}
      </div>

      <div className="media-card__info">
        <span className="media-card__title">{title}</span>
        {subtitle && <span className="media-card__subtitle">{subtitle}</span>}
        <span className="media-card__duration">{formatDuration(duration)}</span>
        {recordedAt != null && (
          <span className="media-card__time">
            {recordedAtFormat === 'datetime' ? formatDateTime(recordedAt) : formatTime(recordedAt)}
          </span>
        )}
      </div>

      {progress > 0 && !watched && (
        <div className="media-card__progress">
          <div className="media-card__progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </button>
  );
}
