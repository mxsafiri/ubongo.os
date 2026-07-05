'use client';

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { buildCharacter, animateCharacter, addCharacterLights, disposeScene, type CharParts } from './runnerModel';
import { UNIT_METERS } from './RunnerLayer';

const M_PER_DEG_LAT = 110574;
const SNAP_M = 400;       // beyond this, teleport instead of glide
const CATCHUP_K = 0.09;   // per-frame lerp toward the last heartbeat position

export interface RemoteRider {
  id: string;
  handle: string;
  color: string;
  lng: number;
  lat: number;
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
  cur: { lng: number; lat: number };
  target: { lng: number; lat: number };
  heading: number;
  speed: number;
}

function metersPerDegLng(lat: number) {
  return 111320 * Math.cos((lat * Math.PI) / 180);
}

/**
 * CrewLayer — renders every other live rider as a 3D character. Heartbeats
 * arrive every ~2.5s; positions glide toward the latest fix each frame so
 * remote runners move smoothly and their run cycle animates while closing
 * the gap.
 */
export function createCrewLayer(id: string): CrewLayer {
  const entries = new Map<string, Entry>();
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;

  const layer: CrewLayer = {
    id,
    type: 'custom',
    renderingMode: '3d',

    setPlayers(list: RemoteRider[]) {
      const seen = new Set<string>();
      for (const p of list) {
        seen.add(p.id);
        const existing = entries.get(p.id);
        if (existing) {
          existing.target = { lng: p.lng, lat: p.lat };
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
            cur: { lng: p.lng, lat: p.lat },
            target: { lng: p.lng, lat: p.lat },
            heading: 0,
            speed: 0,
          });
        }
      }
      // Riders who went offline
      for (const [key, entry] of entries) {
        if (!seen.has(key)) {
          disposeScene(entry.scene);
          entries.delete(key);
        }
      }
    },

    getPositions() {
      return Array.from(entries.entries()).map(([pid, e]) => ({
        id: pid, handle: e.handle, color: e.color, lng: e.cur.lng, lat: e.cur.lat,
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
      for (const entry of entries.values()) disposeScene(entry.scene);
      entries.clear();
      renderer?.dispose();
      renderer = null;
      camera = null;
    },

    render(_gl: WebGL2RenderingContext, matrix: number[]) {
      if (!renderer || !camera || entries.size === 0) return;
      const t = performance.now() / 1000;
      const base = new THREE.Matrix4().fromArray(matrix);

      for (const entry of entries.values()) {
        // Glide toward the latest heartbeat fix
        const dLngM = (entry.target.lng - entry.cur.lng) * metersPerDegLng(entry.cur.lat);
        const dLatM = (entry.target.lat - entry.cur.lat) * M_PER_DEG_LAT;
        const gap = Math.hypot(dLngM, dLatM);

        if (gap > SNAP_M) {
          entry.cur = { ...entry.target };
          entry.speed = 0;
        } else if (gap > 0.5) {
          entry.cur.lng += (entry.target.lng - entry.cur.lng) * CATCHUP_K;
          entry.cur.lat += (entry.target.lat - entry.cur.lat) * CATCHUP_K;
          const targetHeading = Math.atan2(dLngM, dLatM);
          let dh = targetHeading - entry.heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          entry.heading += dh * 0.15;
          entry.speed = Math.min(gap / 40, 1);
        } else {
          entry.speed *= 0.9; // ease back to idle
        }

        entry.parts.group.rotation.y = -entry.heading;
        animateCharacter(entry.parts, t, entry.speed, 0, 0, UNIT_METERS);

        const merc = mapboxgl.MercatorCoordinate.fromLngLat([entry.cur.lng, entry.cur.lat], 0);
        const scale = merc.meterInMercatorCoordinateUnits() * UNIT_METERS;
        const l = new THREE.Matrix4()
          .makeTranslation(merc.x, merc.y, merc.z ?? 0)
          .scale(new THREE.Vector3(scale, -scale, scale))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

        (camera as THREE.Camera & { projectionMatrix: THREE.Matrix4 }).projectionMatrix =
          base.clone().multiply(l);
        renderer.resetState();
        renderer.render(entry.scene, camera);
      }
    },
  };

  return layer;
}
