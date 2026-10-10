// Routes for getting around the real city.
//
// With a Mapbox token, trips follow real streets (Directions API: walking
// for feet, driving for bodas). Without one — offline, tests — they go in a
// straight line. Path helpers are pure and unit-tested.

import { distanceM } from '@/lib/game/places';

export type LngLat = [number, number];

/** Length of a path in meters. */
export function pathLength(path: LngLat[]) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += segLength(path[i - 1], path[i]);
  return d;
}

function segLength(a: LngLat, b: LngLat) {
  return distanceM({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] });
}

/** Point and heading (rad, clockwise from north) `meters` along a path. */
export function pointAlong(path: LngLat[], meters: number): { at: LngLat; heading: number; done: boolean } {
  if (path.length === 1) return { at: path[0], heading: 0, done: true };
  let left = Math.max(0, meters);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const len = segLength(a, b);
    const heading = Math.atan2(
      (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180),
      b[1] - a[1],
    );
    if (left <= len || i === path.length - 1) {
      const k = len > 0 ? Math.min(1, left / len) : 1;
      return { at: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], heading, done: i === path.length - 1 && left >= len };
    }
    left -= len;
  }
  return { at: path[path.length - 1], heading: 0, done: true };
}

/** Real-street route from a to b, or a straight line when routing isn't available. */
export async function fetchRoute(profile: 'walking' | 'driving', a: LngLat, b: LngLat, token?: string): Promise<LngLat[]> {
  if (!token) return [a, b];
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${a[0]},${a[1]};${b[0]},${b[1]}`
      + `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return [a, b];
    const data = await res.json();
    const coords: LngLat[] | undefined = data.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) return [a, b];
    // Start exactly where you stand and end at the door
    return [a, ...coords, b];
  } catch {
    return [a, b];
  }
}
