import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import { DAR_ZONES } from '@/lib/game/zones';
import { publicPlayer } from '@/lib/game/economy';
import { MAX_TURFS_PER_PLAYER, PLANT_COST } from '@/lib/game/balance';
import type { Zone } from '@/types';

// Dar es Salaam play area — matches the map maxBounds
const BOUNDS = { minLng: 39.0, maxLng: 39.6, minLat: -7.1, maxLat: -6.5 };

export async function GET() {
  try {
    await ensureSchema();

    const rows = await sql`
      SELECT id, name, district, tier, type, state,
             owner_id, owner_handle, owner_color,
             lat::float, lng::float, radius_meters,
             claim_strength, trace_count, contested_threshold,
             daily_yield, upkeep_cost, level, created_at
      FROM zones
      ORDER BY tier, name
    `;

    const zones: Zone[] = rows.map((row) => {
      const staticZone = DAR_ZONES.find((z) => z.id === row.id);
      return {
        id: row.id,
        name: row.name,
        district: row.district,
        tier: row.tier,
        type: row.type,
        state: row.state,
        owner_id: row.owner_id ?? null,
        owner_handle: row.owner_handle ?? null,
        owner_color: row.owner_color ?? null,
        lat: Number(row.lat),
        lng: Number(row.lng),
        radius_meters: row.radius_meters,
        claim_strength: row.claim_strength,
        trace_count: row.trace_count,
        contested_threshold: row.contested_threshold,
        daily_yield: row.daily_yield,
        upkeep_cost: row.upkeep_cost,
        level: row.level ?? 1,
        created_at: row.created_at,
        traces: [],
        task_demand: null,
        infrastructure: staticZone?.infrastructure ?? [],
      };
    });

    return NextResponse.json({ zones });
  } catch (err) {
    console.error('GET /api/game/zones', err);
    return NextResponse.json({ error: 'Failed to fetch zones' }, { status: 500 });
  }
}

// POST /api/game/zones — plant player-built turf anywhere on the map.
// The new zone is born already claimed by its creator and joins the same
// zone system as seeded zones: it yields Tide, can be reinforced, and can
// be challenged by other players.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { player_id, lat, lng } = await req.json();

    if (!player_id || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'player_id, lat, lng required' }, { status: 400 });
    }
    if (lng < BOUNDS.minLng || lng > BOUNDS.maxLng || lat < BOUNDS.minLat || lat > BOUNDS.maxLat) {
      return NextResponse.json({ error: 'Outside the Dar es Salaam play area' }, { status: 400 });
    }

    const id = `turf-${randomBytes(6).toString('hex')}`;

    // One statement: charge PLANT_COST, plant the turf, write the ledger.
    // The charge re-checks the balance on the locked player row, so it can
    // never overdraw and never lands without the turf. (The turf cap reads
    // the statement snapshot, so two simultaneous plants could both pass it;
    // each needs a won mini-game first, so that's tolerated.)
    const [result] = await sql`
      WITH cnt AS (
        SELECT COUNT(*)::int AS n FROM zones WHERE owner_id = ${player_id} AND id LIKE 'turf-%'
      ),
      charged AS (
        UPDATE players
        SET tide_tokens = players.tide_tokens - ${PLANT_COST},
            zones_owned = players.zones_owned + 1,
            last_active = NOW()
        FROM cnt
        WHERE players.id = ${player_id}
          AND players.tide_tokens >= ${PLANT_COST}
          AND cnt.n < ${MAX_TURFS_PER_PLAYER}
        RETURNING players.*
      ),
      planted AS (
        INSERT INTO zones (id, name, district, tier, type, state,
          owner_id, owner_handle, owner_color,
          lat, lng, radius_meters, claim_strength,
          contested_threshold, daily_yield, upkeep_cost)
        SELECT ${id},
          c.handle || '''s Turf' || CASE WHEN cnt.n = 0 THEN '' ELSE ' ' || (cnt.n + 1) END,
          'Player Turf', 'savanna', 'street_market', 'claimed',
          c.id, c.handle, c.avatar_color,
          ${lat}, ${lng}, 150, 30,
          5, 400, 40
        FROM charged c, cnt
        RETURNING id, name, district, tier, type, state,
          owner_id, owner_handle, owner_color,
          lat::float AS lat, lng::float AS lng, radius_meters,
          claim_strength, trace_count, contested_threshold,
          daily_yield, upkeep_cost, created_at
      ),
      ledger AS (
        INSERT INTO transactions (player_id, type, amount, description, zone_id)
        SELECT c.id, 'plant', ${-PLANT_COST}, 'Planted turf', ${id} FROM charged c
      )
      SELECT
        (SELECT row_to_json(planted) FROM planted) AS zone,
        (SELECT row_to_json(charged) FROM charged) AS player,
        (SELECT n FROM cnt) AS turfs,
        (SELECT tide_tokens FROM players WHERE id = ${player_id}) AS balance
    `;

    if (!result?.zone || !result.player) {
      if (result?.balance === null || result?.balance === undefined) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }
      if (result.turfs >= MAX_TURFS_PER_PLAYER) {
        return NextResponse.json({ error: `Max ${MAX_TURFS_PER_PLAYER} turfs — reinforce what you hold` }, { status: 409 });
      }
      return NextResponse.json(
        { error: `Planting costs ${PLANT_COST.toLocaleString()} Tide — you have ${Number(result.balance).toLocaleString()}` },
        { status: 402 },
      );
    }
    const zone = result.zone;
    const updatedPlayer = result.player;

    const zoneOut = {
      ...zone,
      lat: Number(zone.lat),
      lng: Number(zone.lng),
      traces: [],
      task_demand: null,
      infrastructure: [],
    } as unknown as Zone;

    return NextResponse.json({ zone: zoneOut, player: publicPlayer(updatedPlayer) });
  } catch (err) {
    console.error('POST /api/game/zones', err);
    return NextResponse.json({ error: 'Failed to plant turf' }, { status: 500 });
  }
}
