import type { Playlist } from '../spotify/api';

export const LIKED_SONGS = 'liked';

interface Props {
  playlists: Playlist[] | null;
  likedCount: number | null;
  value: string | null;
  disabled?: boolean;
  onChange(id: string): void;
}

export function PlaylistPicker({ playlists, likedCount, value, disabled, onChange }: Props) {
  const readable = playlists?.filter((p) => p.readable) ?? [];
  const locked = playlists?.filter((p) => !p.readable) ?? [];

  return (
    <section className="panel">
      <h2>Playlist</h2>
      {!playlists ? (
        <p className="hint">Loading your playlists…</p>
      ) : (
        <div className="playlists">
          <button
            type="button"
            className={`playlist ${value === LIKED_SONGS ? 'on' : ''}`}
            disabled={disabled}
            onClick={() => onChange(LIKED_SONGS)}
          >
            <span className="cover liked">♥</span>
            <span className="pl-name">Liked Songs</span>
            <span className="pl-meta">{likedCount ?? '…'} songs</span>
          </button>
          {readable.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`playlist ${value === p.id ? 'on' : ''}`}
              disabled={disabled}
              onClick={() => onChange(p.id)}
            >
              {p.imageUrl ? <img className="cover" src={p.imageUrl} alt="" loading="lazy" /> : <span className="cover" />}
              <span className="pl-name">{p.name}</span>
              <span className="pl-meta">{p.total ?? '?'} songs</span>
            </button>
          ))}
        </div>
      )}
      {locked.length > 0 && (
        <details className="locked">
          <summary>
            {locked.length} followed playlist{locked.length === 1 ? '' : 's'} can't be played
          </summary>
          <p className="hint">
            Spotify only lets apps like this read playlists you own or collaborate on. To use one of these, open it
            in Spotify and choose “Add to other playlist” → “New playlist”, then reload this page.
          </p>
          <ul>
            {locked.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
