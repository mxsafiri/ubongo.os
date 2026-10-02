// Adaptive quality for Surf Run.
//
// Phones vary wildly: a flagship holds 60 fps at full resolution, a
// budget Android can't. The governor watches real frame times and steps
// quality down when the game can't keep up, and back up when it has
// headroom, with hysteresis so it doesn't flap. Each level trades the most
// expensive things first: render resolution (pixel ratio), how many other
// riders get full 3D, the see-through-walls pass, and per-frame map updates.

export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualitySettings {
  maxPixelRatio: number;    // cap on map/canvas pixel ratio
  crewMax: number;          // other riders drawn as full 3D characters
  crewXray: boolean;        // silhouettes for other riders behind buildings
  wakeEvery: number;        // update the board wake every N frames
  speedLines: boolean;
  buildingQueryMs: number;  // how often to re-read buildings from the map
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high:   { maxPixelRatio: 2,    crewMax: 12, crewXray: true,  wakeEvery: 2, speedLines: true,  buildingQueryMs: 600 },
  medium: { maxPixelRatio: 1.5,  crewMax: 6,  crewXray: true,  wakeEvery: 3, speedLines: true,  buildingQueryMs: 800 },
  low:    { maxPixelRatio: 1.15, crewMax: 3,  crewXray: false, wakeEvery: 6, speedLines: false, buildingQueryMs: 1200 },
};

const ORDER: QualityLevel[] = ['low', 'medium', 'high'];

export const GOVERNOR = {
  DOWN_FPS: 45,        // below this (smoothed) for DOWN_S → step down
  DOWN_S: 2,
  UP_FPS: 57,          // above this for UP_S → step up
  UP_S: 6,
  COOLDOWN_S: 3,       // minimum time between changes
  EMA: 0.08,           // smoothing per frame
  MAX_DT_S: 0.25,      // a single long frame counts as at most this slow
} as const;

/** Where to start, before any frames have been measured. */
export function initialQuality(env: { coarsePointer: boolean; deviceMemoryGB?: number; cores?: number }): QualityLevel {
  if (!env.coarsePointer) return 'high';
  const lowEnd = (env.deviceMemoryGB !== undefined && env.deviceMemoryGB <= 3) || (env.cores !== undefined && env.cores <= 4);
  return lowEnd ? 'low' : 'medium';
}

export class QualityGovernor {
  level: QualityLevel;
  fps = 60;
  private slowFor = 0;
  private fastFor = 0;
  private sinceChange = Infinity;

  constructor(start: QualityLevel, private readonly ceiling: QualityLevel = 'high') {
    this.level = start;
  }

  get settings(): QualitySettings {
    return QUALITY[this.level];
  }

  /** Feed one frame's duration (seconds). Returns the new level when it changes, else null. */
  frame(dt: number): QualityLevel | null {
    if (!(dt > 0)) return null;
    // Clamp rather than ignore: one tab-switch or GC pause barely moves the
    // average, but a device that is always this slow still steps down
    dt = Math.min(dt, GOVERNOR.MAX_DT_S);
    this.fps += (1 / dt - this.fps) * GOVERNOR.EMA;
    this.sinceChange += dt;
    this.slowFor = this.fps < GOVERNOR.DOWN_FPS ? this.slowFor + dt : 0;
    this.fastFor = this.fps > GOVERNOR.UP_FPS ? this.fastFor + dt : 0;
    if (this.sinceChange < GOVERNOR.COOLDOWN_S) return null;

    const i = ORDER.indexOf(this.level);
    if (this.slowFor >= GOVERNOR.DOWN_S && i > 0) return this.set(ORDER[i - 1]);
    if (this.fastFor >= GOVERNOR.UP_S && i < ORDER.indexOf(this.ceiling)) return this.set(ORDER[i + 1]);
    return null;
  }

  private set(level: QualityLevel) {
    this.level = level;
    this.sinceChange = 0;
    this.slowFor = 0;
    this.fastFor = 0;
    return level;
  }
}

/** Read the device hints the browser exposes (all optional). */
export function deviceQualityHints() {
  if (typeof window === 'undefined') return { coarsePointer: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    deviceMemoryGB: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
  };
}
