'use client';

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { buildCharacter, animateCharacter, addCharacterLights, disposeScene, type CharParts, type RideMode } from './runnerModel';

// Character proportions are in "model units" (~1.8 units tall);
// UNIT_METERS scales one unit to city meters. ~13m tall total — big enough
// to read like a game character against 3D buildings at chase zoom.
export const UNIT_METERS = 7;

export interface RunnerState {
  lng: number;
  lat: number;
  heading: number; // radians, clockwise from north
  speed: number;   // 0..1
  lean: number;    // -1..1 (left/right input, for roll)
  jump: number;    // meters above ground
  mode: RideMode;  // 'board' | 'boda'
}

export interface RunnerLayer extends mapboxgl.CustomLayerInterface {
  setState(s: Partial<RunnerState>): void;
}

/**
 * Three.js custom layer rendering the local player's animated runner
 * inside the Mapbox WebGL scene, depth-tested against 3D buildings.
 */
export function createRunnerLayer(id: string, accentColor: string): RunnerLayer {
  const state: RunnerState = { lng: 0, lat: 0, heading: 0, speed: 0, lean: 0, jump: 0, mode: 'board' };

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.Camera | null = null;
  let parts: CharParts | null = null;
  let smoothHeading = 0;

  const layer: RunnerLayer = {
    id,
    type: 'custom',
    renderingMode: '3d',

    setState(s: Partial<RunnerState>) {
      Object.assign(state, s);
    },

    onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      addCharacterLights(scene);
      parts = buildCharacter(accentColor);
      scene.add(parts.group);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },

    onRemove() {
      if (scene) disposeScene(scene);
      renderer?.dispose();
      renderer = null;
      scene = null;
      camera = null;
      parts = null;
    },

    render(_gl: WebGL2RenderingContext, matrix: number[]) {
      if (!renderer || !scene || !camera || !parts) return;

      const t = performance.now() / 1000;

      // Smooth the heading turn (shortest arc)
      let dh = state.heading - smoothHeading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      smoothHeading += dh * 0.18;

      parts.group.rotation.y = -smoothHeading;
      animateCharacter(parts, t, state.speed, state.lean, state.jump, UNIT_METERS, state.mode);

      const merc = mapboxgl.MercatorCoordinate.fromLngLat([state.lng, state.lat], 0);
      const scale = merc.meterInMercatorCoordinateUnits() * UNIT_METERS;

      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(merc.x, merc.y, merc.z ?? 0)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

      (camera as THREE.Camera & { projectionMatrix: THREE.Matrix4 }).projectionMatrix = m.multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };

  return layer;
}
