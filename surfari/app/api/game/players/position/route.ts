import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

// POST /api/game/players/position — Surf Run heartbeat.
// Saves the rider's live position and returns everyone else riding right
// now (active in the last 90s), so clients can render remote runners.
export async function POST(req: NextRequest) {
  try {
    const { player_id, lat, lng } = await req.json();
    if (!player_id || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'player_id, lat, lng required' }, { status: 400 });
    }

    await sql`
      UPDATE players
      SET geo_lat = ${lat}, geo_lng = ${lng}, last_active = NOW()
      WHERE id = ${player_id}
    `;

    const players = await sql`
      SELECT id, handle, avatar_color, geo_lat::float AS lat, geo_lng::float AS lng
      FROM players
      WHERE id != ${player_id}
        AND geo_lat IS NOT NULL
        AND geo_lng IS NOT NULL
        AND last_active > NOW() - INTERVAL '90 seconds'
      LIMIT 40
    `;

    return NextResponse.json({ players });
  } catch (err) {
    console.error('POST /api/game/players/position', err);
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}
