/** A time in whole seconds: either fixed or rolled fresh for each song within [min, max]. */
export interface Range {
  random: boolean;
  fixed: number;
  min: number;
  max: number;
}

export type SoundKind = 'beep' | 'triple' | 'horn' | 'custom';

export interface SoundSettings {
  enabled: boolean;
  kind: SoundKind;
  /** 0..1 */
  volume: number;
}

export interface Settings {
  start: Range;
  length: Range;
  shuffle: boolean;
  /** Number of songs to play; 0 = the whole playlist. */
  roundLimit: number;
  sound: SoundSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  start: { random: false, fixed: 30, min: 15, max: 60 },
  length: { random: false, fixed: 60, min: 30, max: 90 },
  shuffle: true,
  roundLimit: 60,
  sound: { enabled: false, kind: 'beep', volume: 0.8 },
};

export const MAX_SECONDS = 3600;

export function validateRange(r: Range, label: string): string | null {
  const bad = (n: number) => !Number.isFinite(n) || n < 0 || n > MAX_SECONDS;
  if (r.random) {
    if (bad(r.min) || bad(r.max)) return `${label}: enter values between 0 and ${MAX_SECONDS} seconds`;
    if (r.min > r.max) return `${label}: min must be ≤ max`;
  } else if (bad(r.fixed)) {
    return `${label}: enter a value between 0 and ${MAX_SECONDS} seconds`;
  }
  return null;
}

export function validateSettings(s: Settings): string[] {
  const errors = [validateRange(s.start, 'Start at'), validateRange(s.length, 'Play for')].filter(
    (e): e is string => e !== null,
  );
  const lengthFloor = s.length.random ? s.length.min : s.length.fixed;
  if (!errors.length && lengthFloor < 1) errors.push('Play for: must be at least 1 second');
  if (!Number.isInteger(s.roundLimit) || s.roundLimit < 0) errors.push('Songs: enter 0 (all) or a positive number');
  return errors;
}

const KEY = 'ph.settings';

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      start: { ...DEFAULT_SETTINGS.start, ...raw.start },
      length: { ...DEFAULT_SETTINGS.length, ...raw.length },
      sound: { ...DEFAULT_SETTINGS.sound, ...raw.sound },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable; settings just won't persist
  }
}
