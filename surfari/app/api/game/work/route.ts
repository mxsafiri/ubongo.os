import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { ensureSchema } from '@/lib/db/schema';
import { publicPlayer } from '@/lib/game/economy';
import { AT_PLACE_M, distanceM, findJob } from '@/lib/game/places';
import { doTask, newShift, payout, taskById, type Shift, type TaskId } from '@/lib/game/work';

// Work shifts. The server's clock decides everything: you can only start a
// job where you're standing, tasks respect the shift's stages and their
// cooldowns, and a shift pays out exactly once.
//
//   GET  /api/game/work?player_id=…              → { shift | null, xp }
//   POST /api/game/work { player_id, action: 'start', job_id }
//   POST /api/game/work { player_id, action: 'task', task }
//   POST /api/game/work { player_id, action: 'finish' }

type Row = {
  id: string; job_id: string; place_id: string;
  started_at: string; ends_at: string; perf: number; good_done: number;
  last_used: Partial<Record<TaskId, number>>;
};

const toShift = (r: Row): Shift => ({
  jobId: r.job_id,
  startedAt: new Date(r.started_at).getTime(),
  endsAt: new Date(r.ends_at).getTime(),
  perf: r.perf,
  goodDone: r.good_done,
  lastUsed: r.last_used ?? {},
});

const view = (r: Row) => ({ id: r.id, placeId: r.place_id, ...toShift(r) });

async function openShift(playerId: string): Promise<Row | null> {
  const [row] = await sql`
    SELECT id, job_id, place_id, started_at, ends_at, perf, good_done, last_used
    FROM shifts WHERE player_id = ${playerId} AND finished_at IS NULL
  `;
  return (row as Row) ?? null;
}

async function experience(playerId: string): Promise<Record<string, number>> {
  const rows = await sql`
    SELECT job_id, COUNT(*)::int AS n FROM shifts
    WHERE player_id = ${playerId} AND finished_at IS NOT NULL AND payout > 0
    GROUP BY job_id
  `;
  return Object.fromEntries(rows.map((r) => [r.job_id, r.n]));
}

/** Clock out: pay what the shift earned (once) and credit the ledger. */
async function finish(playerId: string, row: Row, now: number) {
  const found = findJob(row.job_id);
  const xp = (await experience(playerId))[row.job_id] ?? 0;
  const amount = found ? payout(found.job, toShift(row), xp, now) : 0;
  const label = found ? `${found.job.titleEn} · ${found.place.name}` : 'Shift';
  const rows = await sql`
    WITH closed AS (
      UPDATE shifts SET finished_at = NOW(), payout = ${amount}
      WHERE id = ${row.id} AND finished_at IS NULL
      RETURNING payout
    ),
    ledger AS (
      INSERT INTO transactions (player_id, type, amount, description)
      SELECT ${playerId}::uuid, 'work', payout, ${label} FROM closed WHERE payout > 0
    ),
    credited AS (
      UPDATE players SET tide_tokens = tide_tokens + (SELECT payout FROM closed), last_active = NOW()
      WHERE id = ${playerId} AND EXISTS (SELECT 1 FROM closed)
      RETURNING *
    )
    SELECT (SELECT payout FROM closed) AS payout, (SELECT row_to_json(credited) FROM credited) AS player
  `;
  const r = rows[0] ?? {};
  if (r.payout === null || r.payout === undefined) return null; // finished elsewhere
  return { payout: r.payout as number, player: r.player ? publicPlayer(r.player) : null };
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const playerId = req.nextUrl.searchParams.get('player_id');
    if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 });
    const row = await openShift(playerId);
    return NextResponse.json({ shift: row ? view(row) : null, xp: await experience(playerId), now: Date.now() });
  } catch (err) {
    console.error('GET /api/game/work', err);
    return NextResponse.json({ error: 'Could not load work' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const playerId: string | undefined = body.player_id;
    if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 });
    const now = Date.now();

    if (body.action === 'start') {
      const found = findJob(String(body.job_id ?? ''));
      if (!found) return NextResponse.json({ error: 'Unknown job' }, { status: 400 });
      const [me] = await sql`SELECT geo_lat::float AS lat, geo_lng::float AS lng FROM players WHERE id = ${playerId}`;
      if (!me) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      if (me.lat === null || me.lng === null || distanceM(me as { lat: number; lng: number }, found.place) > AT_PLACE_M) {
        return NextResponse.json({ error: `Go to ${found.place.name} first` }, { status: 409 });
      }
      // A shift left running past its end is settled before the next one
      const open = await openShift(playerId);
      if (open) {
        if (now < new Date(open.ends_at).getTime()) {
          return NextResponse.json({ error: 'You are already on a shift', shift: view(open) }, { status: 409 });
        }
        await finish(playerId, open, now);
      }
      const s = newShift(found.job, now);
      const [row] = await sql`
        INSERT INTO shifts (player_id, job_id, place_id, started_at, ends_at)
        VALUES (${playerId}, ${found.job.id}, ${found.place.id}, ${new Date(s.startedAt).toISOString()}, ${new Date(s.endsAt).toISOString()})
        ON CONFLICT DO NOTHING
        RETURNING id, job_id, place_id, started_at, ends_at, perf, good_done, last_used
      `;
      if (!row) return NextResponse.json({ error: 'You are already on a shift' }, { status: 409 });
      return NextResponse.json({ shift: view(row as Row), now });
    }

    const open = await openShift(playerId);
    if (!open) return NextResponse.json({ error: 'No shift in progress' }, { status: 409 });

    if (body.action === 'task') {
      const task = String(body.task ?? '') as TaskId;
      if (!taskById[task]) return NextResponse.json({ error: 'Unknown task' }, { status: 400 });
      const next = doTask(toShift(open), task, now);
      if (typeof next === 'string') return NextResponse.json({ error: next, shift: view(open), now }, { status: 409 });
      // Compare-and-set on the cooldown map: two taps racing can't both land
      const [row] = await sql`
        UPDATE shifts SET perf = ${next.perf}, good_done = ${next.goodDone}, last_used = ${JSON.stringify(next.lastUsed)}::jsonb
        WHERE id = ${open.id} AND finished_at IS NULL AND last_used = ${JSON.stringify(open.last_used ?? {})}::jsonb
        RETURNING id, job_id, place_id, started_at, ends_at, perf, good_done, last_used
      `;
      if (!row) return NextResponse.json({ error: 'cooling_down', shift: view(open), now }, { status: 409 });
      return NextResponse.json({ shift: view(row as Row), now });
    }

    if (body.action === 'finish') {
      const done = await finish(playerId, open, now);
      if (!done) return NextResponse.json({ error: 'Shift already finished' }, { status: 409 });
      return NextResponse.json({ ...done, xp: await experience(playerId) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/game/work', err);
    return NextResponse.json({ error: 'Work request failed' }, { status: 500 });
  }
}
