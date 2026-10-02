import { describe, expect, it } from 'vitest';
import { createTrack, sampleTrack, updateTrack, type Track } from '@/components/map/crewMotion';

// A remote rider weaving at 20–60 m/s (with a stop), heartbeats every
// 1.25 s ± jitter, fixes 0.1–0.7 s stale, 6% lost. Compares what other
// players see — the old per-frame lerp toward the last fix vs dead
// reckoning — against where the rider really is.

const FPS = 60;
const DT = 1 / FPS;
const DURATION = 120;
const HEARTBEAT_S = 1.25;

function simulate() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const truth: { x: number; y: number; h: number; v: number; w: number }[] = [];
  let x = 0, y = 0, h = 0;
  for (let f = 0; f <= DURATION * FPS; f++) {
    const t = f * DT;
    const v = t > 70 && t < 78 ? 0 : 40 + 20 * Math.sin(t * 0.37);
    const w = 0.9 * Math.sin(t * 0.55) + 0.5 * Math.sin(t * 1.7);
    h += w * DT; x += Math.sin(h) * v * DT; y += Math.cos(h) * v * DT;
    truth.push({ x, y, h, v, w });
  }
  const packets: { at: number; fixF: number }[] = [];
  for (let t = 1; t < DURATION; t += HEARTBEAT_S + (rnd() - 0.5) * 0.4) {
    if (rnd() < 0.06) continue;
    packets.push({ at: t, fixF: Math.round((t - (0.1 + rnd() * 0.6)) * FPS) });
  }
  return { truth, packets };
}

function measure(kind: 'old' | 'new') {
  const { truth, packets } = simulate();
  let pi = 0;
  let tr: Track | null = null;
  let cur: { x: number; y: number } | null = null;
  let target: { x: number; y: number } | null = null;
  const out: ({ x: number; y: number } | null)[] = [];
  for (let f = 0; f <= DURATION * FPS; f++) {
    const t = f * DT;
    while (pi < packets.length && packets[pi].at <= t) {
      const fx = truth[packets[pi].fixF];
      if (kind === 'new') {
        const s = { x: fx.x, y: fx.y, heading: fx.h, speed: fx.v, turn: fx.w, ageS: t - packets[pi].fixF * DT };
        if (!tr) tr = createTrack(s, t); else updateTrack(tr, s, t);
      } else {
        target = { x: fx.x, y: fx.y };
        if (!cur) cur = { ...target };
      }
      pi++;
    }
    if (kind === 'new') out.push(tr ? sampleTrack(tr, t) : null);
    else {
      if (cur && target) {
        const gap = Math.hypot(target.x - cur.x, target.y - cur.y);
        if (gap > 400) cur = { ...target };
        else if (gap > 0.5) { cur.x += (target.x - cur.x) * 0.09; cur.y += (target.y - cur.y) * 0.09; }
      }
      out.push(cur ? { ...cur } : null);
    }
  }
  let err = 0, n = 0, accSq = 0, stall = 0, moving = 0;
  for (let f = 2; f < out.length; f++) {
    const [a, b, c] = [out[f], out[f - 1], out[f - 2]];
    if (!a || !b || !c) continue;
    err += Math.hypot(a.x - truth[f].x, a.y - truth[f].y);
    const ax = (a.x - 2 * b.x + c.x) / (DT * DT);
    const ay = (a.y - 2 * b.y + c.y) / (DT * DT);
    accSq += ax * ax + ay * ay;
    n++;
    if (truth[f].v > 5) {
      moving++;
      if (Math.hypot(a.x - b.x, a.y - b.y) / DT < truth[f].v * 0.25) stall++;
    }
  }
  return { meanErr: err / n, accRms: Math.sqrt(accSq / n), stallPct: (stall / moving) * 100 };
}

describe('remote rider dead reckoning', () => {
  const before = measure('old');
  const after = measure('new');

  it('keeps riders moving between heartbeats', () => {
    expect(after.stallPct).toBeLessThan(3);
    expect(after.stallPct).toBeLessThan(before.stallPct / 10);
  });

  it('is far smoother than the old lerp', () => {
    expect(after.accRms).toBeLessThan(before.accRms / 5);
  });

  it('tracks the true position closely', () => {
    expect(after.meanErr).toBeLessThan(30);
    expect(after.meanErr).toBeLessThan(before.meanErr);
  });
});
