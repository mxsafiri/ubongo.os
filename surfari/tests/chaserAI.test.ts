import { describe, expect, it } from 'vitest';
import { CHASER, createChaseWorld, maxChasers, stepChase, whip, type Chaser, type PlayerView } from '@/components/map/chaserAI';

// Balance simulations: a scripted rider vs the real chase AI, 60 fps,
// several seeds. These pin down that every escape route works and every
// failure mode still bites, so tuning can't silently break the game.

const DT = 1 / 60;
const SEEDS = [3, 11, 29, 47, 71, 97, 131, 173];
const seeded = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

type Policy = (p: PlayerView, t: number, nearest: number) => { speed: number; yaw: number; jump?: boolean };

function run(policy: Policy, seed: number, seconds: number) {
  const w = createChaseWorld(seeded(seed));
  const p: PlayerView = { x: 0, y: 0, heading: 0, speed: 40, jump: 0 };
  let dist = 0;
  let jumpStart = -1;
  let firstCatch: number | null = null;
  const seen: Record<string, number> = {};
  for (let f = 0; f * DT < seconds; f++) {
    const t = f * DT;
    const hunting = w.chasers.filter((c) => c.state === 'chase').map((c) => Math.hypot(c.x - p.x, c.y - p.y));
    const a = policy(p, t, Math.min(Infinity, ...hunting));
    p.speed += (a.speed - p.speed) * (1 - Math.exp(-2.1 * DT));
    p.heading += a.yaw * DT;
    if (a.jump && jumpStart < 0) jumpStart = t;
    if (jumpStart >= 0) {
      const jt = (t - jumpStart) / 0.78; // the game's jump: 0.78 s, 11 m apex
      if (jt >= 1) { jumpStart = -1; p.jump = 0; } else p.jump = 44 * jt * (1 - jt);
    }
    p.x += Math.sin(p.heading) * p.speed * DT;
    p.y += Math.cos(p.heading) * p.speed * DT;
    dist += p.speed * DT;
    for (const e of stepChase(w, p, DT, dist)) {
      seen[e.type] = (seen[e.type] ?? 0) + 1;
      if (e.type === 'caught' && firstCatch === null) firstCatch = t;
    }
  }
  return { firstCatch, seen };
}
// Stateless policies are shared; stateful ones come from a factory, fresh per seed
const many = (policy: Policy, seconds: number) => SEEDS.map((s) => run(policy, s, seconds));
const manyFresh = (make: () => Policy, seconds: number) => SEEDS.map((s) => run(make(), s, seconds));
const total = (rs: ReturnType<typeof many>, type: string) => rs.reduce((n, r) => n + (r.seen[type] ?? 0), 0);

// A rider who cuts hard (≈90°) whenever a hunter closes inside `range`
const cutAt = (range: number) => (): Policy => {
  let cutUntil = -1;
  let dir = 1;
  return (p, t, near) => {
    if (near < range && t > cutUntil + 0.4) { cutUntil = t + 0.8; dir = -dir; }
    return { speed: 60, yaw: t < cutUntil ? 2.5 * Math.min(p.speed / 74, 1) * dir : 0 };
  };
};

describe('rival crew balance', () => {
  it('never catches a rider holding top speed, and gives up', () => {
    const rs = many(() => ({ speed: 74, yaw: 0 }), 90);
    expect(rs.every((r) => r.firstCatch === null)).toBe(true);
    expect(rs.every((r) => (r.seen.escaped ?? 0) >= 1)).toBe(true);
  });

  it('catches a cruising rider within ~20 s of the first spawn', () => {
    const rs = many(() => ({ speed: 45, yaw: 0 }), 90);
    expect(rs.every((r) => r.firstCatch !== null)).toBe(true);
    const mean = rs.reduce((s, r) => s + r.firstCatch!, 0) / rs.length;
    expect(mean).toBeLessThan(CHASER.FIRST_SPAWN_S + 20);
  });

  it('catches a rider who stops', () => {
    const rs = many((_p, t) => ({ speed: t < 9 ? 45 : 0, yaw: 0 }), 40);
    expect(rs.every((r) => r.firstCatch !== null && r.firstCatch < 24)).toBe(true);
  });

  it('a well-timed hard cut makes them wipe out instead of grabbing', () => {
    const straight = many(() => ({ speed: 60, yaw: 0 }), 60);
    const carved = manyFresh(cutAt(50), 60);
    expect(total(carved, 'caught')).toBeLessThan(total(straight, 'caught') * 0.6);
    expect(total(carved, 'wipeout')).toBeGreaterThan(0);
    expect(total(straight, 'wipeout')).toBe(0);
  });

  it('cutting too late mostly still gets you grabbed (it is a timing skill)', () => {
    const straight = many(() => ({ speed: 60, yaw: 0 }), 60);
    expect(total(manyFresh(cutAt(24), 60), 'caught')).toBeGreaterThanOrEqual(total(straight, 'caught') * 0.6);
  });

  it('a timed jump clears the grab; a mistimed one does not', () => {
    const cruise = many(() => ({ speed: 45, yaw: 0 }), 60);
    const timed = many((_p, _t, near) => ({ speed: 45, yaw: 0, jump: near < 20 }), 60);
    const early = many((_p, _t, near) => ({ speed: 45, yaw: 0, jump: near < 60 && near > 45 }), 60);
    expect(total(timed, 'caught')).toBeLessThan(total(cruise, 'caught') * 0.6);
    expect(total(early, 'caught')).toBeGreaterThanOrEqual(total(cruise, 'caught') * 0.8);
  });

  it('pays the dodge bonus at most once per chaser (no farming)', () => {
    const timed = many((_p, _t, near) => ({ speed: 45, yaw: 0, jump: near < 20 }), 60);
    expect(total(timed, 'dodged')).toBeLessThanOrEqual(total(timed, 'spawn'));
  });

  it('grows the pack from one to three with distance', () => {
    expect([maxChasers(0), maxChasers(3000), maxChasers(20000)]).toEqual([1, 2, 3]);
  });
});

describe('tail-whip', () => {
  const setup = () => {
    const w = createChaseWorld(seeded(5));
    const p: PlayerView = { x: 0, y: 0, heading: 0, speed: 50, jump: 0 };
    const mk = (x: number, y: number): Chaser => ({
      id: w.nextId++, x, y, heading: 0, speed: 50, state: 'chase', stateT: 0,
      burstT: 0, nextBurst: 5, farT: 0, whiffT: 0, whiffs: 0, slipT: 0,
    });
    // behind in range, ahead, behind out of range, behind-diagonal in range
    w.chasers.push(mk(0, -30), mk(0, 30), mk(0, -80), mk(25, -25));
    return { w, p };
  };

  it('hits only riders behind and in range', () => {
    const { w, p } = setup();
    expect(whip(w, p)).toEqual([1, 4]);
  });

  it('cools down, then is ready again', () => {
    const { w, p } = setup();
    whip(w, p);
    expect(whip(w, p)).toBeNull();
    stepChase(w, p, CHASER.WHIP_COOLDOWN_S + 0.01, 0);
    expect(whip(w, p)).not.toBeNull();
  });

  it('knocked-off riders are cleared after their tumble', () => {
    const { w, p } = setup();
    whip(w, p);
    for (let i = 0; i < 120; i++) stepChase(w, p, DT, 0);
    expect(w.chasers.some((c) => c.id === 1 || c.id === 4)).toBe(false);
  });
});

describe('rival crew and buildings', () => {
  // Play a scripted rider against the AI in a world with walls
  function runWorld(blocked: (x: number, y: number) => boolean, policy: (p: PlayerView, t: number, near: number) => { speed: number; yaw: number }, seed: number, seconds: number) {
    const w = createChaseWorld(seeded(seed));
    w.blocked = blocked;
    const p: PlayerView = { x: 0, y: 0, heading: 0, speed: 45, jump: 0 };
    const seen: Record<string, number> = {};
    let playerInWall = false;
    let dist = 0;
    for (let f = 0; f * DT < seconds; f++) {
      const t = f * DT;
      const near = Math.min(Infinity, ...w.chasers.filter((c) => c.state === 'chase').map((c) => Math.hypot(c.x - p.x, c.y - p.y)));
      const a = policy(p, t, near);
      p.speed += (a.speed - p.speed) * (1 - Math.exp(-2.1 * DT));
      p.heading += a.yaw * DT;
      p.x += Math.sin(p.heading) * p.speed * DT;
      p.y += Math.cos(p.heading) * p.speed * DT;
      dist += p.speed * DT;
      if (blocked(p.x, p.y)) playerInWall = true;
      for (const e of stepChase(w, p, DT, dist)) seen[e.type] = (seen[e.type] ?? 0) + 1;
      for (const c of w.chasers) if (c.state === 'chase') expect(Number.isFinite(c.x)).toBe(true);
    }
    return { seen, playerInWall };
  }

  it('never spawns inside a building, and drives a walled street without crashing itself', () => {
    // A 120 m-wide avenue running north; solid blocks either side
    const avenue = (x: number) => Math.abs(x) > 60;
    const rs = SEEDS.map((s) => runWorld(avenue, () => ({ speed: 45, yaw: 0 }), s, 90));
    expect(rs.reduce((n, r) => n + (r.seen.wipeout ?? 0), 0)).toBeLessThanOrEqual(1);
    expect(rs.every((r) => (r.seen.caught ?? 0) >= 1)).toBe(true); // still a threat
  });

  it('a chaser lured at a wall with a late cut slams into it', () => {
    let wipeouts = 0;
    for (const seed of SEEDS) {
      // A wall appears 70 m ahead once a chaser is on your tail; cut east 40 m short of it
      let wallY = Infinity;
      let cutAt = Infinity;
      const blocked = (_x: number, y: number) => y > wallY && y < wallY + 40;
      const r = runWorld(blocked, (p, t, near) => {
        if (wallY === Infinity && near < 45) wallY = p.y + 70;
        if (cutAt === Infinity && wallY !== Infinity && p.y > wallY - 40) cutAt = t;
        return { speed: 60, yaw: t >= cutAt && t < cutAt + 0.8 ? 2.0 : 0 };
      }, seed, 90);
      expect(r.playerInWall).toBe(false);
      wipeouts += r.seen.wipeout ?? 0;
    }
    expect(wipeouts).toBeGreaterThanOrEqual(SEEDS.length / 2);
  });
});
