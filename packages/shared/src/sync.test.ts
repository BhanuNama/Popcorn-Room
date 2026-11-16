import { describe, expect, it } from 'vitest';
import {
  computeOffset,
  decideDrift,
  expectedPosition,
  msUntilStart,
  parseYouTubeId,
  parseYouTubeStart,
  sortQueue,
  type SyncState,
} from './index';

const base: SyncState = { videoId: 'abc', status: 'playing', position: 10, rate: 1, serverTime: 1_000_000, version: 1 };

describe('expectedPosition', () => {
  it('holds position when paused', () => {
    expect(expectedPosition({ ...base, status: 'paused' }, 0, 2_000_000)).toBe(10);
  });
  it('advances with server time and offset', () => {
    // client clock is 500ms behind server => offset +500
    expect(expectedPosition(base, 500, 1_004_500)).toBeCloseTo(15);
  });
  it('respects playback rate', () => {
    expect(expectedPosition({ ...base, rate: 2 }, 0, 1_003_000)).toBeCloseTo(16);
  });
  it('holds during a scheduled countdown start', () => {
    expect(expectedPosition(base, 0, 997_000)).toBe(10);
    expect(msUntilStart(base, 0, 997_000)).toBe(3000);
  });
});

describe('decideDrift', () => {
  const now = 1_010_000; // expected = 20
  it('does nothing under 0.8s', () => {
    expect(decideDrift(20.4, 1, base, 0, now).kind).toBe('none');
  });
  it('slows down when ahead 0.8..2.5s', () => {
    const a = decideDrift(21.2, 1, base, 0, now);
    expect(a).toMatchObject({ kind: 'rate', rate: 0.96 });
  });
  it('speeds up when behind 0.8..2.5s', () => {
    const a = decideDrift(18.8, 1, base, 0, now);
    expect(a).toMatchObject({ kind: 'rate', rate: 1.04 });
  });
  it('hard seeks over 2.5s', () => {
    const a = decideDrift(25, 1, base, 0, now);
    expect(a.kind).toBe('seek');
    if (a.kind === 'seek') expect(a.to).toBeCloseTo(20);
  });
  it('restores rate once caught up', () => {
    expect(decideDrift(20.1, 1.04, base, 0, now)).toMatchObject({ kind: 'restoreRate', rate: 1 });
  });
});

describe('computeOffset', () => {
  it('picks the lowest round trip sample', () => {
    const r = computeOffset([
      { t0: 0, ts: 1300, t1: 400 }, // rtt 400
      { t0: 1000, ts: 2050, t1: 1100 }, // rtt 100, offset = 2050 - 1050 = 1000
      { t0: 2000, ts: 3200, t1: 2300 },
    ]);
    expect(r.rttMs).toBe(100);
    expect(r.offsetMs).toBe(1000);
  });
});

describe('youtube parsing', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
    ['youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://example.com/watch?v=dQw4w9WgXcQ', null],
  ])('%s', (url, id) => expect(parseYouTubeId(url)).toBe(id));
  it('parses start times', () => {
    expect(parseYouTubeStart('https://youtu.be/x?t=1m30s')).toBe(90);
    expect(parseYouTubeStart('https://youtu.be/x?t=42')).toBe(42);
  });
});

describe('queue', () => {
  it('sorts by votes then age', () => {
    const mk = (id: string, votes: number, addedAt: number) => ({
      id, videoId: id, title: id, addedBy: 'a', addedByName: 'a', votes: Array(votes).fill('x'), addedAt,
    });
    expect(sortQueue([mk('a', 0, 1), mk('b', 2, 2), mk('c', 2, 0)]).map((q) => q.id)).toEqual(['c', 'b', 'a']);
  });
});
