import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';

function hashPin(pin: string, handle: string): string {
  return createHash('sha256').update(`surfari:${handle}:${pin}`).digest('hex');
}

// GET /api/game/players?handle=xxx  — check if a handle is taken
export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle')?.toLowerCase().trim();
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 });
  await ensureSchema();
  const rows = await sql`SELECT id FROM players WHERE handle = ${handle}`;
  return NextResponse.json({ exists: rows.length > 0 });
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();

    const body = await req.json();
    const { player_id, handle, avatar_color, avatar_pattern, pin, geo_lat, geo_lng } = body;

    // ── Mode 1: same-device restore via player_id (localStorage) ──────────
    if (player_id) {
      const rows = await sql`SELECT * FROM players WHERE id = ${player_id}`;
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }
      await sql`UPDATE players SET last_active = NOW() WHERE id = ${player_id}`;
      return NextResponse.json({ player: rows[0], returning: true });
    }

    // ── Shared handle validation ───────────────────────────────────────────
    const h = handle?.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (!h || h.length < 2) {
      return NextResponse.json({ error: 'Handle must be at least 2 characters' }, { status: 400 });
    }

    const existing = await sql`SELECT * FROM players WHERE handle = ${h}`;

    // ── Mode 2: new player — PIN required to create ────────────────────────
    if (existing.length === 0) {
      if (!pin || String(pin).length < 4) {
        return NextResponse.json({ error: 'A 4-digit PIN is required to claim this handle' }, { status: 400 });
      }
      const pin_hash = hashPin(String(pin), h);
      const [player] = await sql`
        INSERT INTO players (handle, avatar_color, avatar_pattern, pin_hash, geo_lat, geo_lng)
        VALUES (${h}, ${avatar_color ?? '#00C2FF'}, ${avatar_pattern ?? 'waves'}, ${pin_hash}, ${geo_lat ?? null}, ${geo_lng ?? null})
        RETURNING *
      `;
      return NextResponse.json({ player, returning: false });
    }

    // ── Mode 3: returning player on new device — verify PIN ────────────────
    const row = existing[0];

    // Legacy accounts with no PIN set: accept without PIN and set it now
    if (!row.pin_hash) {
      if (pin && String(pin).length >= 4) {
        const pin_hash = hashPin(String(pin), h);
        await sql`UPDATE players SET pin_hash = ${pin_hash}, last_active = NOW() WHERE id = ${row.id}`;
      } else {
        await sql`UPDATE players SET last_active = NOW() WHERE id = ${row.id}`;
      }
      return NextResponse.json({ player: row, returning: true });
    }

    if (!pin) {
      return NextResponse.json({ error: 'PIN required', needs_pin: true }, { status: 401 });
    }

    const attempt = hashPin(String(pin), h);
    if (attempt !== row.pin_hash) {
      return NextResponse.json({ error: 'Incorrect PIN', needs_pin: true }, { status: 401 });
    }

    await sql`UPDATE players SET last_active = NOW() WHERE id = ${row.id}`;
    return NextResponse.json({ player: row, returning: true });

  } catch (err) {
    console.error('POST /api/game/players', err);
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 });
  }
}
