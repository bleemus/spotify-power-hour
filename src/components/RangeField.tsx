import type { Range } from '../engine/settings';

interface Props {
  label: string;
  hint: string;
  value: Range;
  disabled?: boolean;
  onChange(value: Range): void;
}

function NumberInput(props: { value: number; label: string; disabled?: boolean; onChange(n: number): void }) {
  return (
    <label className="num">
      <span>{props.label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={3600}
        step={1}
        value={Number.isFinite(props.value) ? props.value : ''}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      <span className="unit">s</span>
    </label>
  );
}

export function RangeField({ label, hint, value, disabled, onChange }: Props) {
  return (
    <fieldset className="field" disabled={disabled}>
      <legend>{label}</legend>
      <div className="field-row">
        {value.random ? (
          <>
            <NumberInput label="min" value={value.min} onChange={(min) => onChange({ ...value, min })} />
            <span className="dash">–</span>
            <NumberInput label="max" value={value.max} onChange={(max) => onChange({ ...value, max })} />
          </>
        ) : (
          <NumberInput label="" value={value.fixed} onChange={(fixed) => onChange({ ...value, fixed })} />
        )}
        <label className="toggle">
          <input type="checkbox" checked={value.random} onChange={(e) => onChange({ ...value, random: e.target.checked })} />
          <span>Randomize</span>
        </label>
      </div>
      <p className="hint">{value.random ? `A new random value each song. ${hint}` : hint}</p>
    </fieldset>
  );
}
