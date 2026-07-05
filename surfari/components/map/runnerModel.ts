'use client';

import * as THREE from 'three';

// Shared procedural runner model — used by RunnerLayer (the local player)
// and CrewLayer (remote riders). ~1.8 model units tall.

export interface CharParts {
  group: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  board: THREE.Mesh;
}

export function buildCharacter(accent: string): CharParts {
  const g = new THREE.Group();
  const mat = (c: string | number) => new THREE.MeshLambertMaterial({ color: c });

  // Surfboard — gold deck with a dark stripe
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 2.3), mat('#FFD84D'));
  board.position.y = 0.06;
  g.add(board);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.085, 2.31), mat('#0B0F1C'));
  stripe.position.y = 0.06;
  g.add(stripe);

  // Legs — pivot at the hip
  const legGeo = new THREE.BoxGeometry(0.17, 0.56, 0.17);
  legGeo.translate(0, -0.28, 0);
  const legL = new THREE.Mesh(legGeo, mat('#1B2537'));
  legL.position.set(-0.14, 0.78, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo.clone(), mat('#1B2537'));
  legR.position.set(0.14, 0.78, 0);
  g.add(legR);

  // Torso — rider color
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.28), mat(accent));
  torso.position.y = 1.06;
  g.add(torso);

  // Arms — pivot at the shoulder
  const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
  armGeo.translate(0, -0.25, 0);
  const armL = new THREE.Mesh(armGeo, mat('#E8B27D'));
  armL.position.set(-0.3, 1.3, 0);
  g.add(armL);
  const armR = new THREE.Mesh(armGeo.clone(), mat('#E8B27D'));
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

  return { group: g, legL, legR, armL, armR, board };
}

/** Drive the run cycle. jump is meters above ground; UNIT_METERS converts to model units. */
export function animateCharacter(
  parts: CharParts,
  t: number,
  speed: number,
  lean: number,
  jump: number,
  unitMeters: number,
) {
  const { group, legL, legR, armL, armR, board } = parts;
  const airborne = jump > 0.4;
  const freq = 4 + speed * 8;
  const swing = Math.sin(t * freq) * (0.25 + speed * 0.75);

  if (airborne) {
    legL.rotation.x = 0.95;
    legR.rotation.x = 0.75;
    armL.rotation.x = -2.4;
    armR.rotation.x = -2.4;
    board.rotation.z = lean * 0.2;
    group.rotation.x = -0.18; // nose up off the ramp
  } else {
    legL.rotation.x = swing * 0.9 * Math.max(speed, 0.12);
    legR.rotation.x = -swing * 0.9 * Math.max(speed, 0.12);
    armL.rotation.x = -swing * 0.7 * Math.max(speed, 0.12);
    armR.rotation.x = swing * 0.7 * Math.max(speed, 0.12);
    board.rotation.z = Math.sin(t * 1.6) * 0.05 + lean * 0.12;
    group.rotation.x = speed * 0.12;
  }
  group.rotation.z = -lean * 0.3 * Math.max(speed, 0.3);
  group.position.y =
    jump / unitMeters +
    (airborne ? 0 : Math.abs(Math.sin(t * freq)) * 0.07 * speed + Math.sin(t * 1.8) * 0.02);
}

export function addCharacterLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
  sun.position.set(1.5, 3, 2);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x00c2ff, 0.5);
  rim.position.set(-2, 1.2, -1.5);
  scene.add(rim);
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
    }
  });
}
