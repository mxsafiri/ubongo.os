'use client';

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { addCharacterLights } from './runnerModel';
import { UNIT_METERS } from './RunnerLayer';

// Street traffic for Surf Run as real 3D models (KayKit cars and dumpster,
// Kenney's motorbike for bodas) instead of emoji markers. Everything shares
// the riders' scale (UNIT_METERS per model unit) and is drawn in one pass
// around a moving origin, so positions stay precise without a draw setup
// per vehicle.

export type TrafficKind = 'boda' | 'taxi' | 'car' | 'dumpster';

export const TRAFFIC: Record<TrafficKind, {
  url: string;
  lengthU: number;      // longest side, in model units (the rider is 1.8 tall)
  radiusM: number;      // contact radius in meters
  mountable?: boolean;  // ride into it to take it
}> = {
  boda:     { url: '/models/boda.glb',     lengthU: 2.4, radiusM: 8,  mountable: true },
  taxi:     { url: '/models/taxi.glb',     lengthU: 4.3, radiusM: 10 },
  car:      { url: '/models/car.glb',      lengthU: 4.1, radiusM: 10 },
  dumpster: { url: '/models/dumpster.glb', lengthU: 2.0, radiusM: 7 },
};

export interface TrafficView {
  id: number;
  kind: TrafficKind;
  lng: number;
  lat: number;
  heading: number; // rad, clockwise from north
}

export interface TrafficLayer extends mapboxgl.CustomLayerInterface {
  setTraffic(list: TrafficView[]): void;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
function load(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).catch((err) => { cache.delete(url); throw err; });
    cache.set(url, p);
  }
  return p;
}

/** Start fetching the traffic models before the first vehicle is needed. */
export function preloadTraffic() {
  for (const k of Object.keys(TRAFFIC) as TrafficKind[]) load(TRAFFIC[k].url).catch(() => {});
}

export function createTrafficLayer(id: string): TrafficLayer {
  const scene = new THREE.Scene();
  addCharacterLights(scene);
  const items = new Map<number, { obj: THREE.Group; view: TrafficView; ring: THREE.Mesh | null }>();
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#00E096', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
  });
  const ringGeo = new THREE.RingGeometry(1.15, 1.45, 40).rotateX(-Math.PI / 2);
  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;

  const build = (view: TrafficView) => {
    const spec = TRAFFIC[view.kind];
    const obj = new THREE.Group();
    // Mountable bodas glow so they read as "grab me", not "dodge me"
    let ring: THREE.Mesh | null = null;
    if (spec.mountable) {
      ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.03;
      obj.add(ring);
    }
    load(spec.url)
      .then((gltf) => {
        if (!items.has(view.id)) return;
        const model = gltf.scene.clone();
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const s = spec.lengthU / Math.max(size.x, size.z, 1e-3);
        model.scale.setScalar(s);
        model.position.y = -box.min.y * s;
        obj.add(model);
      })
      .catch((err) => console.warn('traffic model unavailable', view.kind, err));
    scene.add(obj);
    return { obj, view, ring };
  };

  return {
    id,
    type: 'custom',
    renderingMode: '3d',

    setTraffic(list) {
      const seen = new Set<number>();
      for (const v of list) {
        seen.add(v.id);
        const e = items.get(v.id);
        if (e) e.view = v;
        else items.set(v.id, build(v));
      }
      for (const [key, e] of items) {
        if (seen.has(key)) continue;
        scene.remove(e.obj);
        items.delete(key);
      }
    },

    onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
      camera = new THREE.Camera();
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },

    onRemove() {
      items.clear();
      ringGeo.dispose();
      ringMat.dispose();
      renderer?.dispose();
      renderer = null;
      camera = null;
    },

    render(_gl: WebGL2RenderingContext, matrix: number[]) {
      if (!renderer || !camera || items.size === 0) return;
      // Everything is placed in model units around the first vehicle
      const first = items.values().next().value!.view;
      const origin = mapboxgl.MercatorCoordinate.fromLngLat([first.lng, first.lat], 0);
      const unit = origin.meterInMercatorCoordinateUnits() * UNIT_METERS; // mercator per model unit
      const t = performance.now() / 1000;
      for (const { obj, view, ring } of items.values()) {
        const m = mapboxgl.MercatorCoordinate.fromLngLat([view.lng, view.lat], 0);
        obj.position.set((m.x - origin.x) / unit, 0, (m.y - origin.y) / unit);
        obj.rotation.y = Math.PI - view.heading; // model +Z → south, as for riders
        if (ring) ring.scale.setScalar(1 + 0.12 * Math.sin(t * 5 + view.id));
      }
      const l = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z ?? 0)
        .scale(new THREE.Vector3(unit, -unit, unit))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      (camera as THREE.Camera & { projectionMatrix: THREE.Matrix4 }).projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}
