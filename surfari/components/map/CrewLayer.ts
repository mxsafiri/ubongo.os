'use client';

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { buildCharacter, animateCharacter, addCharacterLights, disposeCharacter, disposeScene, renderCharacter, type CharParts, type RideMode } from './runnerModel';
import { createTrack, sampleTrack, updateTrack, type Track } from './crewMotion';
import { UNIT_METERS } from './RunnerLayer';

const M_PER_DEG_LAT = 110574;

export interface RemoteRider {
  id: string;
  handle: string;
  color: string;
  lng: number;
  lat: number;
  heading?: number;  // radians, clockwise from north
  speed?: number;    // m/s
  turn?: number;     // rad/s
  mode?: RideMode;
  ageS?: number;     // how stale the fix was when the server answered
}

export interface CrewLayer extends mapboxgl.CustomLayerInterface {
  setPlayers(list: RemoteRider[]): void;
  getPositions(): { id: string; handle: string; color: string; lng: number; lat: number }[];
}

interface Entry {
  handle: string;
  color: string;
  scene: THREE.Scene;
  parts: CharParts;
  track: Track;
  mode: RideMode;
  lng: number;
  lat: number;
}

function metersPerDegLng(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

/**
 * CrewLayer — renders every other live rider as a 3D character. Heartbeats
 * arrive every ~2.5s with position, heading, speed and turn rate; between
 * them each rider is dead-reckoned along their arc and corrections are
 * blended in (see crewMotion), so remote riders move continuously instead
 * of gliding toward stale fixes and stopping.
 */
export function createCrewLayer(id: string): CrewLayer {
  const entries = new Map<string, Entry>();
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;
  // Local metric frame for dead reckoning, anchored on the first rider seen
  let origin: { lng: number; lat: number } | null = null;

  const now = () => performance.now() / 1000;
  const toLocal = (lng: number, lat: number) => ({
    x: (lng - origin!.lng) * metersPerDegLng(origin!.lat),
    y: (lat - origin!.lat) * M_PER_DEG_LAT,
  });
  const toLngLat = (x: number, y: number) => ({
    lng: origin!.lng + x / metersPerDegLng(origin!.lat),
    lat: origin!.lat + y / M_PER_DEG_LAT,
  });

  const layer: CrewLayer = {
    id,
    type: 'custom',
    renderingMode: '3d',

    setPlayers(list: RemoteRider[]) {
      const t = now();
      const seen = new Set<string>();
      for (const p of list) {
        if (!origin) origin = { lng: p.lng, lat: p.lat };
        seen.add(p.id);
        const { x, y } = toLocal(p.lng, p.lat);
        const snap = {
          x, y,
          heading: p.heading ?? 0,
          speed: p.speed ?? 0,
          turn: p.turn,
          ageS: Math.max(0, p.ageS ?? 0),
        };
        const existing = entries.get(p.id);
        if (existing) {
          updateTrack(existing.track, snap, t);
          existing.mode = p.mode ?? 'board';
        } else {
          const scene = new THREE.Scene();
          addCharacterLights(scene);
          const parts = buildCharacter(p.color || '#00C2FF');
          scene.add(parts.group);
          entries.set(p.id, {
            handle: p.handle,
            color: p.color || '#00C2FF',
            scene,
            parts,
            track: createTrack(snap, t),
            mode: p.mode ?? 'board',
            lng: p.lng,
            lat: p.lat,
          });
        }
      }
      for (const [key, entry] of entries) {
        if (!seen.has(key)) {
          disposeCharacter(entry.parts);
          disposeScene(entry.scene);
          entries.delete(key);
        }
      }
    },

    getPositions() {
      return Array.from(entries.entries()).map(([pid, e]) => ({
        id: pid, handle: e.handle, color: e.color, lng: e.lng, lat: e.lat,
      }));
    },

    onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
      camera = new THREE.Camera();
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },

    onRemove() {
      for (const entry of entries.values()) {
        disposeCharacter(entry.parts);
        disposeScene(entry.scene);
      }
      entries.clear();
      renderer?.dispose();
      renderer = null;
      camera = null;
    },

    render(_gl: WebGL2RenderingContext, matrix: number[]) {
      if (!renderer || !camera || entries.size === 0 || !origin) return;
      const t = now();
      const base = new THREE.Matrix4().fromArray(matrix);

      for (const entry of entries.values()) {
        const s = sampleTrack(entry.track, t);
        const ll = toLngLat(s.x, s.y);
        entry.lng = ll.lng;
        entry.lat = ll.lat;

        animateCharacter(entry.parts, {
          t,
          heading: s.heading,
          speed: Math.min(s.speed01, 1),
          jump: 0,
          unitMeters: UNIT_METERS,
          mode: entry.mode,
        });

        const merc = mapboxgl.MercatorCoordinate.fromLngLat([ll.lng, ll.lat], 0);
        const scale = merc.meterInMercatorCoordinateUnits() * UNIT_METERS;
        const l = new THREE.Matrix4()
          .makeTranslation(merc.x, merc.y, merc.z ?? 0)
          .scale(new THREE.Vector3(scale, -scale, scale))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

        (camera as THREE.Camera & { projectionMatrix: THREE.Matrix4 }).projectionMatrix =
          base.clone().multiply(l);
        renderCharacter(renderer, entry.scene, camera, entry.parts);
      }
    },
  };

  return layer;
}
