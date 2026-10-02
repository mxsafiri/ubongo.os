// A token-free map style for local development and automated UI tests.
//
// Production uses Mapbox Standard (needs NEXT_PUBLIC_MAPBOX_TOKEN). Without a
// token the map would never load, so contributors — and our phone-screen
// test rig — couldn't run the game at all. This style draws a dusk ground,
// a street grid and procedurally generated city blocks around Dar's centre,
// tagged so Surf Run treats them as solid buildings. Slots match Standard's
// so the game's layers stack the same way.

import type { StyleSpecification } from 'mapbox-gl';
import { DEFAULT_VIEW } from './style';

export const BUILDINGS_METADATA_KEY = 'surfari:buildings';

const M_PER_DEG_LAT = 110574;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** City blocks on a street grid: ~2.6 km square around the default view. */
function cityBlocks(centerLng: number, centerLat: number) {
  const rnd = mulberry32(1955);
  const mLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  const off = (x: number, y: number): [number, number] => [centerLng + x / mLng, centerLat + y / M_PER_DEG_LAT];
  const BLOCK = 64;     // grid pitch (m)
  const STREET = 20;    // street width (m)
  const HALF = 20;      // blocks each way
  const features: GeoJSON.Feature[] = [];
  for (let i = -HALF; i < HALF; i++) {
    for (let j = -HALF; j < HALF; j++) {
      // Every 5th row/column is a wide avenue
      const x0 = i * BLOCK + (i % 5 === 0 ? STREET : STREET / 2);
      const y0 = j * BLOCK + (j % 5 === 0 ? STREET : STREET / 2);
      const x1 = (i + 1) * BLOCK - STREET / 2;
      const y1 = (j + 1) * BLOCK - STREET / 2;
      // Split some blocks into two buildings for variety
      const split = rnd() < 0.45;
      const parts = split ? [[x0, y0, (x0 + x1) / 2 - 3, y1], [(x0 + x1) / 2 + 3, y0, x1, y1]] : [[x0, y0, x1, y1]];
      for (const [ax, ay, bx, by] of parts) {
        const tall = Math.hypot(ax, ay) < 500 ? 1.8 : 1;
        const height = Math.round((8 + rnd() * 28 + (rnd() < 0.08 ? 40 : 0)) * tall);
        features.push({
          type: 'Feature',
          properties: { height, shade: rnd() },
          geometry: { type: 'Polygon', coordinates: [[off(ax, ay), off(bx, ay), off(bx, by), off(ax, by), off(ax, ay)]] },
        });
      }
    }
  }
  return { type: 'FeatureCollection' as const, features };
}

export function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Surfari offline',
    // Text needs a glyphs URL to validate; offline the fonts 404 and labels go blank
    glyphs: '/fonts/{fontstack}/{range}.pbf',
    sources: {
      'fallback-city': { type: 'geojson', data: cityBlocks(DEFAULT_VIEW.longitude, DEFAULT_VIEW.latitude) },
    },
    layers: [
      { id: 'ground', type: 'background', paint: { 'background-color': '#3A4152' } },
      { id: 'middle', type: 'slot' },
      {
        id: 'fallback-buildings',
        type: 'fill-extrusion',
        source: 'fallback-city',
        metadata: { [BUILDINGS_METADATA_KEY]: true },
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'shade'], 0, '#2A2F3D', 1, '#454C5E'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 1,
        },
      },
      { id: 'top', type: 'slot' },
    ],
  } as StyleSpecification;
}

export const hasMapboxToken = () => !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
