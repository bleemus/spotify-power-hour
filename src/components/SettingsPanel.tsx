import type { Settings } from '../engine/settings';
import { RangeField } from './RangeField';
import { SoundField } from './SoundField';

interface Props {
  value: Settings;
  disabled?: boolean;
  errors: string[];
  onChange(value: Settings): void;
}

export function SettingsPanel({ value, disabled, errors, onChange }: Props) {
  return (
    <section className="panel">
      <h2>Rules</h2>
      <RangeField
        label="Start at"
        hint="Seconds into each song. Pulled earlier if the song would end first."
        value={value.start}
        disabled={disabled}
        onChange={(start) => onChange({ ...value, start })}
      />
      <RangeField
        label="Play for"
        hint="Seconds of each song before moving on."
        value={value.length}
        disabled={disabled}
        onChange={(length) => onChange({ ...value, length })}
      />
      <fieldset className="field" disabled={disabled}>
        <legend>Songs</legend>
        <div className="field-row wrap">
          <label className="num">
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(value.roundLimit) ? value.roundLimit : ''}
              onChange={(e) => onChange({ ...value, roundLimit: e.target.value === '' ? NaN : Number(e.target.value) })}
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={value.shuffle} onChange={(e) => onChange({ ...value, shuffle: e.target.checked })} />
            <span>Shuffle</span>
          </label>
        </div>
        <p className="hint">How many songs to play (0 = the whole playlist).</p>
      </fieldset>
      <SoundField value={value.sound} disabled={disabled} onChange={(sound) => onChange({ ...value, sound })} />
      {errors.length > 0 && (
        <ul className="error">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
