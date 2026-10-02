'use client';

import mapboxgl from 'mapbox-gl';
import { BuildingIndex, makeFootprint, type Footprint } from './collision';

// Feeds building footprints from the live map into a collision index.
//
// On the Mapbox Standard style, buildings live in the imported basemap and
// are reachable through its 'buildings' featureset; on a classic style
// they're fill-extrusion layers built from the 'building' source-layer.
// Either way we read what the map is currently drawing, a few times a
// second, and keep recently seen buildings so walls stay solid after they
// scroll off-screen behind you. If the map has no building data at all,
// the index stays null and riders simply pass through — never a crash.

const REFRESH_MS = 600;
const KEEP_M = 700;              // forget buildings this far from the rider
const MAX_FOOTPRINTS = 6000;

type LngLat = { lng: number; lat: number };
type Geometry = { type: string; coordinates: unknown };
type Feature = { id?: string | number; geometry: Geometry; properties?: Record<string, unknown> | null };

export interface BuildingSource {
  /** Current index (null until buildings are known, or if the map has none). */
  readonly index: BuildingIndex | null;
  readonly mode: 'featureset' | 'layers' | 'none' | 'pending';
  update(rider: LngLat, nowMs: number): void;
}

export function createBuildingSource(
  map: mapboxgl.Map,
  toLocal: (p: LngLat) => { x: number; y: number },
  opts: { layerIds?: string[] } = {},
): BuildingSource {
  const cache = new Map<string, Footprint>();
  let index: BuildingIndex | null = null;
  let mode: BuildingSource['mode'] = 'pending';
  let lastMs = -Infinity;
  let featuresetFailed = false;

  const hasBasemap = () => !!map.getStyle()?.imports?.some((i) => i.id === 'basemap');

  const buildingLayers = () => {
    if (opts.layerIds) return opts.layerIds.filter((id) => map.getLayer(id));
    return (map.getStyle()?.layers ?? [])
      .filter((l) => l.type === 'fill-extrusion' && (l as { 'source-layer'?: string })['source-layer'] === 'building')
      .map((l) => l.id);
  };

  const query = (): Feature[] | null => {
    if (hasBasemap() && !featuresetFailed) {
      try {
        const feats = map.queryRenderedFeatures({ target: { featuresetId: 'buildings', importId: 'basemap' } });
        mode = 'featureset';
        return feats as unknown as Feature[];
      } catch (err) {
        featuresetFailed = true; // style without that featureset: fall back to layers
        console.warn('buildings featureset unavailable', err);
      }
    }
    const layers = buildingLayers();
    if (layers.length === 0) {
      mode = 'none';
      return null;
    }
    mode = 'layers';
    return map.queryRenderedFeatures({ layers }) as unknown as Feature[];
  };

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  const ingest = (f: Feature) => {
    const g = f.geometry;
    if (!g) return;
    const polys: number[][][][] =
      g.type === 'Polygon' ? [g.coordinates as number[][][]]
      : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][])
      : [];
    const props = f.properties ?? {};
    const height = num(props.height) ?? num(props.render_height) ?? null;
    for (const poly of polys) {
      const outer = poly[0];
      if (!outer || outer.length < 4) continue;
      const ring: number[] = [];
      for (const [lng, lat] of outer) {
        const p = toLocal({ lng, lat });
        ring.push(p.x, p.y);
      }
      // Tile-clipped pieces share an id, so key on the geometry too
      const key = `${f.id ?? ''}:${Math.round(ring[0])},${Math.round(ring[1])}:${ring.length}`;
      if (!cache.has(key)) cache.set(key, makeFootprint(key, ring, height));
    }
  };

  return {
    get index() { return index; },
    get mode() { return mode; },

    update(rider, nowMs) {
      if (nowMs - lastMs < REFRESH_MS || mode === 'none') return;
      lastMs = nowMs;
      let feats: Feature[] | null;
      try {
        feats = query();
      } catch (err) {
        console.warn('building query failed', err);
        return;
      }
      if (!feats) return;
      const before = cache.size;
      for (const f of feats) ingest(f);

      // Forget what's far behind, and cap memory
      const me = toLocal(rider);
      let dropped = 0;
      for (const [k, fp] of cache) {
        const cx = (fp.minX + fp.maxX) / 2;
        const cy = (fp.minY + fp.maxY) / 2;
        if (Math.hypot(cx - me.x, cy - me.y) > KEEP_M || cache.size > MAX_FOOTPRINTS) {
          cache.delete(k);
          dropped++;
        }
      }
      if (cache.size !== before || dropped > 0 || !index) index = cache.size ? new BuildingIndex([...cache.values()]) : null;
    },
  };
}
