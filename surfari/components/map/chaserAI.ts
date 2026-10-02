// Rival-crew chasers for Surf Run.
//
// Adapted from the patrol → detect → chase NPC pattern (and the melee attack
// cone) in kartik786-git/gta-clone-threejs, tuned for a board game: chasers
// are a little slower than you at full tilt but burst faster for a moment,
// so cruising or stopping gets you caught. Three ways to beat them:
//   - hold top speed until they give up;
//   - jump as one lunges: it whiffs under you and stumbles;
//   - carve hard: their grip is limited (fast = wide turns), and a chaser
//     held on the grip limit at speed for too long wipes out;
//   - lure one into a building: they steer around walls, but at speed they
//     can't turn in time, and hitting one is a wipeout;
// and a tail-whip knocks one off behind you for a bounty.
//
// Pure logic in local meters (x east, y north), no rendering, so the
// balance can be simulated and tested.

import { clamp, wrapAngle } from '@/lib/game/motion';

export const CHASER = {
  TOP_SPEED: 64,          // m/s — the board tops out at 74
  BURST_SPEED: 80,        // m/s for BURST_S when close
  BURST_S: 1.6,
  BURST_EVERY_S: 6,
  BURST_RANGE_M: 140,
  ACCEL: 1.4,             // per second, toward target speed
  TURN_RATE: 1.6,         // rad/s at low speed — the board turns at up to 2.5
  GRIP: 40,               // m/s² of lateral grip: turn rate = min(TURN_RATE, GRIP / speed)
  PATROL_SPEED: 18,
  DETECT_M: 320,
  CATCH_M: 16,
  CLEAR_JUMP_M: 3.5,      // above this you sail over a grab
  SEPARATION_M: 30,
  GIVE_UP_M: 650,
  GIVE_UP_S: 3,
  SPAWN_BEHIND_M: 260,
  SPAWN_EVERY_S: 18,
  FIRST_SPAWN_S: 8,
  MIN_PLAYER_SPEED: 15,   // no spawns while you dawdle at the start
  KO_S: 1.3,              // knocked-out tumble before vanishing
  WHIFF_S: 1.6,           // after lunging under a jump: stumbling, can't grab
  WHIFF_SPEED_K: 0.4,     // speed kept after a whiff
  SLIP_SPEED: 45,         // above this, sitting on the grip limit…
  SLIP_S: 0.6,            // …for this long → wipeout
  DODGE_BONUS: 25,        // Tide for jumping a chaser's first grab
  MAX_WHIFFS: 2,          // made a fool of twice, it gives up
  WIPEOUT_BONUS: 100,     // Tide for making one eat pavement
  WHISKER_M: 18,          // wall probe reach at rest…
  WHISKER_PER_MS: 0.45,   // …plus this many meters per m/s of speed
  WHISKER_SPREAD: 0.55,   // rad between the centre probe and each side probe
  AVOID_TURN: 1.0,        // rad of steering away from a wall ahead
  SPAWN_TRIES: 10,
  FLEE_S: 1.4,            // after a grab they peel off
  WHIP_RANGE_M: 45,
  WHIP_HALF_ANGLE: (75 * Math.PI) / 180,
  WHIP_COOLDOWN_S: 2.5,
  BOUNTY: 150,            // Tide per knock-off
  ESCAPE_BONUS: 50,       // Tide for shaking one off
} as const;

export type ChaserState = 'patrol' | 'chase' | 'flee' | 'ko';

export interface Chaser {
  id: number;
  x: number;
  y: number;
  heading: number;        // rad, clockwise from north
  speed: number;          // m/s
  state: ChaserState;
  stateT: number;         // seconds in the current state
  burstT: number;         // >0 while bursting
  nextBurst: number;      // seconds until the next burst is allowed
  farT: number;           // seconds spent beyond GIVE_UP_M
  whiffT: number;         // >0 while stumbling after a missed grab
  whiffs: number;         // grabs it has whiffed so far
  slipT: number;          // seconds spent over the grip limit
}

export interface PlayerView {
  x: number;
  y: number;
  heading: number;
  speed: number;          // m/s
  jump: number;           // meters above ground
}

export type ChaseEvent =
  | { type: 'spawn'; id: number }
  | { type: 'caught'; id: number }
  | { type: 'ko'; id: number }
  | { type: 'dodged'; id: number }
  | { type: 'wipeout'; id: number }
  | { type: 'escaped'; id: number };

export interface ChaseWorld {
  chasers: Chaser[];
  /** Is this point inside a building? (absent = open ground everywhere) */
  blocked?: (x: number, y: number) => boolean;
  t: number;              // run time (s)
  nextSpawn: number;      // run time of the next spawn
  whipReadyAt: number;    // run time the whip is ready again
  nextId: number;
  rnd: () => number;
}

export function createChaseWorld(rnd: () => number = Math.random): ChaseWorld {
  return { chasers: [], t: 0, nextSpawn: CHASER.FIRST_SPAWN_S, whipReadyAt: 0, nextId: 1, rnd };
}

/** How many may hunt at once — one at first, up to three as the run gets long. */
export function maxChasers(runDistanceM: number) {
  return Math.min(3, 1 + Math.floor(runDistanceM / 2500));
}

function spawn(w: ChaseWorld, p: PlayerView): Chaser | null {
  // Behind the player, ±60° off dead astern, on open ground
  let x = 0;
  let y = 0;
  let found = false;
  for (let i = 0; i < CHASER.SPAWN_TRIES && !found; i++) {
    const ang = p.heading + Math.PI + (w.rnd() - 0.5) * (Math.PI * 2 / 3);
    const d = CHASER.SPAWN_BEHIND_M * (0.85 + w.rnd() * 0.3);
    x = p.x + Math.sin(ang) * d;
    y = p.y + Math.cos(ang) * d;
    found = !w.blocked?.(x, y);
  }
  if (!found) return null;
  const c: Chaser = {
    id: w.nextId++,
    x,
    y,
    heading: p.heading,
    speed: CHASER.PATROL_SPEED,
    state: 'patrol',
    stateT: 0,
    burstT: 0,
    nextBurst: 2 + w.rnd() * 2,
    farT: 0,
    whiffT: 0,
    whiffs: 0,
    slipT: 0,
  };
  w.chasers.push(c);
  return c;
}

/** Grip-limited: the faster a chaser goes, the wider it has to turn. */
function turnRate(speed: number) {
  return Math.min(CHASER.TURN_RATE, CHASER.GRIP / Math.max(speed, 1));
}

function setState(c: Chaser, s: ChaserState) {
  c.state = s;
  c.stateT = 0;
}

/**
 * Advance the chase by dt. Returns what happened this step; the caller
 * applies consequences (Tide, stun, sound). `runDistanceM` scales the pack.
 */
export function stepChase(w: ChaseWorld, p: PlayerView, dt: number, runDistanceM: number): ChaseEvent[] {
  const events: ChaseEvent[] = [];
  w.t += dt;

  // Spawning: only while actually riding
  const active = w.chasers.filter((c) => c.state === 'patrol' || c.state === 'chase').length;
  if (w.t >= w.nextSpawn) {
    const c = p.speed >= CHASER.MIN_PLAYER_SPEED && active < maxChasers(runDistanceM) ? spawn(w, p) : null;
    if (c) {
      events.push({ type: 'spawn', id: c.id });
      w.nextSpawn = w.t + CHASER.SPAWN_EVERY_S * (0.75 + w.rnd() * 0.5);
    } else {
      w.nextSpawn = w.t + 2; // try again shortly
    }
  }

  const pvx = Math.sin(p.heading) * p.speed;
  const pvy = Math.cos(p.heading) * p.speed;

  for (const c of w.chasers) {
    c.stateT += dt;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dist = Math.hypot(dx, dy);

    if (c.state === 'ko') {
      c.speed = Math.max(0, c.speed - 60 * dt);
    } else if (c.state === 'flee') {
      // Peel away from the player
      const away = Math.atan2(-dx, -dy);
      const turn = turnRate(c.speed) * dt;
      c.heading += clamp(wrapAngle(away - c.heading), -turn, turn);
      c.speed += (CHASER.TOP_SPEED - c.speed) * (1 - Math.exp(-CHASER.ACCEL * dt));
    } else {
      if (c.state === 'patrol' && dist < CHASER.DETECT_M) setState(c, 'chase');

      // Steer toward an intercept point: where the player will be when we arrive
      let aimX = p.x;
      let aimY = p.y;
      let target: number = CHASER.PATROL_SPEED;
      if (c.state === 'chase') {
        const closing = Math.max(c.speed - (pvx * dx + pvy * dy) / Math.max(dist, 1), 10);
        const lead = clamp(dist / closing, 0, 1.5);
        aimX = p.x + pvx * lead;
        aimY = p.y + pvy * lead;

        c.nextBurst -= dt;
        if (c.burstT > 0) c.burstT -= dt;
        else if (c.nextBurst <= 0 && dist < CHASER.BURST_RANGE_M) {
          c.burstT = CHASER.BURST_S;
          c.nextBurst = CHASER.BURST_EVERY_S;
        }
        target = c.burstT > 0 ? CHASER.BURST_SPEED : CHASER.TOP_SPEED;
      }

      // Keep the pack spread so they don't stack into one model
      for (const o of w.chasers) {
        if (o === c || o.state === 'ko') continue;
        const sx = c.x - o.x;
        const sy = c.y - o.y;
        const sd = Math.hypot(sx, sy);
        if (sd > 0 && sd < CHASER.SEPARATION_M) {
          const push = (CHASER.SEPARATION_M - sd) / CHASER.SEPARATION_M;
          aimX += (sx / sd) * push * 40;
          aimY += (sy / sd) * push * 40;
        }
      }

      let want = Math.atan2(aimX - c.x, aimY - c.y);
      // Whiskers: if the way ahead is a wall, steer for the clearer side
      if (w.blocked) {
        const reach = CHASER.WHISKER_M + c.speed * CHASER.WHISKER_PER_MS;
        const probe = (a: number) => w.blocked!(c.x + Math.sin(a) * reach, c.y + Math.cos(a) * reach);
        if (probe(c.heading)) {
          const left = probe(c.heading - CHASER.WHISKER_SPREAD);
          const right = probe(c.heading + CHASER.WHISKER_SPREAD);
          const away = !left && right ? -1 : left && !right ? 1 : wrapAngle(want - c.heading) < 0 ? -1 : 1;
          want = c.heading + away * CHASER.AVOID_TURN;
        }
      }
      const turn = turnRate(c.speed) * dt;
      const saturated = Math.abs(wrapAngle(want - c.heading)) > turn; // wants more turn than grip allows
      c.heading += clamp(wrapAngle(want - c.heading), -turn, turn);
      // Sharp angle off the aim bleeds speed, like a real rider braking into a turn
      const off = Math.abs(wrapAngle(want - c.heading));
      const cornering = 1 - 0.45 * clamp(off / (Math.PI / 2), 0, 1);
      if (c.whiffT > 0) {
        c.whiffT -= dt;
        target *= 0.6;
      }
      c.speed += (target * cornering - c.speed) * (1 - Math.exp(-CHASER.ACCEL * dt));

      // Grip: held on the limit at speed for too long, it loses the back end
      const overLimit = c.state === 'chase' && saturated && c.speed > CHASER.SLIP_SPEED;
      c.slipT = overLimit ? c.slipT + dt : Math.max(0, c.slipT - dt * 2);
      if (c.slipT > CHASER.SLIP_S) {
        events.push({ type: 'wipeout', id: c.id });
        setState(c, 'ko');
      }

      // Give up if hopelessly far
      c.farT = dist > CHASER.GIVE_UP_M ? c.farT + dt : 0;
      if (c.farT > CHASER.GIVE_UP_S) {
        events.push({ type: 'escaped', id: c.id });
        setState(c, 'flee');
        c.stateT = CHASER.FLEE_S; // remove immediately below
      }

      // The grab — a lunge under a jumping rider whiffs and stumbles
      if (c.state === 'chase' && dist < CHASER.CATCH_M && c.whiffT <= 0) {
        if (p.jump >= CHASER.CLEAR_JUMP_M) {
          c.whiffs++;
          // Only the first dodge per chaser pays; a second one sends it home
          if (c.whiffs === 1) events.push({ type: 'dodged', id: c.id });
          c.whiffT = CHASER.WHIFF_S;
          c.speed *= CHASER.WHIFF_SPEED_K;
          if (c.whiffs >= CHASER.MAX_WHIFFS) {
            events.push({ type: 'escaped', id: c.id });
            setState(c, 'flee');
          }
        } else {
          events.push({ type: 'caught', id: c.id });
          setState(c, 'flee');
        }
      }
    }

    c.x += Math.sin(c.heading) * c.speed * dt;
    c.y += Math.cos(c.heading) * c.speed * dt;

    // Into a building: wiped out
    if ((c.state === 'chase' || c.state === 'patrol') && w.blocked?.(c.x, c.y)) {
      events.push({ type: 'wipeout', id: c.id });
      setState(c, 'ko');
      c.speed = 0;
    }
  }

  w.chasers = w.chasers.filter(
    (c) => !(c.state === 'ko' && c.stateT > CHASER.KO_S) && !(c.state === 'flee' && c.stateT >= CHASER.FLEE_S),
  );
  return events;
}

/**
 * Tail-whip: knock off every chaser in a cone behind the rider. Returns the
 * ids hit, or null if the whip is still cooling down.
 */
export function whip(w: ChaseWorld, p: PlayerView): number[] | null {
  if (w.t < w.whipReadyAt) return null;
  w.whipReadyAt = w.t + CHASER.WHIP_COOLDOWN_S;
  const back = p.heading + Math.PI;
  const hit: number[] = [];
  for (const c of w.chasers) {
    if (c.state !== 'chase' && c.state !== 'patrol') continue;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > CHASER.WHIP_RANGE_M) continue;
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dy) - back));
    if (ang > CHASER.WHIP_HALF_ANGLE) continue;
    setState(c, 'ko');
    hit.push(c.id);
  }
  return hit;
}

/** Seconds until the whip is ready (0 when ready). */
export function whipCooldown(w: ChaseWorld) {
  return Math.max(0, w.whipReadyAt - w.t);
}
