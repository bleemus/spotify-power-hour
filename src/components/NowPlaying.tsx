import type { SessionView } from '../engine/session';

interface Props {
  view: SessionView;
  onPause(): void;
  onResume(): void;
  onSkip(): void;
  onStop(): void;
  onReset(): void;
}

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const STATUS_TEXT: Record<SessionView['status'], string> = {
  idle: '',
  starting: 'Starting…',
  playing: '',
  paused: 'Paused',
  cue: "Time's up!",
  done: 'Done!',
  error: 'Stopped',
};

export function NowPlaying({ view, onPause, onResume, onSkip, onStop, onReset }: Props) {
  const { track, segment } = view;
  const progress = segment && segment.playMs > 0 ? 1 - view.remainingMs / segment.playMs : 0;
  const finished = view.status === 'done' || view.status === 'error';

  return (
    <section className={`now ${view.status}`}>
      <div className="round">
        <span className="round-n">{view.round}</span>
        <span className="round-of">of {view.total}</span>
      </div>

      {track && (
        <div className="track">
          {track.imageUrl ? <img src={track.imageUrl} alt="" /> : <div className="art-blank" />}
          <div className="track-text">
            <div className="track-name">{track.name}</div>
            <div className="track-artist">{track.artists}</div>
            {segment && (
              <div className="track-seg">
                from {fmt(segment.startMs)} for {Math.round(segment.playMs / 1000)}s
              </div>
            )}
          </div>
        </div>
      )}

      <div className="clock" aria-live="polite">
        {finished ? STATUS_TEXT[view.status] : view.status === 'playing' ? fmt(view.remainingMs) : STATUS_TEXT[view.status]}
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />
      </div>

      {view.message && <p className={view.status === 'error' ? 'error' : 'hint'}>{view.message}</p>}
      {view.skipped > 0 && (
        <p className="hint">
          Skipped {view.skipped} unplayable song{view.skipped === 1 ? '' : 's'}
        </p>
      )}

      <div className="controls">
        {finished ? (
          <button type="button" className="primary" onClick={onReset}>
            Back to setup
          </button>
        ) : (
          <>
            {view.status === 'paused' ? (
              <button type="button" className="primary" onClick={onResume}>
                Resume
              </button>
            ) : (
              <button type="button" className="primary" onClick={onPause} disabled={view.status !== 'playing'}>
                Pause
              </button>
            )}
            <button type="button" className="ghost" onClick={onSkip}>
              Skip
            </button>
            <button type="button" className="ghost" onClick={onStop}>
              Stop
            </button>
          </>
        )}
      </div>
    </section>
  );
}
