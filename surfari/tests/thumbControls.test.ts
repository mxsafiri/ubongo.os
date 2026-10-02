import { describe, expect, it } from 'vitest';
import { THUMB, ThumbControls } from '@/lib/game/thumbControls';

describe('one-thumb controls', () => {
  it('cruises straight with no finger down', () => {
    const c = new ThumbControls();
    expect(c.input()).toEqual({ steer: 0, throttle: THUMB.CRUISE, brake: false, steering: false });
  });

  it('steers by dragging sideways, and goes straight again on release', () => {
    const c = new ThumbControls();
    c.down(1, 100, 600, 0);
    c.move(1, 100 + THUMB.STEER_PX / 2, 600, 400);
    expect(c.input().steer).toBeCloseTo(0.5);
    c.move(1, 100 - THUMB.STEER_PX * 3, 600, 500);
    expect(c.input().steer).toBe(-1);
    expect(c.up(1, 900)).toBeNull(); // a long drag is not a tap
    expect(c.input().steer).toBe(0);
  });

  it('ignores tiny wobbles of a resting thumb', () => {
    const c = new ThumbControls();
    c.down(1, 100, 600, 0);
    c.move(1, 103, 601, 500);
    expect(c.input().steer).toBe(0);
  });

  it('pushes harder dragging up slowly, brakes dragging down', () => {
    const c = new ThumbControls();
    c.down(1, 100, 600, 0);
    c.move(1, 100, 600 - THUMB.PUSH_PX, 1000); // slow: not a flick
    expect(c.input()).toMatchObject({ throttle: 1, brake: false });
    c.move(1, 100, 600 + THUMB.PUSH_PX, 1500);
    expect(c.input()).toMatchObject({ throttle: 0, brake: true });
  });

  it('a quick tap is a whip', () => {
    const c = new ThumbControls();
    c.down(1, 300, 500, 0);
    c.move(1, 304, 503, 60);
    expect(c.up(1, 120)).toBe('whip');
  });

  it('a held press is not a whip', () => {
    const c = new ThumbControls();
    c.down(1, 300, 500, 0);
    expect(c.up(1, THUMB.TAP_MS + 100)).toBeNull();
  });

  it('a quick flick up is a jump, once, and does not leave you pushing', () => {
    const c = new ThumbControls();
    c.down(1, 300, 500, 0);
    expect(c.move(1, 302, 500 - THUMB.FLICK_PX - 5, 120)).toBe('jump');
    expect(c.move(1, 302, 500 - THUMB.FLICK_PX - 30, 160)).toBeNull();
    expect(c.input().throttle).toBeLessThan(1);
    expect(c.up(1, 200)).toBeNull(); // and the release isn't also a whip
  });

  it('a sideways swipe is steering, not a jump', () => {
    const c = new ThumbControls();
    c.down(1, 100, 500, 0);
    expect(c.move(1, 200, 450, 100)).toBeNull();
  });

  it('the first finger keeps steering while a second taps to whip', () => {
    const c = new ThumbControls();
    c.down(1, 80, 600, 0);
    c.move(1, 80 + THUMB.STEER_PX, 600, 300);
    c.down(2, 300, 500, 400);
    expect(c.input().steer).toBe(1);
    expect(c.up(2, 450)).toBe('whip');
    expect(c.input().steer).toBe(1);
  });

  it('cancelled touches produce nothing', () => {
    const c = new ThumbControls();
    c.down(1, 300, 500, 0);
    c.cancel(1);
    expect(c.up(1, 50)).toBeNull();
    expect(c.input().steering).toBe(false);
  });
});
