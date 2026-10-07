import { describe, expect, it } from 'vitest';
import { fetchRoute, pathLength, pointAlong, type LngLat } from '@/lib/map/route';

// About 1.1 km north, then 1.1 km east, near Kariakoo
const A: LngLat = [39.27, -6.82];
const B: LngLat = [39.27, -6.81];
const C: LngLat = [39.28, -6.81];

describe('route helpers', () => {
  it('measures a path', () => {
    expect(pathLength([A, B])).toBeCloseTo(1105.7, 0);
    expect(pathLength([A, B, C])).toBeGreaterThan(2200);
  });

  it('walks along a path, turning at corners', () => {
    const p = pointAlong([A, B, C], 500);
    expect(p.at[0]).toBeCloseTo(39.27);
    expect(p.heading).toBeCloseTo(0); // heading north
    const q = pointAlong([A, B, C], 1500);
    expect(q.heading).toBeCloseTo(Math.PI / 2, 1); // then east
    expect(q.done).toBe(false);
    const end = pointAlong([A, B, C], 99_999);
    expect(end.at).toEqual(C);
    expect(end.done).toBe(true);
  });

  it('falls back to a straight line without a token', async () => {
    expect(await fetchRoute('walking', A, C)).toEqual([A, C]);
  });
});
