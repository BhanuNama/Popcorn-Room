import { computeOffset, type ClockSample } from '@popcorn/shared';
import { api } from './api';

/**
 * NTP-style clock offset against the API server.
 * serverNow() = Date.now() + offset
 */
class ServerClock {
  offsetMs = 0;
  rttMs = Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;

  async sync(samples = 8) {
    const got: ClockSample[] = [];
    for (let i = 0; i < samples; i++) {
      try {
        const t0 = Date.now();
        const { t } = await api.time();
        const t1 = Date.now();
        got.push({ t0, ts: t, t1 });
      } catch {
        /* ignore a failed sample */
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    if (got.length) {
      const r = computeOffset(got);
      // Only accept a new estimate if it is at least as good, or the old one is stale.
      if (r.rttMs <= this.rttMs * 1.5 || !isFinite(this.rttMs)) {
        this.offsetMs = r.offsetMs;
        this.rttMs = r.rttMs;
      }
    }
    return { offsetMs: this.offsetMs, rttMs: this.rttMs };
  }

  start() {
    if (this.timer) return;
    void this.sync();
    this.timer = setInterval(() => {
      this.rttMs = Infinity; // allow re-estimation
      void this.sync(5);
    }, 60_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  now() {
    return Date.now() + this.offsetMs;
  }
}

export const clock = new ServerClock();
