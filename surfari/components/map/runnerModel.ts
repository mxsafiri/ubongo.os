'use client';

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { clamp, damp, dampAngle, spring, stepSpring, wrapAngle, type Spring } from '@/lib/game/motion';

// Shared runner model — used by RunnerLayer (the local player) and
// CrewLayer (remote riders). ~1.8 model units tall.
//
// The character is KayKit's hooded rider (public/models/rider.glb, CC0),
// its outfit recoloured to each rider's colour, driven by a small animation
// state machine with crossfades between its own clips: a crouched riding
// stance, jump, fall, kick (the tail-whip) and seated (on a boda). The body
// motion on top comes from how the rider actually moves — banking from
// lateral acceleration, weight shifts from throttle and brake, compression on
// take-off and landing — applied to the whole body, never by bending bones
// against the clip. Until the model has loaded — or if it never does — a
// procedural stand-in is shown, so a rider is never invisible.

export type RideMode = 'board' | 'boda';

export const RUNNER_MODEL_URL = '/models/rider.glb';
export const BODA_MODEL_URL = '/models/boda.glb';
const RIG_HEIGHT = 1.8;        // model units, matches the procedural stand-in
const BOARD_TOP = 0.1;         // feet rest on the deck
const BODA_SEAT = 0.35;        // the seated clip's hips land on the boda's seat…
const BODA_SEAT_Z = -0.25;     // …just behind the tank
const CROSSFADE_S = 0.18;
const CRASH_RECOVER_S = 0.4;   // getting back up off the floor takes a moment
const SURF_STANCE = Math.PI * 0.42;  // sideways on the deck, like a real surfer
const HEAD_AHEAD = 0.55;       // side-on, the head turns to look down the street

// The rider's outfit is green in the source texture; it's recoloured per rider
const OUTFIT_HUE = 0.4;
const OUTFIT_HUE_TOL = 0.09;

type Clip = 'Idle' | 'Surf' | 'Jump' | 'Crash' | 'Ride' | 'Whip';

// Which clip in the model plays each state, and how
const CLIPS: Record<Clip, { name: string; once?: boolean; speed?: number }> = {
  Idle:  { name: 'Unarmed_Idle' },
  Surf:  { name: '2H_Melee_Idle' },             // low, wide, knees bent: a riding stance
  Jump:  { name: 'Jump_Idle' },
  Crash: { name: 'Death_A', once: true, speed: 1.5 },
  Ride:  { name: 'Sit_Chair_Idle' },
  Whip:  { name: 'Unarmed_Melee_Attack_Kick', once: true, speed: 1.3 }, // kick back at a chaser
};

interface Rig {
  root: THREE.Object3D;
  baseScale: number;
  mixer: THREE.AnimationMixer;
  actions: Record<Clip, THREE.AnimationAction>;
  state: Clip | null;
  stance: number;                       // current yaw offset (radians)
  head: THREE.Object3D | null;
}

/** Physics state behind the secondary motion — one per character. */
interface Dynamics {
  init: boolean;
  heading: number;      // smoothed facing (rad, clockwise from north)
  rawHeading: number;   // last input heading, for yaw rate
  speed: number;        // last input speed (0..1)
  jump: number;         // last input jump height (m)
  vy: number;           // vertical velocity (m/s), for board pitch
  crashed: boolean;
  bank: Spring;         // roll into turns
  pitch: Spring;        // weight forward/back from throttle & brake
  comp: Spring;         // compression from take-off / landing impacts
  knock: Spring;        // crash wobble
  look: Spring;         // head turning into the turn
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
  wheels: THREE.Object3D[];
  shadow: THREE.Mesh;
  xray: THREE.MeshBasicMaterial;
  lastT: number;
  disposed: boolean;
  dyn: Dynamics;
}

/* ── Model loading (once per page) ── */

const models = new Map<string, Promise<GLTF>>();

function loadModel(url: string): Promise<GLTF> {
  let p = models.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).catch((err) => {
      models.delete(url); // allow a later retry
      throw err;
    });
    models.set(url, p);
  }
  return p;
}

export function loadRunnerModel(): Promise<GLTF> {
  return loadModel(RUNNER_MODEL_URL);
}

export function loadBodaModel(): Promise<GLTF> {
  return loadModel(BODA_MODEL_URL);
}

/* ── Outfit colour: the rider's colour painted into the palette texture ── */

const outfitTextures = new Map<string, THREE.Texture>();

/**
 * The model is textured from a small palette image; every green swatch is
 * outfit. Repaint those in the rider's colour, keeping each swatch's
 * relative shade so folds and trims still read. One texture per colour,
 * shared by every rider wearing it.
 */
function outfitTexture(map: THREE.Texture, accent: string): THREE.Texture {
  const key = `${map.uuid}:${accent}`;
  const cached = outfitTextures.get(key);
  if (cached) return cached;
  const img = map.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext('2d');
  if (!g) return map;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const c = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const to = { h: 0, s: 0, l: 0 };
  new THREE.Color(accent).getHSL(to, THREE.SRGBColorSpace);
  for (let i = 0; i < px.length; i += 4) {
    c.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace);
    c.getHSL(hsl, THREE.SRGBColorSpace);
    const dh = Math.abs(hsl.h - OUTFIT_HUE);
    if (Math.min(dh, 1 - dh) > OUTFIT_HUE_TOL || hsl.s < 0.15) continue;
    // Keep each swatch's shade relative to the outfit's mid-green
    c.setHSL(to.h, Math.max(to.s, 0.55), clamp(to.l + (hsl.l - 0.33) * 0.9, 0.1, 0.9), THREE.SRGBColorSpace);
    px[i] = c.r * 255;
    px[i + 1] = c.g * 255;
    px[i + 2] = c.b * 255;
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = map.flipY;
  tex.colorSpace = map.colorSpace;
  tex.magFilter = map.magFilter;
  tex.minFilter = map.minFilter;
  tex.wrapS = map.wrapS;
  tex.wrapT = map.wrapT;
  tex.channel = map.channel;
  outfitTextures.set(key, tex);
  return tex;
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

  // Per-rider materials: the outfit in the rider's colour. Geometry and the
  // recoloured textures are shared, so they're flagged to survive disposal.
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.userData.sharedGeometry = true;
    mesh.frustumCulled = false; // skinned bounds don't follow the animation
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const c = (m as THREE.MeshStandardMaterial).clone();
      // Matte cloth and skin: the source's sheen reads as plastic at street level
      c.roughness = 0.85;
      c.metalness = 0;
      if (c.map) {
        c.map = outfitTexture(c.map, accent);
        c.userData.sharedMap = true;
      }
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
    if (spec.speed) action.timeScale = spec.speed;
    if (spec.once) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[clip] = action;
  }

  parts.rig = {
    root,
    baseScale: s,
    mixer,
    actions,
    state: null,
    stance: 0,
    head: root.getObjectByName('head') ?? null,
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
  to.reset().setEffectiveTimeScale(CLIPS[next].speed ?? 1).setEffectiveWeight(1).play();
  if (from) to.crossFadeFrom(from, prev === 'Crash' ? CRASH_RECOVER_S : CROSSFADE_S, false);
  rig.state = next;
}

function pickClip(speed: number, airborne: boolean, mode: RideMode, crashed: boolean, attacking: boolean): Clip {
  if (crashed) return 'Crash';           // 1. hit reaction blocks everything
  if (attacking) return 'Whip';          // 2. the strike plays through
  if (mode === 'boda') return 'Ride';    // 3. mounted
  if (airborne) return 'Jump';           // 4. in the air
  return speed > 0.08 ? 'Surf' : 'Idle'; // 5. on the deck
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
  const bodaStandIn = [...boda.children];

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
    board, boardStripe: stripe, boda, wheels, shadow,
    xray: new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
    }),
    lastT: -1, disposed: false,
    dyn: {
      init: false, heading: 0, rawHeading: 0, speed: 0, jump: 0, vy: 0, crashed: false,
      bank: spring(), pitch: spring(), comp: spring(), knock: spring(), look: spring(),
    },
  };

  loadRunnerModel()
    .then((gltf) => attachRig(parts, gltf, accent))
    .catch((err) => console.warn('runner model unavailable — using stand-in', err));
  loadBodaModel()
    .then((gltf) => {
      if (parts.disposed) return;
      const bike = gltf.scene.clone();
      bike.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.sharedGeometry = true; });
      for (const c of bodaStandIn) c.visible = false;
      boda.add(bike);
      parts.wheels = ['wheel-front', 'wheel-back'].map((n) => bike.getObjectByName(n)).filter((w): w is THREE.Object3D => !!w);
    })
    .catch((err) => console.warn('boda model unavailable — using stand-in', err));

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

export interface MotionInput {
  t: number;            // seconds (performance.now() / 1000)
  heading: number;      // radians, clockwise from north
  speed: number;        // 0..1 of top speed
  jump: number;         // meters above ground
  unitMeters: number;   // meters per model unit
  mode?: RideMode;
  crashed?: boolean;    // inside the post-crash stun window
  attacking?: boolean;  // tail-whip in progress
}

// Tuning — all rates are per second
const HEADING_RATE = 16;        // how tightly the body follows the heading
const BANK_PER_ALAT = 0.24;     // rad of roll per (speed × rad/s of yaw)
const BANK_MAX = 0.6;
const PITCH_PER_ACCEL = 0.14;   // rad of lean per (speed/s)
const LAND_IMPULSE = 0.09;      // compression velocity per m/s of fall speed
const TAKEOFF_IMPULSE = -1.6;   // a small pre-load dip as the board leaves

/**
 * Drive the character from the rider's motion. Layers call this once per
 * frame; it owns the group's facing so turning, banking and the animation
 * clock all share one dt.
 */
export function animateCharacter(parts: CharParts, m: MotionInput) {
  const { group, body, board, boardStripe, boda, wheels, rig, dyn } = parts;
  const mode = m.mode ?? 'board';
  const crashed = !!m.crashed;
  const dt = parts.lastT < 0 ? 0 : Math.min(m.t - parts.lastT, 0.1);
  parts.lastT = m.t;

  if (!dyn.init) {
    dyn.init = true;
    dyn.heading = dyn.rawHeading = m.heading;
    dyn.speed = m.speed;
    dyn.jump = m.jump;
  }

  /* ── Derive motion from the input stream ── */
  const yawRate = dt > 0 ? wrapAngle(m.heading - dyn.rawHeading) / dt : 0;
  const accel = dt > 0 ? (m.speed - dyn.speed) / dt : 0;
  const vy = dt > 0 ? (m.jump - dyn.jump) / dt : 0;
  const wasAir = dyn.jump > 0.05;
  const isAir = m.jump > 0.05;
  if (!wasAir && isAir) dyn.comp.v += TAKEOFF_IMPULSE;                 // take-off
  if (wasAir && !isAir) dyn.comp.v += Math.abs(dyn.vy) * LAND_IMPULSE * 10; // landing
  if (crashed && !dyn.crashed) dyn.knock.v += (Math.random() < 0.5 ? -1 : 1) * 9;
  dyn.rawHeading = m.heading;
  dyn.speed = m.speed;
  dyn.jump = m.jump;
  if (dt > 0) dyn.vy = vy;
  dyn.crashed = crashed;

  /* ── Springs ── */
  const aLat = m.speed * yawRate; // centripetal demand, in (speed × rad/s)
  const riding = mode === 'boda';
  const bankTarget = isAir ? dyn.bank.x * 0.5 : clamp(aLat * BANK_PER_ALAT * (riding ? 1.25 : 1), -BANK_MAX, BANK_MAX);
  stepSpring(dyn.bank, bankTarget, 9, 0.62, dt);        // slightly under-damped: settles with a little life
  stepSpring(dyn.pitch, clamp(accel * PITCH_PER_ACCEL, -0.28, 0.28), 7, 0.7, dt);
  stepSpring(dyn.comp, 0, 15, 0.42, dt);                // bouncy impact absorption
  stepSpring(dyn.knock, 0, 11, 0.3, dt);
  stepSpring(dyn.look, clamp(yawRate * 0.22, -0.5, 0.5), 8, 0.9, dt);
  const comp = clamp(dyn.comp.x, -0.6, 1.2);

  /* ── Facing ── */
  dyn.heading = dampAngle(dyn.heading, m.heading, HEADING_RATE, dt);
  // The layer maps model +Z to geographic south, so face = π − heading
  group.rotation.y = Math.PI - dyn.heading;

  /* ── Whole-body motion, shared by the rig and the stand-in ── */
  board.visible = !riding;
  boardStripe.visible = !riding;
  boda.visible = riding;
  if (riding) for (const w of wheels) w.rotation.x -= m.speed * 30 * dt;

  // Positive bank (right turn) rolls the rider toward the inside of the turn
  body.rotation.z = dyn.bank.x + dyn.knock.x * 0.25;
  if (isAir) {
    // Board follows the arc: nose up on the way up, down on the way down
    body.rotation.x = damp(body.rotation.x, clamp(-vy * 0.035, -0.35, 0.35), 10, dt);
  } else {
    body.rotation.x = damp(body.rotation.x, -dyn.pitch.x * 0.35, 12, dt);
  }
  const swell = isAir || riding ? 0 : Math.sin(m.t * 2.4) * 0.025 * (0.3 + m.speed);
  const judder = riding && !isAir ? Math.abs(Math.sin(m.t * 38)) * 0.01 * m.speed : 0;
  body.position.y = m.jump / m.unitMeters + swell + judder - comp * 0.05;
  board.rotation.z = isAir ? dyn.bank.x * 0.3 : Math.sin(m.t * 1.6) * 0.03;

  if (!rig) {
    animateFallback(parts.fallback, m.t, m.speed, isAir, riding);
    return;
  }

  /* ── Rig: state machine → clip ── */
  setClip(rig, pickClip(m.speed, isAir, mode, crashed, !!m.attacking));
  const action = rig.actions[rig.state!];
  if (rig.state === 'Surf') action.setEffectiveTimeScale(0.6 + m.speed * 0.8);
  rig.mixer.update(dt);

  // Squash on impact — volume-preserving-ish, about the feet
  const sq = clamp(comp, -0.4, 1) * 0.09;
  rig.root.scale.set(rig.baseScale * (1 + sq * 0.5), rig.baseScale * (1 - sq), rig.baseScale * (1 + sq * 0.5));
  rig.root.position.y = riding ? BODA_SEAT : BOARD_TOP;
  rig.root.position.z = riding ? BODA_SEAT_Z : 0;

  // Side-on to the deck while riding it; the kick twists round to strike
  // behind; square to the bars on a boda and when standing still
  const surfing = rig.state === 'Surf' || rig.state === 'Jump';
  const stanceTarget = rig.state === 'Whip' ? Math.PI * 0.8 : surfing ? SURF_STANCE : 0;
  rig.stance = damp(rig.stance, stanceTarget, rig.state === 'Whip' ? 16 : 9, dt);
  rig.root.rotation.y = rig.stance;

  // The one layered touch: eyes down the street and into the turn. A single
  // small head turn on top of the clip, so the pose can't break.
  if (rig.head && surfing) {
    const stanceK = clamp(rig.stance / SURF_STANCE, 0, 1);
    rig.head.rotateY(-HEAD_AHEAD * stanceK - dyn.look.x * 0.3);
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

/**
 * Render a character inside a Mapbox custom layer. First an x-ray pass that
 * only lands where the rider is behind something already drawn (buildings),
 * then the normal pass on top — so a rider ducking behind a tower shows as
 * a coloured silhouette instead of vanishing.
 */
export function renderCharacter(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, parts: CharParts, xray = true) {
  renderer.resetState();
  if (xray) {
    parts.shadow.visible = false;
    scene.overrideMaterial = parts.xray;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    parts.shadow.visible = true;
  }
  renderer.render(scene, camera);
}

/** Free a character's GPU resources. Geometry shared with the cached model is kept. */
export function disposeCharacter(parts: CharParts) {
  parts.disposed = true;
  parts.xray.dispose();
  if (parts.rig) {
    parts.rig.mixer.stopAllAction();
    parts.rig.mixer.uncacheRoot(parts.rig.root);
  }
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (!obj.userData.sharedGeometry) obj.geometry.dispose();
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => {
        // Recoloured outfit textures are cached and shared between riders
        if (m.userData.sharedMap) (m as THREE.MeshStandardMaterial).map = null;
        m.dispose();
      });
    }
  });
}
