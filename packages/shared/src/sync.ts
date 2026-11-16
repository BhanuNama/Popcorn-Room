/**
 * YouTube sync algorithm (blueprint section 6).
 *
 * All times in a SyncState are in *server* clock. Each client keeps an
 * `offsetMs` such that `serverNow = Date.now() + offsetMs`.
 */

export type PlaybackStatus = 'playing' | 'paused' | 'buffering';

export interface SyncState {
  videoId: string | null;
  status: PlaybackStatus;
  /** Position in seconds at `serverTime`. */
  position: number;
  rate: number;
  /** Server timestamp (ms) at which `position` was true. May be in the future (countdown). */
  serverTime: number;
  /** Monotonic version so late/duplicate messages are ignored. */
  version: number;
  /** Identity of whoever made the change. */
  by?: string;
}

export const EMPTY_SYNC: SyncState = {
  videoId: null,
  status: 'paused',
  position: 0,
  rate: 1,
  serverTime: 0,
  version: 0,
};

export const DRIFT = {
  /** Under this: do nothing (prevents rapid rate-nudging pitch warble/distortion). */
  ok: 0.8,
  /** Over this: hard seek. Between ok and seek: nudge rate gently. */
  seek: 2.5,
  nudgeSlow: 0.96,
  nudgeFast: 1.04,
  intervalMs: 2000,
  /** While nudging we re-check faster so we stop nudging in time. */
  nudgeIntervalMs: 500,
} as const;

export function expectedPosition(s: SyncState, offsetMs: number, now = Date.now()): number {
  if (s.status !== 'playing') return s.position;
  const elapsed = (now + offsetMs - s.serverTime) / 1000;
  // Negative elapsed = scheduled start (3-2-1 countdown): hold at position.
  return s.position + Math.max(0, elapsed) * s.rate;
}

/** ms until a scheduled play begins (0 if already started or not playing). */
export function msUntilStart(s: SyncState, offsetMs: number, now = Date.now()): number {
  if (s.status !== 'playing') return 0;
  return Math.max(0, s.serverTime - (now + offsetMs));
}

export type DriftAction =
  | { kind: 'none'; drift: number }
  | { kind: 'seek'; to: number; drift: number }
  | { kind: 'rate'; rate: number; drift: number }
  | { kind: 'restoreRate'; rate: number; drift: number };

/**
 * Decide how to correct drift. Pure, so it can be unit tested.
 * @param current player's current time (s)
 * @param currentRate player's current playback rate
 */
export function decideDrift(
  current: number,
  currentRate: number,
  s: SyncState,
  offsetMs: number,
  now = Date.now(),
): DriftAction {
  const expected = expectedPosition(s, offsetMs, now);
  const drift = current - expected;
  const abs = Math.abs(drift);
  if (abs > DRIFT.seek) return { kind: 'seek', to: expected, drift };
  if (abs > DRIFT.ok) {
    const base = s.rate;
    return { kind: 'rate', rate: drift > 0 ? base * DRIFT.nudgeSlow : base * DRIFT.nudgeFast, drift };
  }
  if (Math.abs(currentRate - s.rate) > 1e-3) return { kind: 'restoreRate', rate: s.rate, drift };
  return { kind: 'none', drift };
}

/* ---------------- NTP-style clock offset ---------------- */

export interface ClockSample {
  /** client send time */
  t0: number;
  /** server time */
  ts: number;
  /** client receive time */
  t1: number;
}

/**
 * Keep the sample with the lowest round trip and compute
 * offset = serverTime - midpoint(client send, client receive).
 */
export function computeOffset(samples: ClockSample[]): { offsetMs: number; rttMs: number } {
  if (!samples.length) return { offsetMs: 0, rttMs: Infinity };
  let best = samples[0];
  for (const s of samples) if (s.t1 - s.t0 < best.t1 - best.t0) best = s;
  const rtt = best.t1 - best.t0;
  return { offsetMs: best.ts - (best.t0 + rtt / 2), rttMs: rtt };
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}
