import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import { DAR_ZONES } from '@/lib/game/zones';
import type { Zone } from '@/types';

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
