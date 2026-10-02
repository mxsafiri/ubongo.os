// Dead reckoning for remote riders.
//
// Heartbeats arrive every ~2.5 s with position, heading and speed. Between
// them we extrapolate along the reported velocity, and when a new fix lands
// we don't snap or chase it — we blend from where the rider *appears* to be
// toward where the new velocity says they are (projective velocity
// blending), so riders keep moving continuously and corrections are
// invisible. Pure functions, in local meters, so the maths is testable.

import { clamp, dampAngle, wrapAngle } from '@/lib/game/motion';

export const RIDER_TOP_SPEED_MS = 74;
const BLEND_S = 0.9;          // how long a correction takes to settle
const MAX_EXTRAPOLATE_S = 3;  // after this, assume they stopped (heartbeat lost)
const COAST_S = 1.5;          // ease to a stop over this long once past the limit
const SNAP_M = 400;           // beyond this error, teleport instead of blending
const MAX_TURN = 1.2;         // rad/s cap on the estimated turn rate

export interface Snapshot {
  x: number;        // meters east of the local origin
  y: number;        // meters north of the local origin
  heading: number;  // radians, clockwise from north
  speed: number;    // m/s
  turn?: number;    // rad/s, if the sender reported it
  ageS: number;     // how old the fix already was when we received it
}

export interface Track {
  // Newest fix, already projected to the moment we received it, moving
  // along an arc: speed v, heading h, turn rate w (rad/s)
  bx: number; by: number; vx: number; vy: number; t0: number;
  v: number; h: number; w: number;
  fixT: number;     // when that fix was taken (receive time − age)
  fixH: number;     // its raw heading, for the next turn-rate estimate
  // Where the rider was displayed, and how fast, when that fix arrived
  dx: number; dy: number; dvx: number; dvy: number;
  // Last sampled output (for velocity continuity and heading)
  px: number; py: number; pvx: number; pvy: number; pt: number;
  heading: number;
}

export interface Sample {
  x: number;
  y: number;
  heading: number;
  speed01: number;
}

function velocity(s: Snapshot) {
  return { vx: Math.sin(s.heading) * s.speed, vy: Math.cos(s.heading) * s.speed };
}

/** Position after travelling for k seconds at speed v from heading h, turning at w rad/s. */
function arc(x: number, y: number, v: number, h: number, w: number, k: number) {
  if (Math.abs(w) < 1e-3) return { x: x + Math.sin(h) * v * k, y: y + Math.cos(h) * v * k, h };
  const h1 = h + w * k;
  return {
    x: x + (v / w) * (Math.cos(h) - Math.cos(h1)),
    y: y + (v / w) * (Math.sin(h1) - Math.sin(h)),
    h: h1,
  };
}

/** Distance travelled after τ seconds of extrapolation, coasting to a stop past the limit. */
function travel(tau: number) {
  if (tau <= MAX_EXTRAPOLATE_S) return tau;
  const over = Math.min(tau - MAX_EXTRAPOLATE_S, COAST_S);
  // Linear deceleration to zero over COAST_S: ∫(1 - u/COAST_S) du
  return MAX_EXTRAPOLATE_S + over - (over * over) / (2 * COAST_S);
}

export function createTrack(s: Snapshot, now: number): Track {
  const { vx, vy } = velocity(s);
  const age = Math.min(s.ageS, MAX_EXTRAPOLATE_S);
  const bx = s.x + vx * age;
  const by = s.y + vy * age;
  return {
    bx, by, vx, vy, t0: now,
    v: s.speed, h: s.heading, w: 0, fixT: now - s.ageS, fixH: s.heading,
    dx: bx, dy: by, dvx: vx, dvy: vy,
    px: bx, py: by, pvx: vx, pvy: vy, pt: now,
    heading: s.heading,
  };
}

/** Fold a new heartbeat into the track without a visible jump. */
export function updateTrack(tr: Track, s: Snapshot, now: number) {
  // Turn rate from consecutive fixes — lets us extrapolate along the curve
  const fixT = now - s.ageS;
  const span = fixT - tr.fixT;
  const w = s.speed <= 2 ? 0
    : s.turn !== undefined ? clamp(s.turn, -MAX_TURN, MAX_TURN)  // sender knows best
    : span > 0.3 && span < 8 ? clamp(wrapAngle(s.heading - tr.fixH) / span, -MAX_TURN, MAX_TURN)
    : 0;
  const age = Math.min(s.ageS, MAX_EXTRAPOLATE_S);
  const p = arc(s.x, s.y, s.speed, s.heading, w, age);
  const bx = p.x;
  const by = p.y;
  const vx = Math.sin(p.h) * s.speed;
  const vy = Math.cos(p.h) * s.speed;
  const cur = sampleTrack(tr, now);
  if (Math.hypot(bx - cur.x, by - cur.y) > SNAP_M) {
    Object.assign(tr, createTrack(s, now));
    return;
  }
  tr.dx = cur.x;
  tr.dy = cur.y;
  tr.dvx = tr.pvx;
  tr.dvy = tr.pvy;
  tr.bx = bx;
  tr.by = by;
  tr.vx = vx;
  tr.vy = vy;
  tr.t0 = now;
  tr.v = s.speed;
  tr.h = p.h;
  tr.w = w;
  tr.fixT = fixT;
  tr.fixH = s.heading;
}

/** Where to draw the rider at time `now` (seconds). Call once per frame. */
export function sampleTrack(tr: Track, now: number): Sample {
  const tau = Math.max(0, now - tr.t0);
  const k = travel(tau);

  // Projected truth: newest fix carried along its arc
  const q = arc(tr.bx, tr.by, tr.v, tr.h, tr.w, k);
  const qx = q.x;
  const qy = q.y;

  // Old display path, blended toward the projection with an S-curve
  const a = clamp(tau / BLEND_S, 0, 1);
  const w = a * a * (3 - 2 * a);
  const bk = Math.min(tau, BLEND_S);
  // Old display velocity ramps linearly into the new one over the blend:
  // ∫ dv + (v − dv)·u/B du = dv·τ + (v − dv)·τ²/(2B)
  const ox = tr.dx + (tr.dvx + (tr.vx - tr.dvx) * a * 0.5) * bk;
  const oy = tr.dy + (tr.dvy + (tr.vy - tr.dvy) * a * 0.5) * bk;
  const x = ox + (qx - ox) * w;
  const y = oy + (qy - oy) * w;

  const dt = now - tr.pt;
  if (dt > 1e-4) {
    tr.pvx = (x - tr.px) / dt;
    tr.pvy = (y - tr.py) / dt;
    const v = Math.hypot(tr.pvx, tr.pvy);
    // Face the way they're actually moving; hold heading when stopped
    if (v > 1.5) tr.heading = dampAngle(tr.heading, Math.atan2(tr.pvx, tr.pvy), 10, dt);
  }
  tr.px = x;
  tr.py = y;
  tr.pt = now;

  return { x, y, heading: tr.heading, speed01: clamp(Math.hypot(tr.pvx, tr.pvy) / RIDER_TOP_SPEED_MS, 0, 1.3) };
}
