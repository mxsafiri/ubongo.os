// Frame-rate-independent motion primitives shared by the runner, the crew
// and the chase camera. Everything takes dt in seconds, so motion looks the
// same at 30, 60 or 144 fps.

/** Damped harmonic spring. omega = stiffness (rad/s), zeta = damping ratio (1 = no overshoot). */
export interface Spring {
  x: number;
  v: number;
}

export const spring = (x = 0): Spring => ({ x, v: 0 });

const MAX_STEP = 1 / 120;

/** Advance a spring toward target. Substeps keep stiff springs stable on slow frames. */
export function stepSpring(s: Spring, target: number, omega: number, zeta: number, dt: number) {
  let left = Math.min(dt, 0.1);
  while (left > 0) {
    const h = Math.min(left, MAX_STEP);
    const a = omega * omega * (target - s.x) - 2 * zeta * omega * s.v;
    s.v += a * h;
    s.x += s.v * h;
    left -= h;
  }
  return s.x;
}

/** Exponential approach — the frame-rate-independent version of `x += (t - x) * k`. */
export function damp(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** damp() along the shortest arc. */
export function dampAngle(current: number, target: number, rate: number, dt: number) {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Cheap smooth 1D noise in [-1, 1] — sum of incommensurate sines (for camera shake). */
export function noise1(t: number, seed = 0) {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 +
    Math.sin(t * 2.31 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.67 + seed * 2.9) * 0.2
  );
}
