import { describe, expect, it } from 'vitest';
import { GOVERNOR, QualityGovernor, initialQuality } from '@/lib/game/quality';

// Drive the governor with a steady frame rate for `seconds`
function run(g: QualityGovernor, fps: number, seconds: number) {
  const changes: string[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const c = g.frame(1 / fps);
    if (c) changes.push(c);
  }
  return changes;
}

describe('quality governor', () => {
  it('starts phones lower than desktops, and low-end phones lowest', () => {
    expect(initialQuality({ coarsePointer: false })).toBe('high');
    expect(initialQuality({ coarsePointer: true, deviceMemoryGB: 8, cores: 8 })).toBe('medium');
    expect(initialQuality({ coarsePointer: true, deviceMemoryGB: 2 })).toBe('low');
    expect(initialQuality({ coarsePointer: true, cores: 4 })).toBe('low');
  });

  it('holds steady at a healthy frame rate', () => {
    const g = new QualityGovernor('high');
    expect(run(g, 60, 30)).toEqual([]);
  });

  it('steps down when the device cannot keep up, one level per cooldown', () => {
    const g = new QualityGovernor('high');
    expect(run(g, 30, 4)).toEqual(['medium']);
    expect(run(g, 30, 4)).toEqual(['low']);
    expect(run(g, 30, 10)).toEqual([]); // already at the floor
  });

  it('steps back up once there is sustained headroom', () => {
    const g = new QualityGovernor('low');
    const ups = run(g, 60, 20);
    expect(ups).toEqual(['medium', 'high']);
  });

  it('never climbs above its ceiling', () => {
    const g = new QualityGovernor('low', 'medium');
    expect(run(g, 60, 30)).toEqual(['medium']);
  });

  it('does not flap on a borderline frame rate', () => {
    const g = new QualityGovernor('medium');
    // Between the down and up thresholds: no change either way
    expect(run(g, (GOVERNOR.DOWN_FPS + GOVERNOR.UP_FPS) / 2, 30)).toEqual([]);
  });

  it('ignores one-off pauses (tab switch, GC) rather than reading them as slowness', () => {
    const g = new QualityGovernor('high');
    for (let i = 0; i < 20; i++) {
      run(g, 60, 0.5);
      g.frame(1.5); // a long stall
    }
    expect(g.level).toBe('high');
  });

  it('still steps down on a device that is always very slow (every frame > 250 ms)', () => {
    const g = new QualityGovernor('high');
    expect(run(g, 3, 20)).toEqual(['medium', 'low']);
  });

  it('tolerates a short hitch without dropping quality', () => {
    const g = new QualityGovernor('high');
    run(g, 60, 5);
    expect(run(g, 25, 0.8)).toEqual([]); // < DOWN_S of slowness
    expect(run(g, 60, 5)).toEqual([]);
    expect(g.level).toBe('high');
  });
});
