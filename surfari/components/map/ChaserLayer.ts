'use client';

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { buildCharacter, animateCharacter, addCharacterLights, disposeCharacter, disposeScene, renderCharacter, type CharParts } from './runnerModel';
import { UNIT_METERS } from './RunnerLayer';

export const CHASER_COLOR = '#E0313B';

export interface ChaserView {
  id: number;
  lng: number;
  lat: number;
  heading: number;   // rad, clockwise from north
  speed01: number;
  ko: boolean;       // knocked off / wiped out — plays the tumble
}

export interface ChaserLayer extends mapboxgl.CustomLayerInterface {
  setChasers(list: ChaserView[]): void;
}

/**
 * ChaserLayer — the rival crew, rendered with the same rig and physics as
 * players but on bodas in rival red, so they read as threats at a glance.
 * Positions come straight from the chase simulation every frame.
 */
export function createChaserLayer(id: string): ChaserLayer {
  const entries = new Map<number, { scene: THREE.Scene; parts: CharParts; view: ChaserView }>();
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;

  const drop = (key: number) => {
    const e = entries.get(key);
    if (!e) return;
    disposeCharacter(e.parts);
    disposeScene(e.scene);
    entries.delete(key);
  };

  return {
    id,
    type: 'custom',
    renderingMode: '3d',

    setChasers(list) {
      const seen = new Set<number>();
      for (const v of list) {
        seen.add(v.id);
        const e = entries.get(v.id);
        if (e) {
          e.view = v;
          continue;
        }
        const scene = new THREE.Scene();
        addCharacterLights(scene);
        const parts = buildCharacter(CHASER_COLOR);
        scene.add(parts.group);
        entries.set(v.id, { scene, parts, view: v });
      }
      for (const key of [...entries.keys()]) if (!seen.has(key)) drop(key);
    },

    onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
      camera = new THREE.Camera();
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },

    onRemove() {
      for (const key of [...entries.keys()]) drop(key);
      renderer?.dispose();
      renderer = null;
      camera = null;
    },

    render(_gl: WebGL2RenderingContext, matrix: number[]) {
      if (!renderer || !camera || entries.size === 0) return;
      const t = performance.now() / 1000;
      const base = new THREE.Matrix4().fromArray(matrix);
      for (const { scene, parts, view } of entries.values()) {
        animateCharacter(parts, {
          t,
          heading: view.heading,
          speed: Math.min(view.speed01, 1),
          jump: 0,
          unitMeters: UNIT_METERS,
          mode: 'boda',
          crashed: view.ko,
        });
        const merc = mapboxgl.MercatorCoordinate.fromLngLat([view.lng, view.lat], 0);
        const scale = merc.meterInMercatorCoordinateUnits() * UNIT_METERS;
        const l = new THREE.Matrix4()
          .makeTranslation(merc.x, merc.y, merc.z ?? 0)
          .scale(new THREE.Vector3(scale, -scale, scale))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        (camera as THREE.Camera & { projectionMatrix: THREE.Matrix4 }).projectionMatrix = base.clone().multiply(l);
        renderCharacter(renderer, scene, camera, parts);
      }
    },
  };
}
