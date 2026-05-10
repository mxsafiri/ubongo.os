import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import type { Zone } from '@/types';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: zoneId } = await ctx.params;
    const { player_id } = await req.json();

    if (!player_id) {
      return NextResponse.json({ error: 'player_id required' }, { status: 400 });
    }

    const [zone] = await sql`SELECT * FROM zones WHERE id = ${zoneId}`;
    const [player] = await sql`SELECT * FROM players WHERE id = ${player_id}`;

    if (!zone || !player) {
      return NextResponse.json({ error: 'Zone or player not found' }, { status: 404 });
    }

    let updatedZone;
    let updatedPlayer = player;

    if (zone.owner_id === player.id) {
      // Player already owns it — reinforce claim strength
      [updatedZone] = await sql`
        UPDATE zones
        SET claim_strength = LEAST(claim_strength + 10, 100),
            trace_count = trace_count + 1
        WHERE id = ${zoneId}
        RETURNING *
      `;
    } else {
      // Claim the zone
      const wasOwned = !!zone.owner_id;

      [updatedZone] = await sql`
        UPDATE zones
        SET owner_id = ${player.id},
            owner_handle = ${player.handle},
            owner_color = ${player.avatar_color},
            state = 'claimed',
            claim_strength = 50,
            trace_count = trace_count + 1
        WHERE id = ${zoneId}
        RETURNING *
      `;

      // Update previous owner's count
      if (wasOwned) {
        await sql`
          UPDATE players SET zones_owned = GREATEST(zones_owned - 1, 0)
          WHERE id = ${zone.owner_id}
        `;
      }

      // Update new owner
      [updatedPlayer] = await sql`
        UPDATE players
        SET zones_owned = zones_owned + 1,
            traces_left = traces_left + 1,
            last_active = NOW()
        WHERE id = ${player.id}
        RETURNING *
      `;
    }

    const resultZone: Partial<Zone> = {
      id: updatedZone.id,
      state: updatedZone.state,
      owner_id: updatedZone.owner_id ?? null,
      owner_handle: updatedZone.owner_handle ?? null,
      owner_color: updatedZone.owner_color ?? null,
      claim_strength: updatedZone.claim_strength,
      trace_count: updatedZone.trace_count,
    };

    return NextResponse.json({ zone: resultZone, player: updatedPlayer });
  } catch (err) {
    console.error('POST /api/game/zones/[id]/surf', err);
    return NextResponse.json({ error: 'Surf failed' }, { status: 500 });
  }
}
