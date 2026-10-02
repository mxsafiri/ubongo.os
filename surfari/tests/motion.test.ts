import { describe, expect, it } from 'vitest';
import { damp, dampAngle, spring, stepSpring, wrapAngle } from '@/lib/game/motion';

// Run a spring toward 1 for `seconds` at a given frame rate
function settle(fps: number, seconds: number, omega: number, zeta: number) {
  const s = spring(0);
  for (let i = 0; i < Math.round(seconds * fps); i++) stepSpring(s, 1, omega, zeta, 1 / fps);
  return s.x;
}

describe('motion springs', () => {
  it('converge to the target', () => {
    expect(settle(60, 3, 9, 0.62)).toBeCloseTo(1, 3);
  });

  it('are frame-rate independent (30 fps vs 144 fps)', () => {
    // Durations both frame rates land on exactly (5/24, 10/48, 15/72 frames)
    for (const t of [1 / 6, 1 / 3, 1 / 2]) {
      expect(Math.abs(settle(30, t, 9, 0.62) - settle(144, t, 9, 0.62))).toBeLessThan(0.02);
    }
  });

  it('stay stable on a long frame hitch', () => {
    const s = spring(0);
    stepSpring(s, 1, 16, 0.4, 0.5); // half-second freeze, stiff spring
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(2);
  });

  it('damp() is frame-rate independent', () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) a = damp(a, 1, 5, 1 / 30);
    for (let i = 0; i < 144; i++) b = damp(b, 1, 5, 1 / 144);
    expect(a).toBeCloseTo(b, 6);
  });

  it('angles take the short way round', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    const h = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 1000, 1);
    expect(Math.abs(wrapAngle(h - (-Math.PI + 0.1)))).toBeLessThan(1e-6);
  });
});
