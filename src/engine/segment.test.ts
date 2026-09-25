import { describe, expect, it } from 'vitest';
import { computeSegment, pickSeconds, shuffle } from './segment';
import type { Range } from './settings';

const fixed = (n: number): Range => ({ random: false, fixed: n, min: 0, max: 0 });
const random = (min: number, max: number): Range => ({ random: true, fixed: 0, min, max });
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('pickSeconds', () => {
  it('returns the fixed value', () => expect(pickSeconds(fixed(45), Math.random)).toBe(45));
  it('clamps negatives to 0', () => expect(pickSeconds(fixed(-5), Math.random)).toBe(0));
  it('covers both ends of a random range', () => {
    expect(pickSeconds(random(10, 20), () => 0)).toBe(10);
    expect(pickSeconds(random(10, 20), () => 0.999999)).toBe(20);
  });
  it('tolerates an inverted range', () => expect(pickSeconds(random(20, 10), () => 0)).toBe(10));
  it('handles min === max', () => expect(pickSeconds(random(7, 7), () => 0.5)).toBe(7));
});

describe('computeSegment', () => {
  const settings = (start: Range, length: Range) => ({ start, length });

  it('uses fixed start and length', () => {
    expect(computeSegment(settings(fixed(30), fixed(60)), 200_000, Math.random)).toEqual({ startMs: 30_000, playMs: 60_000 });
  });

  it('pulls the start earlier so the clip ends with the track', () => {
    expect(computeSegment(settings(fixed(170), fixed(60)), 200_000, Math.random)).toEqual({ startMs: 140_000, playMs: 60_000 });
  });

  it('plays short tracks from the top to the end', () => {
    expect(computeSegment(settings(fixed(30), fixed(60)), 45_000, Math.random)).toEqual({ startMs: 0, playMs: 45_000 });
  });

  it('rolls both random ranges independently', () => {
    // length rolls first, then start
    const seg = computeSegment(settings(random(10, 20), random(30, 40)), 300_000, seq(0, 0.999999));
    expect(seg).toEqual({ startMs: 20_000, playMs: 30_000 });
  });

  it('never plays for less than a second', () => {
    expect(computeSegment(settings(fixed(0), fixed(0)), 300_000, Math.random).playMs).toBe(1000);
  });

  it('keeps random results inside the range across many rolls', () => {
    for (let i = 0; i < 500; i++) {
      const { startMs, playMs } = computeSegment(settings(random(15, 60), random(30, 90)), 240_000, Math.random);
      expect(playMs).toBeGreaterThanOrEqual(30_000);
      expect(playMs).toBeLessThanOrEqual(90_000);
      expect(startMs).toBeGreaterThanOrEqual(0);
      expect(startMs).toBeLessThanOrEqual(60_000);
      expect(startMs + playMs).toBeLessThanOrEqual(240_000);
    }
  });
});

describe('shuffle', () => {
  it('keeps every item and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, Math.random);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});
