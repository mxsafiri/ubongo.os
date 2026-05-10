import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();

    const { handle, avatar_color, avatar_pattern, geo_lat, geo_lng } = await req.json();

    if (!handle || handle.length < 2) {
      return NextResponse.json({ error: 'Handle must be at least 2 characters' }, { status: 400 });
    }

    // Return existing player if handle taken (simple re-login by handle)
    const existing = await sql`SELECT * FROM players WHERE handle = ${handle}`;
    if (existing.length > 0) {
      await sql`UPDATE players SET last_active = NOW() WHERE id = ${existing[0].id}`;
      return NextResponse.json({ player: existing[0], returning: true });
    }

    const [player] = await sql`
      INSERT INTO players (handle, avatar_color, avatar_pattern, geo_lat, geo_lng)
      VALUES (${handle}, ${avatar_color ?? '#00C2FF'}, ${avatar_pattern ?? 'waves'}, ${geo_lat ?? null}, ${geo_lng ?? null})
      RETURNING *
    `;

    return NextResponse.json({ player, returning: false });
  } catch (err) {
    console.error('POST /api/game/players', err);
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 });
  }
}
