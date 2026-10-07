import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import { publicPlayer } from '@/lib/game/economy';
import { TRAVEL, distanceM, placeById, travelFare, type TravelModeId } from '@/lib/game/places';

// POST /api/game/travel { player_id, place_id, mode } — pay for a ride to a
// place. The fare is worked out from where the server last saw you, and is
// taken only if you can afford it (in the same statement that checks).
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { player_id, place_id, mode } = await req.json();
    const place = placeById[String(place_id ?? '')];
    if (!player_id || !place || !(mode in TRAVEL)) {
      return NextResponse.json({ error: 'player_id, place_id and a valid mode required' }, { status: 400 });
    }
    const [me] = await sql`SELECT geo_lat::float AS lat, geo_lng::float AS lng FROM players WHERE id = ${player_id}`;
    if (!me) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const meters = me.lat === null || me.lng === null ? 3000 : distanceM(me as { lat: number; lng: number }, place);
    const fare = travelFare(mode as TravelModeId, meters);
    if (fare === 0) return NextResponse.json({ fare: 0 });

    const rows = await sql`
      WITH paid AS (
        UPDATE players SET tide_tokens = tide_tokens - ${fare}, last_active = NOW()
        WHERE id = ${player_id} AND tide_tokens >= ${fare}
        RETURNING *
      ),
      ledger AS (
        INSERT INTO transactions (player_id, type, amount, description)
        SELECT ${player_id}::uuid, 'travel', ${-fare}, ${`${TRAVEL[mode as TravelModeId].labelEn} to ${place.name}`}
        FROM paid
      )
      SELECT row_to_json(paid) AS player FROM paid
    `;
    if (!rows[0]?.player) return NextResponse.json({ error: `Not enough Tide for the fare (${fare})` }, { status: 402 });
    return NextResponse.json({ fare, player: publicPlayer(rows[0].player) });
  } catch (err) {
    console.error('POST /api/game/travel', err);
    return NextResponse.json({ error: 'Could not pay the fare' }, { status: 500 });
  }
}
