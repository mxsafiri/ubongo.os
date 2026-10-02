'use client';

import mapboxgl from 'mapbox-gl';
import { clamp, damp, noise1, wrapAngle } from '@/lib/game/motion';

const M_PER_DEG_LAT = 110574;
const metersPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

type LngLat = { lng: number; lat: number };

/**
 * Where ground effects (wake, whip wedge) go: in the Standard style's
 * 'middle' slot — under the 3D riders — or, on a style without slots,
 * directly beneath the rider layer so they never paint over characters.
 */
function groundPlacement(map: mapboxgl.Map): { slot: { slot?: string }; before?: string } {
  if (map.getStyle()?.imports?.length) return { slot: { slot: 'middle' } };
  return { slot: {}, before: map.getLayer('player-runner') ? 'player-runner' : undefined };
}

/* ── Chase camera ───────────────────────────────────────────────────────
   Street-level framing: low behind the rider, looking down the street,
   with the rider in the upper-middle of the screen (clear of the thumbs).
   It pulls back and looks further ahead with speed, swings its aim into
   turns, rises with jumps and shakes on impacts (trauma model: shake =
   trauma², decaying over time). When a building would come between the
   camera and the rider, the camera slides in closer instead of going
   through the wall. */

const CAM_BACK_M = 36;
const CAM_ALT_M = 14;
const LOOK_AHEAD_M = 20;
const SPEED_BACK_M = 10;      // extra pull-back at top speed
const SPEED_ALT_M = 3;        // extra height at top speed
const SPEED_AHEAD_M = 16;     // extra look-ahead at top speed
const TURN_AIM_M = 14;        // aim offset into a full-lock turn
const MIN_BACK_M = 9;         // closest the camera comes when boxed in by walls
const POS_RATE = 3.2;
const TGT_RATE = 6.0;
const BACK_OUT_RATE = 1.6;    // ease back out once the wall has passed
const TRAUMA_DECAY = 1.5;     // per second
const SHAKE_M = 3;            // max positional shake

/** Free distance behind the rider (m) along `heading + π`, capped at `maxBack`, for a camera at `alt`. */
export type CameraClearance = (p: LngLat, heading: number, maxBack: number, alt: number) => number;

export class ChaseCamera {
  pos: LngLat = { lng: 0, lat: 0 };
  tgt: LngLat = { lng: 0, lat: 0 };
  alt = CAM_ALT_M;
  /** Yaw the camera is actually looking along. */
  yaw = 0;
  private clearance: CameraClearance | null = null;
  private speedK = 0;
  private turnK = 0;
  private trauma = 0;
  private lastHeading = 0;
  private backK = 1;            // share of the full back distance currently allowed

  private desired(p: LngLat, heading: number, jumpM: number) {
    const mLng = metersPerDegLng(p.lat);
    const fx = Math.sin(heading);
    const fy = Math.cos(heading);
    const back = (CAM_BACK_M + SPEED_BACK_M * this.speedK) * this.backK;
    const ahead = LOOK_AHEAD_M + SPEED_AHEAD_M * this.speedK;
    const side = TURN_AIM_M * this.turnK; // +right
    // Boxed in: come down with the camera so the angle onto the rider holds
    const alt = Math.max(5, (CAM_ALT_M + SPEED_ALT_M * this.speedK) * (0.4 + 0.6 * this.backK));
    return {
      pos: { lng: p.lng - (fx * back) / mLng, lat: p.lat - (fy * back) / M_PER_DEG_LAT },
      tgt: {
        lng: p.lng + (fx * ahead + fy * side) / mLng,
        lat: p.lat + (fy * ahead - fx * side) / M_PER_DEG_LAT,
      },
      alt: alt + jumpM * 0.45,
    };
  }

  private allowedBackK(p: LngLat, heading: number) {
    if (!this.clearance) return 1;
    const full = CAM_BACK_M + SPEED_BACK_M * this.speedK;
    const free = this.clearance(p, heading, full, CAM_ALT_M + SPEED_ALT_M * this.speedK);
    return clamp(Math.max(free - 2, MIN_BACK_M) / full, MIN_BACK_M / full, 1);
  }

  /** Give the camera a way to see walls, so it never ends up inside one. */
  setClearance(fn: CameraClearance | null) {
    this.clearance = fn;
  }

  /** Jump straight to the framing — the one-tap answer to "where am I?" */
  snap(p: LngLat, heading: number) {
    this.backK = this.allowedBackK(p, heading);
    const d = this.desired(p, heading, 0);
    this.pos = d.pos;
    this.tgt = d.tgt;
    this.alt = d.alt;
    this.yaw = heading;
    this.lastHeading = heading;
  }

  addTrauma(amount: number) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Hold a floor of shake (engine judder) without stacking. */
  rumble(level: number) {
    this.trauma = Math.max(this.trauma, level);
  }

  update(map: mapboxgl.Map, p: LngLat, heading: number, speed01: number, jumpM: number, dt: number, t: number) {
    const yawRate = dt > 0 ? wrapAngle(heading - this.lastHeading) / dt : 0;
    this.lastHeading = heading;
    this.speedK = damp(this.speedK, clamp(speed01, 0, 1.2), 1.8, dt);
    this.turnK = damp(this.turnK, clamp(yawRate * speed01 * 0.5, -1, 1), 3, dt);
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);

    // Walls behind: pull in at once (never clip through), ease back out
    const allowed = this.allowedBackK(p, heading);
    this.backK = allowed < this.backK ? allowed : damp(this.backK, allowed, BACK_OUT_RATE, dt);

    const d = this.desired(p, heading, jumpM);
    const kc = 1 - Math.exp(-POS_RATE * dt);
    const kt = 1 - Math.exp(-TGT_RATE * dt);
    this.pos.lng += (d.pos.lng - this.pos.lng) * kc;
    this.pos.lat += (d.pos.lat - this.pos.lat) * kc;
    this.tgt.lng += (d.tgt.lng - this.tgt.lng) * kt;
    this.tgt.lat += (d.tgt.lat - this.tgt.lat) * kt;
    this.alt = damp(this.alt, d.alt, POS_RATE, dt);

    const mLng = metersPerDegLng(this.pos.lat);
    this.yaw = Math.atan2((this.tgt.lng - this.pos.lng) * mLng, (this.tgt.lat - this.pos.lat) * M_PER_DEG_LAT);

    // Shake: perpendicular + vertical jitter, never accumulated into pos
    const shake = this.trauma * this.trauma * SHAKE_M;
    const sx = noise1(t * 17, 1.3) * shake;
    const sz = noise1(t * 19, 4.1) * shake * 0.6;
    const rx = Math.cos(this.yaw);
    const ry = -Math.sin(this.yaw);
    const camLngLat: [number, number] = [
      this.pos.lng + (rx * sx) / mLng,
      this.pos.lat + (ry * sx) / M_PER_DEG_LAT,
    ];

    const cam = map.getFreeCameraOptions();
    cam.position = mapboxgl.MercatorCoordinate.fromLngLat(camLngLat, Math.max(2, this.alt + sz));
    cam.lookAtPoint([this.tgt.lng, this.tgt.lat]);
    map.setFreeCameraOptions(cam);
  }
}

/* ── Board wake ─────────────────────────────────────────────────────────
   A short glowing ribbon traced behind the board, fading toward the tail. */

const WAKE_SRC = 'run-wake';
const WAKE_LAYERS = ['run-wake-glow', 'run-wake-core'];
const WAKE_POINTS = 48;
const WAKE_SPACING_M = 4;

export interface Wake {
  push(p: LngLat, speed01: number): void;
  clear(): void;
  remove(): void;
}

export function createWake(map: mapboxgl.Map, color = '#00C2FF'): Wake {
  const pts: [number, number][] = [];   // committed samples, oldest first
  let head: [number, number] | null = null; // live board position
  let intensity = 0;

  const empty = { type: 'FeatureCollection' as const, features: [] };
  if (!map.getSource(WAKE_SRC)) {
    map.addSource(WAKE_SRC, { type: 'geojson', data: empty, lineMetrics: true });
    // Slot only exists on the Mapbox Standard style
    const { slot, before } = groundPlacement(map);
    map.addLayer({
      id: WAKE_LAYERS[0], type: 'line', source: WAKE_SRC, ...slot,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 8, 18, 34],
        'line-blur': 5,
        'line-emissive-strength': 1,
        'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0)', 1, color],
        'line-opacity': 0,
      },
    } as mapboxgl.LayerSpecification, before);
    map.addLayer({
      id: WAKE_LAYERS[1], type: 'line', source: WAKE_SRC, ...slot,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 8],
        'line-emissive-strength': 1,
        'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255,255,255,0)', 1, 'rgba(255,255,255,0.95)'],
        'line-opacity': 0,
      },
    } as mapboxgl.LayerSpecification, before);
  }

  const sync = () => {
    const src = map.getSource(WAKE_SRC) as mapboxgl.GeoJSONSource | undefined;
    const coords = head ? [...pts, head] : pts;
    src?.setData(coords.length < 2 ? empty : {
      type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords },
    });
    if (map.getLayer(WAKE_LAYERS[0])) map.setPaintProperty(WAKE_LAYERS[0], 'line-opacity', 0.75 * intensity);
    if (map.getLayer(WAKE_LAYERS[1])) map.setPaintProperty(WAKE_LAYERS[1], 'line-opacity', intensity);
  };

  return {
    push(p, speed01) {
      intensity = clamp((speed01 - 0.15) / 0.6, 0, 1);
      head = [p.lng, p.lat];
      const last = pts[pts.length - 1];
      const d = last
        ? Math.hypot((p.lng - last[0]) * metersPerDegLng(p.lat), (p.lat - last[1]) * M_PER_DEG_LAT)
        : Infinity;
      if (last && d > 150) pts.length = 0; // teleport / recenter: start fresh
      if (d >= WAKE_SPACING_M) {
        pts.push(head);
        if (pts.length > WAKE_POINTS) pts.shift();
      }
      sync(); // the head moves every call, so the ribbon stays glued to the board
    },
    clear() {
      pts.length = 0;
      head = null;
      sync();
    },
    remove() {
      for (const id of WAKE_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(WAKE_SRC)) map.removeSource(WAKE_SRC);
    },
  };
}

/* ── Whip shockwave ─────────────────────────────────────────────────────
   A red wedge sweeping out behind the rider to the whip's exact reach, so
   players can read where (and how far) the strike lands. */

const SHOCK_SRC = 'run-shock';
const SHOCK_LAYERS = ['run-shock-fill', 'run-shock-edge'];
const SHOCK_MS = 380;

export interface Shockwave {
  trigger(p: LngLat, heading: number): void;
  update(nowMs: number): void;
  remove(): void;
}

export function createShockwave(map: mapboxgl.Map, reachM: number, halfAngle: number, color = '#FF4757'): Shockwave {
  let origin: LngLat | null = null;
  let heading = 0;
  let startMs = -Infinity;
  let visible = false;

  const empty = { type: 'FeatureCollection' as const, features: [] };
  if (!map.getSource(SHOCK_SRC)) {
    map.addSource(SHOCK_SRC, { type: 'geojson', data: empty });
    const { slot, before } = groundPlacement(map);
    map.addLayer({
      id: SHOCK_LAYERS[0], type: 'fill', source: SHOCK_SRC, ...slot,
      paint: { 'fill-color': color, 'fill-opacity': 0, 'fill-emissive-strength': 1 },
    } as mapboxgl.LayerSpecification, before);
    map.addLayer({
      id: SHOCK_LAYERS[1], type: 'line', source: SHOCK_SRC, ...slot,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#FFD0D4', 'line-width': 4, 'line-blur': 1.5, 'line-opacity': 0, 'line-emissive-strength': 1 },
    } as mapboxgl.LayerSpecification, before);
  }

  // Wedge behind the rider: apex at the rider, arc at radius r
  const wedge = (o: LngLat, r: number) => {
    const mLng = metersPerDegLng(o.lat);
    const back = heading + Math.PI;
    const ring: [number, number][] = [[o.lng, o.lat]];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const a = back - halfAngle + (2 * halfAngle * i) / steps;
      ring.push([o.lng + (Math.sin(a) * r) / mLng, o.lat + (Math.cos(a) * r) / M_PER_DEG_LAT]);
    }
    ring.push([o.lng, o.lat]);
    return ring;
  };

  return {
    trigger(p, h) {
      origin = { ...p };
      heading = h;
      startMs = performance.now();
      visible = true;
    },
    update(nowMs) {
      if (!visible || !origin) return;
      const k = (nowMs - startMs) / SHOCK_MS;
      const src = map.getSource(SHOCK_SRC) as mapboxgl.GeoJSONSource | undefined;
      if (k >= 1) {
        visible = false;
        src?.setData(empty);
        return;
      }
      const ease = 1 - (1 - k) * (1 - k) * (1 - k); // fast out, settling at full reach
      const ring = wedge(origin, Math.max(reachM * ease, 2));
      src?.setData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } },
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring.slice(1, -1) } },
        ],
      });
      const fade = 1 - k;
      if (map.getLayer(SHOCK_LAYERS[0])) map.setPaintProperty(SHOCK_LAYERS[0], 'fill-opacity', 0.45 * fade);
      if (map.getLayer(SHOCK_LAYERS[1])) map.setPaintProperty(SHOCK_LAYERS[1], 'line-opacity', fade);
    },
    remove() {
      for (const id of SHOCK_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SHOCK_SRC)) map.removeSource(SHOCK_SRC);
    },
  };
}
