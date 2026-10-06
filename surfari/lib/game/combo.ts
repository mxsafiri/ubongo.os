// Combo meter for Surf Run.
//
// Style feeds it: near-misses with traffic, coin chains, jumps over rivals,
// wipeouts and whip hits each add heat. Heat climbs through five tiers, each
// a Tide multiplier with a Swahili call-out. Stop doing anything stylish and
// heat drains; crash and it's gone. Greedy play pays, careless play doesn't.
// Pure logic — unit-tested.

export type StyleMove = 'coin' | 'nearMiss' | 'jumpOver' | 'wipeout' | 'whipHit' | 'escape' | 'boda';

export const COMBO = {
  HEAT: { coin: 1, nearMiss: 3, jumpOver: 4, wipeout: 5, whipHit: 4, escape: 3, boda: 2 } as Record<StyleMove, number>,
  TIERS: [0, 4, 10, 18, 30],   // heat needed for ×1 … ×5
  MAX_HEAT: 40,
  GRACE_S: 2.5,                // after a move, heat holds this long…
  DRAIN_PER_S: 4,              // …then drains this fast
} as const;

export const TIER_CALLS = ['', 'POA!', 'SAFI!', 'MOTO!', 'HATARI!'] as const;

export class Combo {
  heat = 0;
  private sinceMove = Infinity;

  /** Multiplier, 1…5. */
  get mult() {
    let m = 1;
    COMBO.TIERS.forEach((need, i) => { if (this.heat >= need) m = i + 1; });
    return m;
  }

  /** 0…1 progress toward the next tier (1 at the top tier). */
  get progress() {
    const m = this.mult;
    if (m >= COMBO.TIERS.length) return Math.min(1, (this.heat - COMBO.TIERS[m - 1]) / (COMBO.MAX_HEAT - COMBO.TIERS[m - 1]));
    const lo = COMBO.TIERS[m - 1], hi = COMBO.TIERS[m];
    return (this.heat - lo) / (hi - lo);
  }

  /** 0…1: how much grace is left before heat starts draining. */
  get hold() {
    return this.sinceMove >= COMBO.GRACE_S ? 0 : 1 - this.sinceMove / COMBO.GRACE_S;
  }

  /** Add a move. Returns the new tier when it went up, else null. */
  add(move: StyleMove): number | null {
    const before = this.mult;
    this.heat = Math.min(COMBO.MAX_HEAT, this.heat + COMBO.HEAT[move]);
    this.sinceMove = 0;
    const after = this.mult;
    return after > before ? after : null;
  }

  /** Advance time. Returns the new tier when it dropped, else null. */
  tick(dt: number): number | null {
    if (!(dt > 0)) return null;
    const before = this.mult;
    this.sinceMove += dt;
    if (this.sinceMove > COMBO.GRACE_S) this.heat = Math.max(0, this.heat - COMBO.DRAIN_PER_S * dt);
    const after = this.mult;
    return after < before ? after : null;
  }

  /** A crash or a grab: the combo is lost. Returns the multiplier you had. */
  bust(): number {
    const had = this.mult;
    this.heat = 0;
    this.sinceMove = Infinity;
    return had;
  }
}
