import { sql } from '@/lib/db/client';

/* ── Build & Defend ── */
export const MAX_ZONE_LEVEL = 5;
export const BUILD_COST_PER_LEVEL = 200;   // cost to go from level L → L+1 is L × 200
export const BUILD_YIELD_GAIN = 150;
export const BUILD_STRENGTH_GAIN = 15;
export const BUILD_REPUTATION_GAIN = 5;

/* ── Yield ── */
// Idle turf stops accruing after a week — owners have to show up to collect.
export const YIELD_ACCRUAL_CAP_S = 7 * 24 * 60 * 60;

/* ── Surf Run payouts ── */
// Fastest legal speed is 74 m/s × 1.6 boda boost ≈ 118 m/s; allow a little slack.
export const RUN_MAX_SPEED_MS = 125;
// A coin is worth 25 Tide and sits 80–980 m out; one per 40 m ridden is generous.
export const RUN_TIDE_PER_M = 25 / 40;
export const RUN_MAX_PAYOUT = 5_000;
export const RUN_DAILY_CAP = 20_000;
export const RUN_MAX_DURATION_S = 60 * 60;

type Row = Record<string, unknown>;

/** Strip server-only columns before a player row goes to the client. */
export function publicPlayer<T extends Row>(row: T): Omit<T, 'pin_hash'> {
  const rest: Row = { ...row };
  delete rest.pin_hash;
  return rest as Omit<T, 'pin_hash'>;
}

/**
 * Pay out everything a player's turf has earned since it was last settled
 * (daily_yield − upkeep_cost, pro-rated by the second, capped at a week).
 *
 * One statement: the zone rows are locked while the accrual is computed, so
 * two concurrent settles can't both pay the same window.
 */
export async function settleYield(playerId: string): Promise<{ player: Row | null; collected: number }> {
  const rows = await sql`
    WITH owned AS (
      SELECT id,
        GREATEST(0, FLOOR(
          (daily_yield - upkeep_cost)
          * LEAST(EXTRACT(EPOCH FROM NOW() - yield_collected_at), ${YIELD_ACCRUAL_CAP_S})
          / 86400.0
        ))::int AS accrued
      FROM zones
      WHERE owner_id = ${playerId}
      FOR UPDATE
    ),
    touched AS (
      UPDATE zones z SET yield_collected_at = NOW()
      FROM owned o
      WHERE z.id = o.id
      RETURNING o.accrued
    ),
    total AS (
      SELECT COALESCE(SUM(accrued), 0)::int AS amt FROM touched
    ),
    ledger AS (
      INSERT INTO transactions (player_id, type, amount, description)
      SELECT ${playerId}::uuid, 'yield', amt, 'Turf yield' FROM total WHERE amt > 0
    )
    UPDATE players
    SET tide_tokens = tide_tokens + (SELECT amt FROM total)
    WHERE id = ${playerId}
    RETURNING *, (SELECT amt FROM total) AS yield_collected
  `;
  const row = rows[0];
  if (!row) return { player: null, collected: 0 };
  const { yield_collected, ...player } = row;
  return { player, collected: Number(yield_collected) || 0 };
}
