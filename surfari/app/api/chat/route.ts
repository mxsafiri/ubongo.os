import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(req.url);
    const zone_id = searchParams.get('zone_id');
    const after = searchParams.get('after');

    let rows;
    if (zone_id && after) {
      rows = await sql`
        SELECT id, zone_id, player_id, player_handle, player_color, content, msg_type, created_at
        FROM messages WHERE zone_id = ${zone_id} AND created_at > ${after}::timestamptz
        ORDER BY created_at ASC LIMIT 50
      `;
    } else if (zone_id) {
      rows = (await sql`
        SELECT id, zone_id, player_id, player_handle, player_color, content, msg_type, created_at
        FROM messages WHERE zone_id = ${zone_id}
        ORDER BY created_at DESC LIMIT 40
      `).reverse();
    } else if (after) {
      rows = await sql`
        SELECT id, zone_id, player_id, player_handle, player_color, content, msg_type, created_at
        FROM messages WHERE zone_id IS NULL AND created_at > ${after}::timestamptz
        ORDER BY created_at ASC LIMIT 50
      `;
    } else {
      rows = (await sql`
        SELECT id, zone_id, player_id, player_handle, player_color, content, msg_type, created_at
        FROM messages WHERE zone_id IS NULL
        ORDER BY created_at DESC LIMIT 40
      `).reverse();
    }

    return NextResponse.json({ messages: rows });
  } catch (err) {
    console.error('GET /api/chat', err);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { zone_id, player_id, player_handle, player_color, content, msg_type = 'user' } = await req.json();
    if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 });

    const [message] = await sql`
      INSERT INTO messages (zone_id, player_id, player_handle, player_color, content, msg_type)
      VALUES (${zone_id ?? null}, ${player_id ?? null}, ${player_handle ?? null},
              ${player_color ?? null}, ${content.trim().slice(0, 500)}, ${msg_type})
      RETURNING *
    `;
    return NextResponse.json({ message });
  } catch (err) {
    console.error('POST /api/chat', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
