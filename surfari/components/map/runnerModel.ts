'use client';

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Shared runner model — used by RunnerLayer (the local player) and
// CrewLayer (remote riders). ~1.8 model units tall.
//
// The character is a rigged, animated glTF (public/models/runner.glb, CC0)
// driven by a small animation state machine with crossfades. Until the
// model has loaded — or if it never does — a procedural stand-in is shown,
// so a rider is never invisible.

export type RideMode = 'board' | 'boda';

export const RUNNER_MODEL_URL = '/models/runner.glb';
const RIG_HEIGHT = 1.8;        // model units, matches the procedural stand-in
const BOARD_TOP = 0.1;         // feet rest on the deck
const BODA_SEAT = 0.42;        // hip drop so the rider sits on the seat
const CROSSFADE_S = 0.18;
const SURF_STANCE = Math.PI * 0.42;  // sideways on the deck, like a real surfer

type Clip = 'Idle' | 'Surf' | 'Jump' | 'Crash' | 'Ride';

// Which clip in the model plays each state, and how
const CLIPS: Record<Clip, { name: string; once?: boolean }> = {
  Idle:  { name: 'Idle' },
  Surf:  { name: 'Idle' },              // stance + arm pose is layered on top
  Jump:  { name: 'Jump', once: true },
  Crash: { name: 'Death', once: true },
  Ride:  { name: 'Sitting', once: true },
};

interface Rig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<Clip, THREE.AnimationAction>;
  state: Clip | null;
  stance: number;                       // current yaw offset (radians)
  arms: { l: THREE.Object3D | null; r: THREE.Object3D | null };
  armSpread: number;                    // 0..1, eased toward the target pose
}

interface Fallback {
  root: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
}

export interface CharParts {
  group: THREE.Group;        // layers place and turn this (heading)
  body: THREE.Group;         // jump height, lean and tilt live here
  fallback: Fallback;
  rig: Rig | null;
  board: THREE.Mesh;
  boardStripe: THREE.Mesh;
  boda: THREE.Group;
  wheels: THREE.Mesh[];
  lastT: number;
  disposed: boolean;
}

/* ── Model loading (once per page) ── */

let modelPromise: Promise<GLTF> | null = null;

export function loadRunnerModel(): Promise<GLTF> {
  if (!modelPromise) {
    modelPromise = new GLTFLoader().loadAsync(RUNNER_MODEL_URL).catch((err) => {
      modelPromise = null; // allow a later retry
      throw err;
    });
  }
  return modelPromise;
}

function attachRig(parts: CharParts, gltf: GLTF, accent: string) {
  if (parts.disposed || parts.rig) return;

  const root = cloneSkinned(gltf.scene);

  // Auto-scale to RIG_HEIGHT and stand the feet at y=0. Precise bounds:
  // the armature is scaled ×100, which inflates the cheap skinned AABB.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const h = box.max.y - box.min.y || 1;
  const s = RIG_HEIGHT / h;
  root.scale.setScalar(s);
  root.position.y = -box.min.y * s;

  // Per-rider materials: tint the body in the rider's colour. Geometry is
  // shared with the cached source model, so it's flagged to survive disposal.
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.userData.sharedGeometry = true;
    mesh.frustumCulled = false; // skinned bounds don't follow the animation
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const c = (m as THREE.MeshStandardMaterial).clone();
      if (c.name === 'Main') c.color.set(accent);
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
  });

  const mixer = new THREE.AnimationMixer(root);
  const byName = new Map(gltf.animations.map((c) => [c.name, c]));
  const actions = {} as Record<Clip, THREE.AnimationAction>;
  for (const [clip, spec] of Object.entries(CLIPS) as [Clip, (typeof CLIPS)[Clip]][]) {
    const source = byName.get(spec.name);
    if (!source) return; // unexpected model — keep the stand-in
    const action = mixer.clipAction(source.clone(), root);
    if (spec.once) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[clip] = action;
  }

  parts.rig = {
    root,
    mixer,
    actions,
    state: null,
    stance: 0,
    arms: { l: root.getObjectByName('ShoulderL') ?? null, r: root.getObjectByName('ShoulderR') ?? null },
    armSpread: 0,
  };
  parts.fallback.root.visible = false;
  parts.body.add(root);
  setClip(parts.rig, 'Idle');
}

/* ── Animation state machine (crossfaded, priority-ordered) ── */

function setClip(rig: Rig, next: Clip) {
  const prev = rig.state;
  if (prev === next) return;
  const to = rig.actions[next];
  const from = prev ? rig.actions[prev] : null;
  to.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  if (from && prev && CLIPS[prev].name === CLIPS[next].name) {
    // Idle ↔ Surf share a clip: carry the playhead over so nothing pops
    to.time = from.time;
    from.stop();
  } else if (from) {
    to.crossFadeFrom(from, CROSSFADE_S, false);
  }
  rig.state = next;
}

function pickClip(speed: number, airborne: boolean, mode: RideMode, crashed: boolean): Clip {
  if (crashed) return 'Crash';           // 1. hit reaction blocks everything
  if (mode === 'boda') return 'Ride';    // 2. mounted
  if (airborne) return 'Jump';           // 3. in the air
  return speed > 0.08 ? 'Surf' : 'Idle'; // 4. on the deck
}

/* ── Build ── */

export function buildCharacter(accent: string): CharParts {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const mat = (c: string | number) => new THREE.MeshLambertMaterial({ color: c });

  // Surfboard — gold deck with a dark stripe
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 2.3), mat('#FFD84D'));
  board.position.y = 0.06;
  body.add(board);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.085, 2.31), mat('#0B0F1C'));
  stripe.position.y = 0.06;
  body.add(stripe);

  const fallback = buildFallback(accent, mat);
  body.add(fallback.root);

  // Boda boda — hidden until mounted. Frame, seat, tank, two wheels, bars.
  const boda = new THREE.Group();
  const bodaBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 1.5), mat('#E85A20'));
  bodaBody.position.y = 0.52;
  boda.add(bodaBody);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.62), mat('#0B0F1C'));
  seat.position.set(0, 0.69, -0.28);
  boda.add(seat);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.42), mat('#FFD84D'));
  tank.position.set(0, 0.7, 0.22);
  boda.add(tank);
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.06), mat('#1B2537'));
  bars.position.set(0, 0.92, 0.62);
  boda.add(bars);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), mat('#1B2537'));
  fork.position.set(0, 0.62, 0.66);
  fork.rotation.x = 0.35;
  boda.add(fork);
  const wheels: THREE.Mesh[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 18);
  wheelGeo.rotateZ(Math.PI / 2); // axle along X so wheels roll forward
  for (const z of [0.72, -0.62]) {
    const w = new THREE.Mesh(wheelGeo.clone(), mat('#101318'));
    w.position.set(0, 0.3, z);
    boda.add(w);
    wheels.push(w);
  }
  boda.visible = false;
  body.add(boda);

  // Soft ground shadow — stays on the ground while the body jumps
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 24),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  g.add(shadow);

  const parts: CharParts = {
    group: g, body, fallback, rig: null,
    board, boardStripe: stripe, boda, wheels,
    lastT: -1, disposed: false,
  };

  loadRunnerModel()
    .then((gltf) => attachRig(parts, gltf, accent))
    .catch((err) => console.warn('runner model unavailable — using stand-in', err));

  return parts;
}

// The original blocky runner: shown while the glTF loads, or if it fails
function buildFallback(accent: string, mat: (c: string | number) => THREE.Material): Fallback {
  const root = new THREE.Group();

  // Legs — pivot at the hip
  const legGeo = new THREE.BoxGeometry(0.17, 0.56, 0.17);
  legGeo.translate(0, -0.28, 0);
  const legL = new THREE.Mesh(legGeo, mat('#1B2537'));
  legL.position.set(-0.14, 0.78, 0);
  root.add(legL);
  const legR = new THREE.Mesh(legGeo.clone(), mat('#1B2537'));
  legR.position.set(0.14, 0.78, 0);
  root.add(legR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.28), mat(accent));
  torso.position.y = 1.06;
  root.add(torso);

  // Arms — pivot at the shoulder
  const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
  armGeo.translate(0, -0.25, 0);
  const armL = new THREE.Mesh(armGeo, mat('#E8B27D'));
  armL.position.set(-0.3, 1.3, 0);
  root.add(armL);
  const armR = new THREE.Mesh(armGeo.clone(), mat('#E8B27D'));
  armR.position.set(0.3, 1.3, 0);
  root.add(armR);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), mat('#E8B27D'));
  head.position.y = 1.52;
  root.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.36), mat('#FF4757'));
  cap.position.y = 1.7;
  root.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.2), mat('#FF4757'));
  brim.position.set(0, 1.66, 0.26);
  root.add(brim);

  return { root, legL, legR, armL, armR };
}

/* ── Per-frame animation ── */

/**
 * Drive the character. jump is meters above ground; UNIT_METERS converts to
 * model units. crashed plays the hit reaction for the stun window.
 */
export function animateCharacter(
  parts: CharParts,
  t: number,
  speed: number,
  lean: number,
  jump: number,
  unitMeters: number,
  mode: RideMode = 'board',
  crashed = false,
) {
  const { body, board, boardStripe, boda, wheels, rig } = parts;
  const dt = parts.lastT < 0 ? 0 : Math.min(t - parts.lastT, 0.1);
  parts.lastT = t;

  const airborne = jump > 0.4;
  const riding = mode === 'boda';

  board.visible = !riding;
  boardStripe.visible = !riding;
  boda.visible = riding;
  if (riding) for (const w of wheels) w.rotation.x -= speed * 0.5;

  /* Whole-body motion, shared by the rig and the stand-in */
  const ease = 1 - Math.exp(-10 * dt);
  if (riding) {
    body.rotation.x = airborne ? -0.22 : speed * 0.05;
    body.rotation.z = -lean * 0.45 * Math.max(speed, 0.3);
    body.position.y = jump / unitMeters + (airborne ? 0 : Math.abs(Math.sin(t * 14)) * 0.012 * speed);
  } else {
    body.rotation.x = airborne ? -0.18 : speed * 0.06;
    body.rotation.z = -lean * 0.32 * Math.max(speed, 0.3);
    // Surf bob: the deck rides a swell rather than footsteps
    body.position.y = jump / unitMeters + (airborne ? 0 : Math.sin(t * 2.4) * 0.03 * (0.3 + speed));
    board.rotation.z = airborne ? lean * 0.2 : Math.sin(t * 1.6) * 0.05 + lean * 0.12;
  }

  if (!rig) {
    animateFallback(parts.fallback, t, speed, airborne, riding);
    return;
  }

  /* Rig: state machine → clip, then layered stance + arm pose */
  setClip(rig, pickClip(speed, airborne, mode, crashed));
  const a = rig.actions[rig.state!];
  if (rig.state === 'Surf') a.setEffectiveTimeScale(0.6 + speed * 0.8);
  rig.mixer.update(dt);

  // Turn sideways on the deck while surfing; face forward otherwise
  const stanceTarget = rig.state === 'Surf' || rig.state === 'Jump' ? SURF_STANCE : 0;
  rig.stance += (stanceTarget - rig.stance) * ease;
  rig.root.rotation.y = rig.stance;
  rig.root.position.y = riding ? BODA_SEAT : BOARD_TOP;

  // Arms out for balance — eased, layered on the shoulders after the mixer
  // has posed the bones (the rig's feet are planted, so legs stay clip-driven)
  const spreadTarget = rig.state === 'Surf' ? 0.6 + speed * 0.4 : rig.state === 'Jump' ? 1.15 : 0;
  rig.armSpread += (spreadTarget - rig.armSpread) * ease;
  if (rig.armSpread > 0.01) {
    rig.arms.l?.rotateZ(1.1 * rig.armSpread);
    rig.arms.r?.rotateZ(-1.1 * rig.armSpread);
  }
}

function animateFallback(f: Fallback, t: number, speed: number, airborne: boolean, riding: boolean) {
  const { legL, legR, armL, armR } = f;
  if (riding) {
    // Crouched rider: knees up on the pegs, arms reaching the bars
    legL.rotation.x = 1.25;
    legR.rotation.x = 1.25;
    armL.rotation.x = -1.05;
    armR.rotation.x = -1.05;
    return;
  }
  if (airborne) {
    legL.rotation.x = 0.95;
    legR.rotation.x = 0.75;
    armL.rotation.x = -2.4;
    armR.rotation.x = -2.4;
    return;
  }
  const freq = 4 + speed * 8;
  const swing = Math.sin(t * freq) * (0.25 + speed * 0.75) * 0.9 * Math.max(speed, 0.12);
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
}

export function addCharacterLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x3a2a1e, 1.1));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.8);
  sun.position.set(1.5, 3, 2);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x00c2ff, 0.9);
  rim.position.set(-2, 1.2, -1.5);
  scene.add(rim);
}

/** Free a character's GPU resources. Geometry shared with the cached model is kept. */
export function disposeCharacter(parts: CharParts) {
  parts.disposed = true;
  if (parts.rig) {
    parts.rig.mixer.stopAllAction();
    parts.rig.mixer.uncacheRoot(parts.rig.root);
  }
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (!obj.userData.sharedGeometry) obj.geometry.dispose();
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
    }
  });
}
