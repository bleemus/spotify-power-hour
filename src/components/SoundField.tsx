import { useState } from 'react';
import type { SoundKind, SoundSettings } from '../engine/settings';
import {
  clearCustomSound,
  loadCustomSound,
  playCue,
  saveCustomSound,
  SOUND_LABELS,
  unlockAudio,
  type CustomSound,
} from '../engine/sounds';

interface Props {
  value: SoundSettings;
  disabled?: boolean;
  onChange(value: SoundSettings): void;
}

export function SoundField({ value, disabled, onChange }: Props) {
  const [custom, setCustom] = useState<CustomSound | null>(loadCustomSound);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setCustom(await saveCustomSound(file));
      onChange({ ...value, kind: 'custom', enabled: true });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <fieldset className="field" disabled={disabled}>
      <legend>Sound between songs</legend>
      <div className="field-row">
        <label className="toggle">
          <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
          <span>Play a sound when time's up</span>
        </label>
      </div>
      {value.enabled && (
        <>
          <div className="field-row wrap">
            <select value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as SoundKind })}>
              {(Object.keys(SOUND_LABELS) as SoundKind[])
                .filter((k) => k !== 'custom' || custom)
                .map((k) => (
                  <option key={k} value={k}>
                    {k === 'custom' && custom ? custom.name : SOUND_LABELS[k]}
                  </option>
                ))}
            </select>
            <label className="volume">
              <span>Vol</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={value.volume}
                onChange={(e) => onChange({ ...value, volume: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              className="ghost small"
              onClick={() => {
                unlockAudio();
                void playCue(value);
              }}
            >
              ▶ Test
            </button>
          </div>
          <div className="field-row wrap">
            <label className="ghost small file">
              Upload sound…
              <input type="file" accept="audio/*" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
            {custom && (
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  clearCustomSound();
                  setCustom(null);
                  if (value.kind === 'custom') onChange({ ...value, kind: 'beep' });
                }}
              >
                Remove {custom.name}
              </button>
            )}
          </div>
          <p className="hint">Spotify pauses, the sound plays, then the next song starts. Files up to 1.5 MB, stored in this browser.</p>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </fieldset>
  );
}
