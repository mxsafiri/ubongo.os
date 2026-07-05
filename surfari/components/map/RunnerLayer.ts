'use client';

import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';

// Character proportions are in "model units" (~1.8 units tall);
// UNIT_METERS scales one unit to city meters. ~13m tall total — big enough
// to read like a game character against 3D buildings at chase zoom.
const UNIT_METERS = 7;

export interface RunnerState {
  lng: number;
  lat: number;
  heading: number; // radians, clockwise from north
  speed: number;   // 0..1
  lean: number;    // -1..1 (left/right input, for roll)
  jump: number;    // meters above ground
}

export interface RunnerLayer extends mapboxgl.CustomLayerInterface {
  setState(s: Partial<RunnerState>): void;
}

/**
 * A Three.js custom layer that renders a procedural low-poly runner —
 * board, legs, torso, arms, head, cap — directly inside the Mapbox WebGL
 * scene, depth-tested against 3D buildings. No external model assets, so
 * it always loads. Animated run cycle driven by speed; leans into turns.
 */
export function createRunnerLayer(id: string, accentColor: string): RunnerLayer {
  const state: RunnerState = { lng: 0, lat: 0, heading: 0, speed: 0, lean: 0, jump: 0 };

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.Camera | null = null;
  let charGroup: THREE.Group | null = null;
  let legL: THREE.Mesh | null = null;
  let legR: THREE.Mesh | null = null;
  let armL: THREE.Mesh | null = null;
  let armR: THREE.Mesh | null = null;
  let board: THREE.Mesh | null = null;
  let smoothHeading = 0;

  function buildCharacter(accent: string): THREE.Group {
    const g = new THREE.Group();
    const mat = (c: string | number) => new THREE.MeshLambertMaterial({ color: c });

    // Surfboard — gold deck with a dark stripe
    board = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 2.3), mat('#FFD84D'));
    board.position.y = 0.06;
    g.add(board);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.085, 2.31), mat('#0B0F1C'));
    stripe.position.y = 0.06;
    g.add(stripe);

    // Legs — pivot at the hip (geometry translated so rotation swings from top)
    const legGeo = new THREE.BoxGeometry(0.17, 0.56, 0.17);
    legGeo.translate(0, -0.28, 0);
    legL = new THREE.Mesh(legGeo, mat('#1B2537'));
    legL.position.set(-0.14, 0.78, 0);
    g.add(legL);
    legR = new THREE.Mesh(legGeo.clone(), mat('#1B2537'));
    legR.position.set(0.14, 0.78, 0);
    g.add(legR);

    // Torso — player color
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.28), mat(accent));
    torso.position.y = 1.06;
    g.add(torso);

    // Arms — pivot at the shoulder
    const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
    armGeo.translate(0, -0.25, 0);
    armL = new THREE.Mesh(armGeo, mat('#E8B27D'));
    armL.position.set(-0.3, 1.3, 0);
    g.add(armL);
    armR = new THREE.Mesh(armGeo.clone(), mat('#E8B27D'));
    armR.position.set(0.3, 1.3, 0);
    g.add(armR);

    // Head + cap
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mat('#E8B27D'));
    head.position.y = 1.52;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.36), mat('#FF4757'));
    cap.position.y = 1.7;
    g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.2), mat('#FF4757'));
    brim.position.set(0, 1.66, 0.26);
    g.add(brim);

    // Soft ground shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    g.add(shadow);

    return g;
  }

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

      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
      sun.position.set(1.5, 3, 2);
      scene.add(sun);
      const rim = new THREE.DirectionalLight(0x00c2ff, 0.5);
      rim.position.set(-2, 1.2, -1.5);
      scene.add(rim);

      charGroup = buildCharacter(accentColor);
      scene.add(charGroup);

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },

    onRemove() {
      scene?.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
        }
      });
      renderer?.dispose();
      renderer = null;
      scene = null;
      camera = null;
      charGroup = null;
    },

    render(_gl: WebGL2RenderingContext, matrix: number[]) {
      if (!renderer || !scene || !camera || !charGroup) return;

      const t = performance.now() / 1000;
      const speed = state.speed;

      // Smooth the heading turn (shortest arc)
      let dh = state.heading - smoothHeading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      smoothHeading += dh * 0.18;

      // Facing: model forward is +Z; heading is clockwise-from-north
      charGroup.rotation.y = -smoothHeading;
      // Lean into turns + carve roll
      charGroup.rotation.z = -state.lean * 0.3 * Math.max(speed, 0.3);
      // Pitch forward slightly at speed
      charGroup.rotation.x = speed * 0.12;

      // Run cycle — limbs swing with speed, gentle idle bob otherwise.
      // Mid-air: tuck the legs, throw the arms up, nose the board skyward.
      const airborne = state.jump > 0.4;
      const freq = 4 + speed * 8;
      const swing = Math.sin(t * freq) * (0.25 + speed * 0.75);
      if (legL && legR && armL && armR && board) {
        if (airborne) {
          legL.rotation.x = 0.95;
          legR.rotation.x = 0.75;
          armL.rotation.x = -2.4;
          armR.rotation.x = -2.4;
          board.rotation.z = state.lean * 0.2;
        } else {
          legL.rotation.x = swing * 0.9 * Math.max(speed, 0.12);
          legR.rotation.x = -swing * 0.9 * Math.max(speed, 0.12);
          armL.rotation.x = -swing * 0.7 * Math.max(speed, 0.12);
          armR.rotation.x = swing * 0.7 * Math.max(speed, 0.12);
          board.rotation.z = Math.sin(t * 1.6) * 0.05 + state.lean * 0.12;
        }
      }
      if (airborne) charGroup.rotation.x = -0.18; // nose up off the ramp
      charGroup.position.y =
        state.jump / UNIT_METERS +
        (airborne ? 0 : Math.abs(Math.sin(t * freq)) * 0.07 * speed + Math.sin(t * 1.8) * 0.02);

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
