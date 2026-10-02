import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import {
  BUILD_COST_PER_LEVEL,
  BUILD_REPUTATION_GAIN,
  BUILD_STRENGTH_GAIN,
  BUILD_YIELD_GAIN,
  MAX_ZONE_LEVEL,
  publicPlayer,
  settleYield,
} from '@/lib/game/economy';

// POST /api/game/zones/[id]/build — owner levels up their zone (I → V).
// Costs level × 200 Tide, raises daily yield and claim strength.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema();
    const { id: zoneId } = await ctx.params;
    const { player_id } = await req.json();

    if (!player_id) {
      return NextResponse.json({ error: 'player_id required' }, { status: 400 });
    }

    const [zone] = await sql`SELECT owner_id, level FROM zones WHERE id = ${zoneId}`;
    if (!zone) return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
    if (zone.owner_id !== player_id) {
      return NextResponse.json({ error: 'You can only build on turf you own' }, { status: 403 });
    }
    if ((zone.level ?? 1) >= MAX_ZONE_LEVEL) {
      return NextResponse.json({ error: 'Zone is already max level' }, { status: 409 });
    }

    // Bank yield at the old rate before the build raises it
    await settleYield(player_id);

    // One statement: lock the zone, charge the owner, level the zone. The
    // cost comes from the locked row, so concurrent builds each pay the
    // right price and the charge can't land without the level-up.
    const rows = await sql`
      WITH z AS (
        SELECT id, level, level * ${BUILD_COST_PER_LEVEL} AS cost
        FROM zones
        WHERE id = ${zoneId} AND owner_id = ${player_id} AND level < ${MAX_ZONE_LEVEL}
        FOR UPDATE
      ),
      charged AS (
        UPDATE players p
        SET tide_tokens = p.tide_tokens - z.cost,
            reputation = p.reputation + ${BUILD_REPUTATION_GAIN},
            last_active = NOW()
        FROM z
        WHERE p.id = ${player_id} AND p.tide_tokens >= z.cost
        RETURNING p.*
      ),
      built AS (
        UPDATE zones
        SET level = zones.level + 1,
            daily_yield = zones.daily_yield + ${BUILD_YIELD_GAIN},
            claim_strength = LEAST(zones.claim_strength + ${BUILD_STRENGTH_GAIN}, 100)
        FROM z
        WHERE zones.id = z.id AND EXISTS (SELECT 1 FROM charged)
        RETURNING zones.id, zones.level, zones.daily_yield, zones.claim_strength, zones.state,
                  zones.owner_id, zones.owner_handle, zones.owner_color, zones.trace_count
      ),
      ledger AS (
        INSERT INTO transactions (player_id, type, amount, description, zone_id)
        SELECT ${player_id}::uuid, 'build', -z.cost, 'Built to level ' || (z.level + 1), z.id
        FROM z WHERE EXISTS (SELECT 1 FROM built)
      )
      SELECT
        (SELECT row_to_json(built) FROM built) AS zone,
        (SELECT row_to_json(charged) FROM charged) AS player,
        (SELECT cost FROM z) AS cost
    `;

    const { zone: builtZone, player, cost } = rows[0] ?? {};
    if (!builtZone || !player) {
      return NextResponse.json(
        { error: cost ? `Not enough Tide — this build costs ${cost}` : 'Zone changed hands or is maxed' },
        { status: 409 },
      );
    }

    return NextResponse.json({ zone: builtZone, player: publicPlayer(player), cost });
  } catch (err) {
    console.error('POST /api/game/zones/[id]/build', err);
    return NextResponse.json({ error: 'Build failed' }, { status: 500 });
  }
}
