import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { TEST_DB, q, startLocalNeon, stopLocalNeon } from './support/localNeon';
import * as players from '@/app/api/game/players/route';
import * as position from '@/app/api/game/players/position/route';
import * as work from '@/app/api/game/work/route';
import { placeById } from '@/lib/game/places';

// Work shifts against a real Postgres through the real routes.
// Run with TEST_DATABASE_URL=postgres://… npm test

type Handler = (req: NextRequest) => Promise<Response>;
async function post(fn: Handler, body: unknown) {
  const res = await fn(new NextRequest('http://test/api', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}
async function get(playerId: string) {
  const res = await work.GET(new NextRequest(`http://test/api/game/work?player_id=${playerId}`));
  return res.json();
}
const tokens = async (id: string) => (await q<{ t: number }>('SELECT tide_tokens AS t FROM players WHERE id = $1', [id]))[0].t;
const standAt = (id: string, placeId: string) => {
  const p = placeById[placeId];
  return post(position.POST as Handler, { player_id: id, lat: p.lat, lng: p.lng, mode: 'foot' });
};
/** Move the open shift so that `fraction` of it has passed. */
const advance = (id: string, fraction: number, shiftS: number) =>
  q(`UPDATE shifts SET started_at = NOW() - ($2 || ' seconds')::interval,
                      ends_at = NOW() + ($3 || ' seconds')::interval
     WHERE player_id = $1 AND finished_at IS NULL`, [id, String(shiftS * fraction), String(shiftS * (1 - fraction))]);

describe.skipIf(!TEST_DB)('Work shifts (Postgres)', () => {
  let A = '';
  beforeAll(async () => {
    await startLocalNeon();
    A = (await post(players.POST as Handler, { handle: 'worker', pin: '1234' })).body.player.id;
  });
  afterAll(stopLocalNeon);

  it('only starts a job where you are standing', async () => {
    await standAt(A, 'posta');
    const r = await post(work.POST as Handler, { player_id: A, action: 'start', job_id: 'machinga' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Kariakoo/);
  });

  it('starts one shift at a time', async () => {
    await standAt(A, 'kariakoo');
    const r = await post(work.POST as Handler, { player_id: A, action: 'start', job_id: 'machinga' });
    expect(r.status).toBe(200);
    expect(r.body.shift.jobId).toBe('machinga');
    const again = await post(work.POST as Handler, { player_id: A, action: 'start', job_id: 'machinga' });
    expect(again.status).toBe(409);
    expect((await get(A)).shift.jobId).toBe('machinga');
  });

  it('refuses tasks before you are on the job, then applies them with cooldowns', async () => {
    const early = await post(work.POST as Handler, { player_id: A, action: 'task', task: 'kazi' });
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('not_on_the_job');
    await advance(A, 0.3, 120);
    const ok = await post(work.POST as Handler, { player_id: A, action: 'task', task: 'kazi' });
    expect(ok.status).toBe(200);
    expect(ok.body.shift.perf).toBe(56);
    const cool = await post(work.POST as Handler, { player_id: A, action: 'task', task: 'kazi' });
    expect(cool.body.error).toBe('cooling_down');
  });

  it('lets only one of two racing taps land', async () => {
    const rs = await Promise.all([1, 2, 3].map(() => post(work.POST as Handler, { player_id: A, action: 'task', task: 'chakarika' })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await get(A)).shift.perf).toBe(68);
  });

  it('pays nothing for walking off before half the shift', async () => {
    const before = await tokens(A);
    const r = await post(work.POST as Handler, { player_id: A, action: 'finish' });
    expect(r.status).toBe(200);
    expect(r.body.payout).toBe(0);
    expect(await tokens(A)).toBe(before);
    expect((await get(A)).shift).toBeNull();
  });

  it('pays a full shift by performance, once, into the ledger', async () => {
    await post(work.POST as Handler, { player_id: A, action: 'start', job_id: 'machinga' });
    await advance(A, 0.3, 120);
    await post(work.POST as Handler, { player_id: A, action: 'task', task: 'bosi' }); // perf 66
    await advance(A, 1, 120);
    const before = await tokens(A);
    const rs = await Promise.all([1, 2].map(() => post(work.POST as Handler, { player_id: A, action: 'finish' })));
    const paid = rs.filter((r) => r.status === 200);
    expect(paid).toHaveLength(1);
    const expected = Math.round(140 * (0.7 + 0.66 * 0.6));
    expect(paid[0].body.payout).toBe(expected);
    expect(await tokens(A)).toBe(before + expected);
    const [{ s }] = await q<{ s: number }>(`SELECT COALESCE(SUM(amount),0)::int AS s FROM transactions WHERE player_id = $1 AND type = 'work'`, [A]);
    expect(s).toBe(expected);
    expect(paid[0].body.xp.machinga).toBe(1);
  });

  it('settles a forgotten shift when you start the next one', async () => {
    await post(work.POST as Handler, { player_id: A, action: 'start', job_id: 'machinga' });
    await advance(A, 1.5, 120); // ran out long ago
    const before = await tokens(A);
    const r = await post(work.POST as Handler, { player_id: A, action: 'start', job_id: 'machinga' });
    expect(r.status).toBe(200);
    expect(await tokens(A)).toBe(before + 140);
  });
});
