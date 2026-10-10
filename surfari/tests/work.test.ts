import { describe, expect, it } from 'vitest';
import { PLACES, findJob, placeAt, distanceM, placeById } from '@/lib/game/places';
import { WORK, cooldownLeft, doTask, fullPay, newShift, payout, perfMultiplier, rankFor, rankTitle, stage, type Shift } from '@/lib/game/work';

const { job } = findJob('machinga')!; // 120 s shift, 140 pay
const T0 = 1_000_000;
const at = (f: number) => T0 + f * job.shiftS * 1000; // a moment in the shift

describe('places', () => {
  it('every place and job id is unique', () => {
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const jobs = PLACES.flatMap((p) => p.jobs.map((j) => j.id));
    expect(new Set(jobs).size).toBe(jobs.length);
  });

  it('places sit in Dar es Salaam', () => {
    for (const p of PLACES) {
      expect(p.lat).toBeGreaterThan(-6.95);
      expect(p.lat).toBeLessThan(-6.6);
      expect(p.lng).toBeGreaterThan(39.1);
      expect(p.lng).toBeLessThan(39.35);
    }
  });

  it('knows where you are standing', () => {
    const k = placeById.kariakoo;
    expect(placeAt({ lat: k.lat + 0.0005, lng: k.lng })?.id).toBe('kariakoo'); // ~55 m away
    expect(placeAt({ lat: k.lat + 0.01, lng: k.lng })).toBeNull();             // ~1.1 km away
    expect(distanceM(k, placeById.posta)).toBeGreaterThan(1000);
  });
});

describe('shifts', () => {
  it('moves through the stages on the clock', () => {
    const s = newShift(job, T0);
    expect(stage(s, at(0))).toBe(0);
    expect(stage(s, at(0.1))).toBe(1);
    expect(stage(s, at(0.5))).toBe(2);
    expect(stage(s, at(0.95))).toBe(3);
  });

  it('only lets you do tasks while on the job', () => {
    const s = newShift(job, T0);
    expect(doTask(s, 'kazi', at(0.03))).toBe('not_on_the_job');
    expect(doTask(s, 'kazi', at(0.95))).toBe('not_on_the_job');
    expect(doTask(s, 'kazi', at(1.01))).toBe('shift_over');
    const done = doTask(s, 'kazi', at(0.3)) as Shift;
    expect(done.perf).toBe(WORK.START_PERF + 6);
    expect(done.goodDone).toBe(1);
  });

  it('enforces cooldowns and once-per-shift tasks', () => {
    let s = doTask(newShift(job, T0), 'kazi', at(0.3)) as Shift;
    expect(doTask(s, 'kazi', at(0.3) + 2000)).toBe('cooling_down');
    expect(cooldownLeft(s, 'kazi', at(0.3) + 2000)).toBeCloseTo(3);
    expect(typeof doTask(s, 'kazi', at(0.3) + 5000)).toBe('object');
    s = doTask(s, 'bosi', at(0.4)) as Shift;
    expect(doTask(s, 'bosi', at(0.85))).toBe('already_done');
  });

  it('slacking costs performance, which is clamped to 0…100', () => {
    let s = newShift(job, T0);
    for (let i = 0; i < 20; i++) {
      const r = doTask(s, 'pumzika', at(0.15) + i * 26_000);
      if (typeof r === 'object') s = r;
    }
    expect(s.perf).toBeGreaterThanOrEqual(0);
    expect(s.perf).toBeLessThan(WORK.START_PERF);
  });

  it('pay follows performance, rank and the star bonus', () => {
    expect(perfMultiplier({ perf: 50, goodDone: 0 })).toBeCloseTo(1);
    expect(perfMultiplier({ perf: 100, goodDone: 0 })).toBeCloseTo(1.3);
    expect(perfMultiplier({ perf: 100, goodDone: 4 })).toBeCloseTo(1.3 * 1.15);
    expect(fullPay(job, { perf: 50, goodDone: 0 }, 0)).toBe(140);
    expect(fullPay(job, { perf: 50, goodDone: 0 }, 12)).toBe(Math.round(140 * 1.5)); // rank 2
  });

  it('pays nothing for walking off early, pro rata after half, in full at the end', () => {
    const s = newShift(job, T0);
    expect(payout(job, s, 0, at(0.4))).toBe(0);
    expect(payout(job, s, 0, at(0.5))).toBe(70);
    expect(payout(job, s, 0, at(1))).toBe(140);
    expect(payout(job, s, 0, at(3))).toBe(140); // late clock-out isn't overtime
  });

  it('ranks climb with experience', () => {
    expect([0, 2, 3, 11, 12, 27, 500].map(rankFor)).toEqual([0, 0, 1, 1, 2, 3, 3]);
    expect(rankTitle(job, 0)).toBe('Machinga');
    expect(rankTitle(job, 27)).toBe('Dalali wa soko');
  });
});
