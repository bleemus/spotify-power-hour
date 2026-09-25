import type { Range, Settings } from './settings';

export type Rng = () => number;

export interface Segment {
  startMs: number;
  playMs: number;
}

/** Whole seconds from a range, inclusive of both ends; never negative. */
export function pickSeconds(r: Range, rng: Rng): number {
  if (!r.random) return Math.max(0, Math.round(r.fixed));
  const lo = Math.max(0, Math.round(Math.min(r.min, r.max)));
  const hi = Math.max(0, Math.round(Math.max(r.min, r.max)));
  return Math.min(hi, lo + Math.floor(rng() * (hi - lo + 1)));
}

/**
 * Where to start in a track and how long to play it.
 * The start is pulled earlier when needed so the clip never runs past the end;
 * tracks shorter than the play length play from the top to the end.
 */
export function computeSegment(settings: Pick<Settings, 'start' | 'length'>, durationMs: number, rng: Rng): Segment {
  const playMs = Math.max(1, pickSeconds(settings.length, rng)) * 1000;
  const startMs = pickSeconds(settings.start, rng) * 1000;
  if (durationMs <= playMs) return { startMs: 0, playMs: Math.max(0, durationMs) };
  return { startMs: Math.min(startMs, durationMs - playMs), playMs };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
