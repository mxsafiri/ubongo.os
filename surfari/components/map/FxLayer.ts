'use client';

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';

// Particle effects for Surf Run, drawn inside the 3D city so buildings hide
// them: sparks when you scrape a wall, dust when you land, bursts when you
// grab coins or knock a rival off. One pooled point cloud, one draw call.
// Positions are local meters around the run's origin (x east, y north),
// the same frame the game logic uses.

const MAX = 480;
const GRAVITY = 22; // m/s² — a touch heavier than real, reads snappier

type Blend = 'add' | 'soft';

export interface FxLayer extends mapboxgl.CustomLayerInterface {
  /** Sparks spraying off a wall at (x, y) whose outward normal is (nx, ny). */
  sparks(x: number, y: number, nx: number, ny: number, heading: number, speed: number): void;
  /** A ring of dust kicked up at (x, y). */
  dust(x: number, y: number, amount?: number): void;
  /** A celebratory burst at (x, y), `h` meters up. */
  burst(x: number, y: number, h: number, color: string, count?: number): void;
}

export function createFxLayer(id: string, origin: { lng: number; lat: number }): FxLayer {
  // Per-particle state (struct of arrays)
  const pos = new Float32Array(MAX * 3);   // x east, y up, z south (layer frame)
  const vel = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 4);   // rgb + alpha
  const size = new Float32Array(MAX);      // meters
  const life = new Float32Array(MAX);      // seconds left
  const maxLife = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  const grav = new Float32Array(MAX);
  const baseAlpha = new Float32Array(MAX);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('color', colAttr);
  geo.setAttribute('size', sizeAttr);

  const uniforms = { uScale: { value: 1 } };
  const material = (blend: Blend) => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute vec4 color;
      attribute float size;
      uniform float uScale;
      varying vec4 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = color.a <= 0.0 ? 0.0 : clamp(size * uScale / gl_Position.w, 1.0, 96.0);
      }`,
    fragmentShader: `
      varying vec4 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = vColor.a * smoothstep(1.0, 0.25, d);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor.rgb, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, material('add'));
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);

  const merc = mapboxgl.MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0);
  const m = merc.meterInMercatorCoordinateUnits();
  const layerMatrix = new THREE.Matrix4()
    .makeTranslation(merc.x, merc.y, merc.z ?? 0)
    .scale(new THREE.Vector3(m, -m, m))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

  let renderer: THREE.WebGLRenderer | null = null;
  let camera: THREE.Camera | null = null;
  let map: mapboxgl.Map | null = null;
  let lastT = -1;
  let alive = 0;
  const tmpColor = new THREE.Color();

  const spawn = (
    x: number, y: number, h: number,
    vx: number, vy: number, vz: number,
    color: string, alpha: number, sizeM: number, lifeS: number, dragK: number, gravK: number,
  ) => {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    // Layer frame: +x east, +y up, +z south — game y (north) is −z
    pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = -y;
    vel[i * 3] = vx; vel[i * 3 + 1] = vz; vel[i * 3 + 2] = -vy;
    tmpColor.set(color);
    col[i * 4] = tmpColor.r; col[i * 4 + 1] = tmpColor.g; col[i * 4 + 2] = tmpColor.b; col[i * 4 + 3] = alpha;
    baseAlpha[i] = alpha;
    size[i] = sizeM;
    life[i] = maxLife[i] = lifeS;
    drag[i] = dragK;
    grav[i] = gravK;
  };

  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  const step = (dt: number) => {
    alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { col[i * 4 + 3] = 0; continue; }
      alive++;
      const k = Math.exp(-drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 2] *= k;
      vel[i * 3 + 1] = vel[i * 3 + 1] * k - GRAVITY * grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = life[i] / maxLife[i];
      col[i * 4 + 3] = baseAlpha[i] * Math.min(1, t * 2.2); // hold, then fade
    }
  };

  return {
    id,
    type: 'custom',
    renderingMode: '3d',

    sparks(x, y, nx, ny, heading, speed) {
      // Along the wall in the direction of travel, plus a kick off it
      const tx = Math.sin(heading), ty = Math.cos(heading);
      const n = Math.round(16 + Math.min(speed, 60) * 0.35);
      for (let j = 0; j < n; j++) {
        const along = rand(0.3, 0.9) * speed;
        const off = rand(2, 9);
        spawn(x, y, rand(0.5, 2.5),
          tx * along + nx * off + rand(-3, 3), ty * along + ny * off + rand(-3, 3), rand(3, 11),
          Math.random() < 0.5 ? '#FFE27A' : '#FF9A3D', 1, rand(1.0, 1.8), rand(0.3, 0.55), 1.5, 1);
      }
    },

    dust(x, y, amount = 1) {
      const n = Math.round(18 * amount);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + rand(-0.2, 0.2);
        const sp = rand(5, 11) * amount;
        spawn(x + Math.sin(a) * 1.5, y + Math.cos(a) * 1.5, rand(0.2, 0.8),
          Math.sin(a) * sp, Math.cos(a) * sp, rand(0.5, 3),
          '#C9B8A0', 0.32, rand(2, 3.6), rand(0.5, 0.9), 3.2, 0.15);
      }
    },

    burst(x, y, h, color, count = 18) {
      for (let j = 0; j < count; j++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(4, 13);
        spawn(x, y, h, Math.sin(a) * sp, Math.cos(a) * sp, rand(4, 14), color, 1, rand(0.6, 1.2), rand(0.45, 0.8), 1.8, 0.8);
      }
    },

    onAdd(m: mapboxgl.Map, gl: WebGL2RenderingContext) {
      map = m;
      camera = new THREE.Camera();
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },

    onRemove() {
      geo.dispose();
      (points.material as THREE.Material).dispose();
      renderer?.dispose();
      renderer = null;
      camera = null;
      map = null;
    },

    render(gl: WebGL2RenderingContext, matrix: number[]) {
      if (!renderer || !camera || !map) return;
      const now = performance.now() / 1000;
      const dt = lastT < 0 ? 0 : Math.min(now - lastT, 0.1);
      lastT = now;
      step(dt);
      if (alive === 0) return;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;

      const proj = new THREE.Matrix4().fromArray(matrix).multiply(layerMatrix);
      (camera as THREE.Camera & { projectionMatrix: THREE.Matrix4 }).projectionMatrix = proj;

      // Point sprites need a pixels-per-meter scale: measure how big one
      // meter looks at the screen centre's ground point, times its depth
      const c = map.getCenter();
      const cm = mapboxgl.MercatorCoordinate.fromLngLat([c.lng, c.lat], 0);
      const lx = (cm.x - merc.x) / m, lz = (cm.y - merc.y) / m;
      const a = new THREE.Vector4(lx, 0, lz, 1).applyMatrix4(proj);
      const b = new THREE.Vector4(lx + 1, 0, lz, 1).applyMatrix4(proj);
      const pxPerM = Math.hypot(
        (b.x / b.w - a.x / a.w) * 0.5 * gl.drawingBufferWidth,
        (b.y / b.w - a.y / a.w) * 0.5 * gl.drawingBufferHeight,
      );
      uniforms.uScale.value = pxPerM * a.w;

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
  };
}
