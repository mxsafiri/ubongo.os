import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import {
  RUN_DAILY_CAP,
  RUN_MAX_DURATION_S,
  RUN_MAX_PAYOUT,
  RUN_MAX_SPEED_MS,
  RUN_TIDE_PER_M,
  publicPlayer,
} from '@/lib/game/economy';

// POST /api/game/runs/[id]/finish — bank a Surf Run's Tide.
// The client reports distance and Tide; the server pays the smallest of
// what was claimed, what that distance could plausibly earn in the time
// the server clocked, the per-run cap, and what's left of today's cap.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema();
    const { id: runId } = await ctx.params;
    const { player_id, distance_m, tide } = await req.json();

    if (!player_id || typeof distance_m !== 'number' || typeof tide !== 'number') {
      return NextResponse.json({ error: 'player_id, distance_m, tide required' }, { status: 400 });
    }
    const distance = Math.max(0, Math.floor(distance_m));
    const claimed = Math.max(0, Math.floor(tide));

    // Close the run and pay out in one statement; ended_at IS NULL makes a
    // run payable exactly once.
    const rows = await sql`
      WITH r AS (
        SELECT id,
          LEAST(EXTRACT(EPOCH FROM NOW() - started_at), ${RUN_MAX_DURATION_S}) AS secs
        FROM runs
        WHERE id = ${runId} AND player_id = ${player_id} AND ended_at IS NULL
        FOR UPDATE
      ),
      today AS (
        SELECT COALESCE(SUM(amount), 0)::int AS earned
        FROM transactions
        WHERE player_id = ${player_id} AND type = 'run'
          AND created_at > NOW() - INTERVAL '24 hours'
      ),
      pay AS (
        SELECT r.id, GREATEST(0, LEAST(
          ${claimed},
          FLOOR(LEAST(${distance}, r.secs * ${RUN_MAX_SPEED_MS}) * ${RUN_TIDE_PER_M}),
          ${RUN_MAX_PAYOUT},
          ${RUN_DAILY_CAP} - (SELECT earned FROM today)
        ))::int AS amt
        FROM r
      ),
      closed AS (
        UPDATE runs
        SET ended_at = NOW(), distance_m = ${distance}, claimed_tide = ${claimed},
            payout = (SELECT amt FROM pay)
        WHERE id IN (SELECT id FROM pay)
        RETURNING payout
      ),
      ledger AS (
        INSERT INTO transactions (player_id, type, amount, description)
        SELECT ${player_id}::uuid, 'run', amt, 'Surf Run · ' || ROUND(${distance} / 1000.0, 1) || ' km'
        FROM pay WHERE amt > 0
      ),
      credited AS (
        UPDATE players
        SET tide_tokens = tide_tokens + (SELECT amt FROM pay), last_active = NOW()
        WHERE id = ${player_id} AND EXISTS (SELECT 1 FROM closed)
        RETURNING *
      )
      SELECT
        (SELECT payout FROM closed) AS payout,
        (SELECT row_to_json(credited) FROM credited) AS player
    `;

    const { payout, player } = rows[0] ?? {};
    if (payout === null || payout === undefined || !player) {
      return NextResponse.json({ error: 'Run not found or already banked' }, { status: 409 });
    }

    return NextResponse.json({ payout, claimed, player: publicPlayer(player) });
  } catch (err) {
    console.error('POST /api/game/runs/[id]/finish', err);
    return NextResponse.json({ error: 'Could not bank run' }, { status: 500 });
  }
}
