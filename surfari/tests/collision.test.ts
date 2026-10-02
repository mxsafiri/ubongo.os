import { describe, expect, it } from 'vitest';
import { BuildingIndex, COLLIDE, clearDistance, collide, findOpenSpot, isBlocked, makeFootprint, openHeading, pointInRing, resolveRider } from '@/components/map/collision';

// A 40 × 40 m block whose west wall is x = 20, spanning y = -20..20
const square = (cx: number, cy: number, half: number, h: number | null = 30) =>
  makeFootprint(`b${cx},${cy}`, [cx - half, cy - half, cx + half, cy - half, cx + half, cy + half, cx - half, cy + half], h);
const index = new BuildingIndex([square(40, 0, 20), square(0, 60, 20, 6)]);
const EAST = Math.PI / 2;
const NORTH_EAST = Math.PI / 4;

describe('footprint geometry', () => {
  it('knows inside from outside', () => {
    expect(pointInRing(square(0, 0, 10).ring, 0, 0)).toBe(true);
    expect(pointInRing(square(0, 0, 10).ring, 11, 0)).toBe(false);
  });

  it('only returns buildings near the query', () => {
    expect(index.near(40, 0, 1)).toHaveLength(1);
    expect(index.near(-200, -200, 5)).toHaveLength(0);
  });

  it('reports overlap with an outward normal', () => {
    const hit = collide(index, 18, 0, COLLIDE.RIDER_RADIUS_M)!; // 2 m from the west wall
    expect(hit.nx).toBeCloseTo(-1, 6);
    expect(hit.depth).toBeCloseTo(2, 6);
    expect(collide(index, 10, 0, COLLIDE.RIDER_RADIUS_M)).toBeNull();
  });

  it('pushes a rider who ended up inside back out the nearest wall', () => {
    const hit = collide(index, 23, 0, COLLIDE.RIDER_RADIUS_M)!;
    expect(hit.nx).toBeCloseTo(-1, 6);
    expect(hit.depth).toBeCloseTo(3 + COLLIDE.RIDER_RADIUS_M, 6);
  });
});

describe('rider response', () => {
  it('rides straight past when the street is clear', () => {
    const r = resolveRider(index, { x: 0, y: -40, heading: 0, speed: 60 });
    expect(r).toMatchObject({ crash: false, scrape: false, x: 0, y: -40, speed: 60 });
  });

  it('crashes into a wall hit square-on at speed', () => {
    const r = resolveRider(index, { x: 18, y: 0, heading: EAST, speed: 60 });
    expect(r.crash).toBe(true);
    expect(r.x).toBeLessThan(20 - COLLIDE.RIDER_RADIUS_M); // pushed back out
  });

  it('scrapes along a wall hit at a shallow angle, keeping most of its speed', () => {
    const shallow = 0.25; // ~14° toward the wall
    const r = resolveRider(index, { x: 17, y: 0, heading: shallow, speed: 60 });
    expect(r.crash).toBe(false);
    expect(r.scrape).toBe(true);
    expect(r.heading).toBeCloseTo(0, 6); // now running along the wall (north)
    expect(r.speed).toBeGreaterThan(60 * 0.8);
    expect(r.x).toBeLessThanOrEqual(20 - COLLIDE.RIDER_RADIUS_M + 0.02);
  });

  it('brushing a row of corners barely slows you (friction scales with impact)', () => {
    // Ride north 1 m inside the line of a row of blocks: every corner nicks you
    const row = new BuildingIndex(Array.from({ length: 10 }, (_, i) => square(26, i * 60, 22)));
    let m = { x: 0.2, y: -40, heading: 0, speed: 60 }; // edge just inside the wall line
    let crashes = 0;
    for (let f = 0; f < 600; f++) {
      m = { ...m, x: m.x + Math.sin(m.heading) * m.speed / 60, y: m.y + Math.cos(m.heading) * m.speed / 60 };
      const r = resolveRider(row, m);
      if (r.crash) crashes++;
      m = { x: r.x, y: r.y, heading: r.heading, speed: r.speed };
    }
    expect(crashes).toBe(0);
    expect(m.x).toBeLessThan(0.2);          // nudged off the wall line
    expect(m.speed).toBeGreaterThan(55);    // and kept nearly all its speed
  });

  it('riding straight at a corner face-on is still a crash', () => {
    // Heading east at the block's south-west corner region, square to its west face
    const r = resolveRider(index, { x: 17, y: -18, heading: EAST, speed: 60 });
    expect(r.crash).toBe(true);
  });

  it('works whichever way the footprint is wound', () => {
    const cw = new BuildingIndex([makeFootprint('cw', [20, -20, 20, 20, 60, 20, 60, -20], 30)]);
    expect(resolveRider(cw, { x: 18, y: 0, heading: EAST, speed: 60 }).crash).toBe(true);
    expect(resolveRider(cw, { x: 17, y: 0, heading: 0.25, speed: 60 }).scrape).toBe(true);
  });

  it('a slow square-on bump scrapes instead of crashing', () => {
    const r = resolveRider(index, { x: 18, y: 0, heading: EAST, speed: 10 });
    expect(r.crash).toBe(false);
    expect(r.speed).toBeLessThan(1);
  });

  it('moving away from a wall it touches is not a hit', () => {
    const r = resolveRider(index, { x: 18, y: 0, heading: -EAST, speed: 60 });
    expect(r).toMatchObject({ crash: false, scrape: false, speed: 60 });
  });

  it('clears a low building in the air, but not a tall one', () => {
    // b0,60 is 6 m tall; the jump peaks at 11 m
    expect(collide(index, 0, 60, COLLIDE.RIDER_RADIUS_M, 11)).toBeNull();
    expect(collide(index, 0, 60, COLLIDE.RIDER_RADIUS_M, 0)).not.toBeNull();
    expect(collide(index, 40, 0, COLLIDE.RIDER_RADIUS_M, 11)).not.toBeNull(); // 30 m tower
  });

  it('treats unknown heights as too tall to jump', () => {
    const idx = new BuildingIndex([square(0, 0, 10, null)]);
    expect(collide(idx, 0, 0, COLLIDE.RIDER_RADIUS_M, 50)).not.toBeNull();
  });

  it('does nothing without building data', () => {
    expect(resolveRider(null, { x: 40, y: 0, heading: 0, speed: 60 }).crash).toBe(false);
    expect(isBlocked(null, 40, 0)).toBe(false);
  });

  it('escapes an inside corner (two walls at once)', () => {
    // Two blocks meeting at a right angle: wall at x = 20 and wall at y = 20
    const idx = new BuildingIndex([
      makeFootprint('e', [20, -50, 60, -50, 60, 50, 20, 50], 30),
      makeFootprint('n', [-50, 20, 20, 20, 20, 60, -50, 60], 30),
    ]);
    const r = resolveRider(idx, { x: 18, y: 18, heading: NORTH_EAST, speed: 15 });
    expect(collide(idx, r.x, r.y, COLLIDE.RIDER_RADIUS_M)).toBeNull();
  });
});

describe('camera and spawn helpers', () => {
  it('measures open distance up to the first tall wall', () => {
    // East from the origin, the 30 m block starts at x = 20
    expect(clearDistance(index, 0, 0, 1, 0, 100, 1)).toBe(19);
    // Looking west there's nothing
    expect(clearDistance(index, 0, 0, -1, 0, 100, 1)).toBe(100);
  });

  it('sees over buildings lower than the camera', () => {
    // North is the 6 m block (y = 40..80): it blocks a camera at 4 m, not one at 10 m
    expect(clearDistance(index, 0, 0, 0, 1, 100, 1, 4)).toBe(39);
    expect(clearDistance(index, 0, 0, 0, 1, 100, 1, 10)).toBe(100);
  });

  it('moves a rider who starts inside a building out to open ground', () => {
    const spot = findOpenSpot(index, 40, 0)!;
    expect(spot).not.toBeNull();
    expect(isBlocked(index, spot.x, spot.y, COLLIDE.RIDER_RADIUS_M)).toBe(false);
    // …and leaves a rider who's already clear exactly where they are
    expect(findOpenSpot(index, -30, 0)).toEqual({ x: -30, y: 0 });
  });

  it('points a fresh ride down open road, not into a wall', () => {
    // Facing east at a wall 20 m away: turn to somewhere with a long run
    const h = openHeading(index, 0, 0, EAST);
    expect(clearDistance(index, 0, 0, Math.sin(h), Math.cos(h), 240, 4)).toBeGreaterThan(200);
    // Already facing open road: keep it
    expect(openHeading(index, 0, 0, -EAST)).toBeCloseTo(-EAST);
  });
});
