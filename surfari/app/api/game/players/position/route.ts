import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null;

// POST /api/game/players/position — Surf Run heartbeat.
// Saves the rider's live position and motion (heading, speed, turn rate,
// board/boda) and returns everyone else riding right now (active in the
// last 90s), with how stale each fix is, so clients can dead-reckon them.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { player_id, lat, lng, heading, speed, turn, mode } = await req.json();
    if (!player_id || typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'player_id, lat, lng required' }, { status: 400 });
    }

    await sql`
      UPDATE players
      SET geo_lat = ${lat}, geo_lng = ${lng},
          geo_heading = ${num(heading, -10, 10)},
          geo_speed = ${num(speed, 0, 200)},
          geo_turn = ${num(turn, -5, 5)},
          geo_mode = ${mode === 'boda' ? 'boda' : 'board'},
          last_active = NOW()
      WHERE id = ${player_id}
    `;

    const players = await sql`
      SELECT id, handle, avatar_color,
             geo_lat::float AS lat, geo_lng::float AS lng,
             geo_heading AS heading, geo_speed AS speed, geo_turn AS turn, geo_mode AS mode,
             EXTRACT(EPOCH FROM NOW() - last_active)::float AS age_s
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
