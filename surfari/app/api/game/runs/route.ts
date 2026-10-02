import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';

// POST /api/game/runs — start a Surf Run. The server's start time is what
// the payout check uses, so a client can't claim a longer run than it rode.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { player_id } = await req.json();
    if (!player_id) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

    const [run] = await sql`
      INSERT INTO runs (player_id)
      SELECT id FROM players WHERE id = ${player_id}
      RETURNING id
    `;
    if (!run) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    return NextResponse.json({ run_id: run.id });
  } catch (err) {
    console.error('POST /api/game/runs', err);
    return NextResponse.json({ error: 'Could not start run' }, { status: 500 });
  }
}
