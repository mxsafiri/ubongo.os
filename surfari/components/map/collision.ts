// Building collisions for Surf Run, in local meters (x east, y north).
//
// Footprints (building outlines from the map) go into a uniform grid so a
// rider only tests the few buildings around it. The rider is a circle:
// glancing a wall scrapes along it, hitting one square-on is a crash, and
// a building lower than your jump height can be cleared in the air.
// Pure maths, no map — so it's unit-tested.

import { clamp } from '@/lib/game/motion';

export const COLLIDE = {
  RIDER_RADIUS_M: 4,          // narrow enough that real Dar streets stay rideable
  CRASH_IMPACT_MS: 22,        // speed into the wall (m/s) above which it's a crash
  SCRAPE_LOSS: 0.25,          // share of along-wall speed lost by a hard (near-crash) scrape;
                              // a light graze loses proportionally less
  JUMP_MARGIN_M: 1.5,         // clear a roof by at least this much
  CELL_M: 40,
} as const;

export interface Footprint {
  id: string;
  ring: number[];             // flat [x0, y0, x1, y1, …], closed or open
  height: number | null;      // meters, when the map knows it
  minX: number; minY: number; maxX: number; maxY: number;
}

export function makeFootprint(id: string, ring: number[], height: number | null): Footprint {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]);
    minY = Math.min(minY, ring[i + 1]); maxY = Math.max(maxY, ring[i + 1]);
  }
  return { id, ring, height, minX, minY, maxX, maxY };
}

export class BuildingIndex {
  private cells = new Map<string, Footprint[]>();
  readonly size: number;

  constructor(footprints: Footprint[], private cell = COLLIDE.CELL_M) {
    for (const f of footprints) {
      for (let cx = Math.floor(f.minX / cell); cx <= Math.floor(f.maxX / cell); cx++) {
        for (let cy = Math.floor(f.minY / cell); cy <= Math.floor(f.maxY / cell); cy++) {
          const k = `${cx},${cy}`;
          const list = this.cells.get(k);
          if (list) list.push(f); else this.cells.set(k, [f]);
        }
      }
    }
    this.size = footprints.length;
  }

  near(x: number, y: number, r: number): Footprint[] {
    const out = new Set<Footprint>();
    const c = this.cell;
    for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
      for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++) {
        const list = this.cells.get(`${cx},${cy}`);
        if (!list) continue;
        for (const f of list) {
          if (x + r >= f.minX && x - r <= f.maxX && y + r >= f.minY && y - r <= f.maxY) out.add(f);
        }
      }
    }
    return [...out];
  }
}

export function pointInRing(ring: number[], x: number, y: number) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2], yi = ring[i * 2 + 1];
    const xj = ring[j * 2], yj = ring[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Twice the signed area: > 0 for counter-clockwise rings (x east, y north). */
function signedArea2(ring: number[]) {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
  return a;
}

/**
 * Closest point on the ring's boundary to (x, y), plus the outward normal
 * of the wall face the point is approaching. At a corner, two faces tie for
 * distance; the face is the one the point is most squarely in front of —
 * so brushing a corner side-on reads as side-on, not as a frontal impact.
 */
function closestOnRing(ring: number[], x: number, y: number) {
  const ccw = signedArea2(ring) > 0;
  let best = { x: 0, y: 0, d2: Infinity, fx: 0, fy: 0, front: -Infinity };
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = ring[j * 2], ay = ring[j * 2 + 1];
    const bx = ring[i * 2], by = ring[i * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
    const px = ax + dx * t, py = ay + dy * t;
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    const len = Math.sqrt(len2);
    // Outward normal: right of the edge for CCW rings, left for CW
    const fx = (ccw ? dy : -dy) / len;
    const fy = (ccw ? -dx : dx) / len;
    const front = (x - ax) * fx + (y - ay) * fy;
    if (d2 < best.d2 - 1e-9 || (Math.abs(d2 - best.d2) <= 1e-9 && front > best.front)) {
      best = { x: px, y: py, d2, fx, fy, front };
    }
  }
  return best;
}

export interface Hit {
  nx: number;      // unit push-out direction (out of the building, toward the rider)
  ny: number;
  depth: number;   // how far to push the rider out (m)
  fx: number;      // outward normal of the wall face being hit — judges the impact
  fy: number;
}

/** Deepest overlap between a circle and the buildings near it, if any. */
export function collide(index: BuildingIndex, x: number, y: number, r: number, airborneM = 0): Hit | null {
  let best: Hit | null = null;
  for (const f of index.near(x, y, r)) {
    // Sail over anything lower than the jump
    if (airborneM > 0 && f.height !== null && f.height + COLLIDE.JUMP_MARGIN_M < airborneM) continue;
    const cp = closestOnRing(f.ring, x, y);
    const d = Math.sqrt(cp.d2);
    const inside = pointInRing(f.ring, x, y);
    if (!inside && d >= r) continue;
    let nx: number, ny: number, depth: number;
    if (inside) {
      // Push out through the nearest wall
      nx = d > 1e-6 ? (cp.x - x) / d : 1;
      ny = d > 1e-6 ? (cp.y - y) / d : 0;
      depth = d + r;
    } else {
      nx = (x - cp.x) / d;
      ny = (y - cp.y) / d;
      depth = r - d;
    }
    if (!best || depth > best.depth) best = { nx, ny, depth, fx: cp.fx, fy: cp.fy };
  }
  return best;
}

export function isBlocked(index: BuildingIndex | null, x: number, y: number, r = 0) {
  if (!index) return false;
  for (const f of index.near(x, y, r)) {
    if (pointInRing(f.ring, x, y)) return true;
    if (r > 0 && closestOnRing(f.ring, x, y).d2 < r * r) return true;
  }
  return false;
}

export interface RiderMove {
  x: number;
  y: number;
  heading: number;  // rad, clockwise from north
  speed: number;    // m/s
}

export type MoveResult = RiderMove & { crash: boolean; scrape: boolean; impact: number };

/**
 * Resolve a rider who has just moved to (x, y). Pushes them out of any
 * building; a square-on impact above CRASH_IMPACT_MS is a crash (the
 * caller applies the penalty), anything shallower slides along the wall.
 */
export function resolveRider(index: BuildingIndex | null, m: RiderMove, airborneM = 0, r: number = COLLIDE.RIDER_RADIUS_M): MoveResult {
  const out: MoveResult = { ...m, crash: false, scrape: false, impact: 0 };
  if (!index) return out;
  // Two passes handle inside corners (two walls at once)
  for (let pass = 0; pass < 2; pass++) {
    const hit = collide(index, out.x, out.y, r, airborneM);
    if (!hit) break;
    out.x += hit.nx * (hit.depth + 0.01);
    out.y += hit.ny * (hit.depth + 0.01);
    const vx = Math.sin(out.heading) * out.speed;
    const vy = Math.cos(out.heading) * out.speed;
    // Impact is judged against the wall face, not the push direction, so a
    // corner brushed side-on is a nudge rather than a frontal hit
    const vn = vx * hit.fx + vy * hit.fy; // < 0: moving into the wall
    if (vn >= 0) continue;
    const impact = -vn;
    out.impact = Math.max(out.impact, impact);
    if (impact > COLLIDE.CRASH_IMPACT_MS) {
      out.crash = true;
      // Bounce off a touch so the rider isn't left touching the wall
      out.x += hit.nx * 2;
      out.y += hit.ny * 2;
      return out;
    }
    // Scrape: keep the along-wall component; friction scales with how hard
    // you hit, so brushing a row of building corners doesn't bleed you dry
    const tx = vx - vn * hit.fx;
    const ty = vy - vn * hit.fy;
    const along = Math.hypot(tx, ty);
    out.scrape = true;
    out.speed = along * (1 - COLLIDE.SCRAPE_LOSS * clamp(impact / COLLIDE.CRASH_IMPACT_MS, 0, 1));
    if (along > 0.5) out.heading = Math.atan2(tx, ty);
  }
  return out;
}

/**
 * How far you can travel from (x, y) along (dx, dy) — a unit vector —
 * before entering a building taller than `minHeight`. Buildings of unknown
 * height count as tall. Sampled every `step` meters up to `maxD`.
 */
export function clearDistance(
  index: BuildingIndex | null, x: number, y: number, dx: number, dy: number,
  maxD: number, step = 2, minHeight = 0,
): number {
  if (!index) return maxD;
  for (let d = step; d <= maxD; d += step) {
    const px = x + dx * d, py = y + dy * d;
    for (const f of index.near(px, py, 0)) {
      if ((f.height ?? Infinity) > minHeight && pointInRing(f.ring, px, py)) return d - step;
    }
  }
  return maxD;
}

/**
 * Nearest spot to (x, y) where a rider of radius `r` fits, searching outward
 * in rings. Returns the start point unchanged when it's already clear, or
 * null when nothing within `maxR` is open.
 */
export function findOpenSpot(index: BuildingIndex | null, x: number, y: number, r: number = COLLIDE.RIDER_RADIUS_M, maxR = 200) {
  if (!isBlocked(index, x, y, r)) return { x, y };
  for (let d = 4; d <= maxR; d += 4) {
    const n = Math.max(8, Math.round((2 * Math.PI * d) / 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.sin(a) * d, py = y + Math.cos(a) * d;
      if (!isBlocked(index, px, py, r)) return { x: px, y: py };
    }
  }
  return null;
}

/**
 * The heading (rad, clockwise from north) with the longest open run from
 * (x, y) — so a fresh ride points down a street, not into a wall. Ties go
 * to the direction closest to `preferred`.
 */
export function openHeading(index: BuildingIndex | null, x: number, y: number, preferred = 0, lookM = 240, dirs = 24) {
  if (!index) return preferred;
  let best = preferred, bestScore = -Infinity;
  for (let i = 0; i < dirs; i++) {
    const h = preferred + (i / dirs) * Math.PI * 2;
    const free = clearDistance(index, x, y, Math.sin(h), Math.cos(h), lookM, 4);
    const off = Math.abs(Math.atan2(Math.sin(h - preferred), Math.cos(h - preferred)));
    const score = free - off * 4; // a few meters of run is worth less than facing where you were
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}
