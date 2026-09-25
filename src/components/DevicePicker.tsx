import { useEffect, useState } from 'react';
import { getDevices, type Device } from '../spotify/api';

export const BROWSER_DEVICE = 'browser';

interface Props {
  value: string;
  disabled?: boolean;
  browserReady: boolean;
  browserError: string | null;
  browserDeviceId: string | null;
  onChange(deviceId: string): void;
}

export function DevicePicker({ value, disabled, browserReady, browserError, browserDeviceId, onChange }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setDevices((await getDevices()).filter((d) => d.id && d.id !== browserDeviceId && !d.is_restricted));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [browserDeviceId]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Play on</h2>
        <button type="button" className="ghost small" onClick={() => void refresh()} disabled={loading || disabled}>
          {loading ? 'Looking…' : 'Refresh'}
        </button>
      </div>
      <div className="devices">
        <label className={`device ${value === BROWSER_DEVICE ? 'on' : ''}`}>
          <input
            type="radio"
            name="device"
            checked={value === BROWSER_DEVICE}
            disabled={disabled}
            onChange={() => onChange(BROWSER_DEVICE)}
          />
          <span className="device-name">This browser</span>
          <span className="device-meta">{browserError ? 'unavailable' : browserReady ? 'ready' : 'connecting…'}</span>
        </label>
        {devices.map((d) => (
          <label key={d.id} className={`device ${value === d.id ? 'on' : ''}`}>
            <input type="radio" name="device" checked={value === d.id} disabled={disabled} onChange={() => onChange(d.id!)} />
            <span className="device-name">{d.name}</span>
            <span className="device-meta">
              {d.type.toLowerCase()}
              {d.is_active ? ' · active' : ''}
            </span>
          </label>
        ))}
      </div>
      {browserError && value === BROWSER_DEVICE && <p className="error">{browserError}</p>}
      {error && <p className="error">{error}</p>}
      <p className="hint">Don't see your phone or speaker? Open Spotify on it, then hit Refresh.</p>
    </section>
  );
}
