import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import { DAR_ZONES } from '@/lib/game/zones';
import type { Zone } from '@/types';

const MAX_TURFS_PER_PLAYER = 5;
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
             daily_yield, upkeep_cost, created_at
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

    const [player] = await sql`SELECT id, handle, avatar_color, zones_owned FROM players WHERE id = ${player_id}`;
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    const [{ count: turfCount }] = await sql`
      SELECT COUNT(*)::int AS count FROM zones
      WHERE owner_id = ${player_id} AND id LIKE 'turf-%'
    `;
    if (turfCount >= MAX_TURFS_PER_PLAYER) {
      return NextResponse.json({ error: `Max ${MAX_TURFS_PER_PLAYER} turfs — reinforce what you hold` }, { status: 409 });
    }

    const id = `turf-${randomBytes(6).toString('hex')}`;
    const name = turfCount === 0 ? `${player.handle}'s Turf` : `${player.handle}'s Turf ${turfCount + 1}`;

    const [zone] = await sql`
      INSERT INTO zones (id, name, district, tier, type, state,
        owner_id, owner_handle, owner_color,
        lat, lng, radius_meters, claim_strength,
        contested_threshold, daily_yield, upkeep_cost)
      VALUES (
        ${id}, ${name}, 'Player Turf', 'savanna', 'street_market', 'claimed',
        ${player.id}, ${player.handle}, ${player.avatar_color},
        ${lat}, ${lng}, 150, 30,
        5, 400, 40
      )
      RETURNING id, name, district, tier, type, state,
        owner_id, owner_handle, owner_color,
        lat::float, lng::float, radius_meters,
        claim_strength, trace_count, contested_threshold,
        daily_yield, upkeep_cost, created_at
    `;

    const [updatedPlayer] = await sql`
      UPDATE players SET zones_owned = zones_owned + 1, last_active = NOW()
      WHERE id = ${player_id}
      RETURNING *
    `;

    const zoneOut = {
      ...zone,
      lat: Number(zone.lat),
      lng: Number(zone.lng),
      traces: [],
      task_demand: null,
      infrastructure: [],
    } as unknown as Zone;

    return NextResponse.json({ zone: zoneOut, player: updatedPlayer });
  } catch (err) {
    console.error('POST /api/game/zones', err);
    return NextResponse.json({ error: 'Failed to plant turf' }, { status: 500 });
  }
}
