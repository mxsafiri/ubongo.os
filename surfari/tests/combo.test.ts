import { describe, expect, it } from 'vitest';
import { COMBO, Combo } from '@/lib/game/combo';

describe('combo meter', () => {
  it('starts at ×1 and climbs a tier as style adds up', () => {
    const c = new Combo();
    expect(c.mult).toBe(1);
    expect(c.add('nearMiss')).toBeNull();   // 3 heat: still ×1
    expect(c.add('coin')).toBe(2);           // 4 heat: ×2
    expect(c.mult).toBe(2);
  });

  it('tops out at ×5', () => {
    const c = new Combo();
    for (let i = 0; i < 30; i++) c.add('wipeout');
    expect(c.mult).toBe(5);
    expect(c.heat).toBe(COMBO.MAX_HEAT);
    expect(c.progress).toBe(1);
  });

  it('holds during the grace window, then drains and drops tiers', () => {
    const c = new Combo();
    c.add('wipeout'); c.add('wipeout'); // 10 heat: ×3
    expect(c.mult).toBe(3);
    for (let i = 0; i < 20; i++) expect(c.tick(0.1)).toBeNull(); // 2 s: within grace
    expect(c.mult).toBe(3);
    let dropped: number | null = null;
    for (let i = 0; i < 10 && dropped === null; i++) dropped = c.tick(0.1);
    expect(dropped).toBe(2);
    for (let i = 0; i < 100; i++) c.tick(0.1);
    expect(c.mult).toBe(1);
    expect(c.heat).toBe(0);
  });

  it('a new move refills the grace window', () => {
    const c = new Combo();
    c.add('wipeout');
    for (let i = 0; i < 20; i++) c.tick(0.1);
    c.add('coin');
    expect(c.hold).toBe(1);
    for (let i = 0; i < 20; i++) c.tick(0.1);
    expect(c.heat).toBe(6); // nothing drained yet
  });

  it('a crash busts the combo and reports what was lost', () => {
    const c = new Combo();
    for (let i = 0; i < 4; i++) c.add('wipeout'); // 20 heat: ×4
    expect(c.bust()).toBe(4);
    expect(c.mult).toBe(1);
    expect(c.hold).toBe(0);
  });

  it('progress runs 0 → 1 within a tier', () => {
    const c = new Combo();
    c.add('coin'); c.add('coin'); // 2 of 4 toward ×2
    expect(c.progress).toBeCloseTo(0.5);
  });
});
