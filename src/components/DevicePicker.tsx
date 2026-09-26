import { useEffect, useRef, useState } from 'react';
import { getDevices, type Device } from '../spotify/api';

export const BROWSER_DEVICE = 'browser';

interface Props {
  value: string;
  disabled?: boolean;
  /** Offer "This browser" (false on phones, where the Web Playback SDK doesn't run). */
  showBrowser: boolean;
  browserReady: boolean;
  browserError: string | null;
  browserDeviceId: string | null;
  onChange(deviceId: string, name: string): void;
}

export function DevicePicker({
  value,
  disabled,
  showBrowser,
  browserReady,
  browserError,
  browserDeviceId,
  onChange,
}: Props) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ value, disabled, showBrowser, browserError, onChange });
  latest.current = { value, disabled, showBrowser, browserError, onChange };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const found = (await getDevices()).filter((d) => d.id && d.id !== browserDeviceId && !d.is_restricted);
      setDevices(found);
      // Pick a device automatically when the current choice can't play: nothing chosen yet,
      // a device that went away, or "This browser" where the browser player can't run.
      const cur = latest.current;
      const browserUsable = cur.showBrowser && !cur.browserError;
      const valid = cur.value === BROWSER_DEVICE ? browserUsable : found.some((d) => d.id === cur.value);
      if (!valid && !cur.disabled) {
        const pick = found.find((d) => d.is_active) ?? found[0];
        if (pick?.id) cur.onChange(pick.id, pick.name);
        else if (browserUsable) cur.onChange(BROWSER_DEVICE, 'this browser');
        else cur.onChange('', '');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    void refreshRef.current();
  }, [browserDeviceId, browserError]);

  // Coming back from the Spotify app is the usual way a new device shows up.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !latest.current.disabled) void refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Play on</h2>
        <button type="button" className="ghost small" onClick={() => void refresh()} disabled={loading || disabled}>
          {loading ? 'Looking…' : 'Refresh'}
        </button>
      </div>
      <div className="devices">
        {showBrowser && (
          <label className={`device ${value === BROWSER_DEVICE ? 'on' : ''}`}>
            <input
              type="radio"
              name="device"
              checked={value === BROWSER_DEVICE}
              disabled={disabled}
              onChange={() => onChange(BROWSER_DEVICE, 'this browser')}
            />
            <span className="device-name">This browser</span>
            <span className="device-meta">{browserError ? 'unavailable' : browserReady ? 'ready' : 'connecting…'}</span>
          </label>
        )}
        {devices?.map((d) => (
          <label key={d.id} className={`device ${value === d.id ? 'on' : ''}`}>
            <input type="radio" name="device" checked={value === d.id} disabled={disabled} onChange={() => onChange(d.id!, d.name)} />
            <span className="device-name">{d.name}</span>
            <span className="device-meta">
              {d.type.toLowerCase()}
              {d.is_active ? ' · active' : ''}
            </span>
          </label>
        ))}
        {!showBrowser && devices?.length === 0 && (
          <p className="empty">
            No Spotify devices found. Open the <strong>Spotify app</strong> on this phone (play and pause any song so
            it wakes up), then come back here.
          </p>
        )}
      </div>
      {browserError && showBrowser && value === BROWSER_DEVICE && <p className="error">{browserError}</p>}
      {error && <p className="error">{error}</p>}
      <p className="hint">
        {showBrowser
          ? "Don't see your phone or speaker? Open Spotify on it, then hit Refresh."
          : 'Phones play through the Spotify app; this page is the remote. Keep this page open while it runs.'}
      </p>
    </section>
  );
}
