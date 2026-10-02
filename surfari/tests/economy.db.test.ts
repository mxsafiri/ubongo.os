import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { TEST_DB, q, startLocalNeon, stopLocalNeon } from './support/localNeon';
import * as players from '@/app/api/game/players/route';
import * as position from '@/app/api/game/players/position/route';
import * as surf from '@/app/api/game/zones/[id]/surf/route';
import * as build from '@/app/api/game/zones/[id]/build/route';
import * as zones from '@/app/api/game/zones/route';
import * as runs from '@/app/api/game/runs/route';
import * as finish from '@/app/api/game/runs/[id]/finish/route';

// Server-side Tide economy against a real Postgres, through the real routes
// and the real Neon driver. Run with TEST_DATABASE_URL=postgres://… npm test

type Handler = (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;
async function call(fn: Handler, body: unknown, id?: string) {
  const req = new NextRequest('http://test/api', { method: 'POST', body: JSON.stringify(body) });
  const res = await (id ? fn(req, { params: Promise.resolve({ id }) }) : fn(req));
  return { status: res.status, body: await res.json() };
}
const tokens = async (id: string) => (await q<{ t: number }>('SELECT tide_tokens AS t FROM players WHERE id = $1', [id]))[0].t;
const ledger = async (id: string, type: string) =>
  (await q<{ s: number }>('SELECT COALESCE(SUM(amount),0)::int AS s FROM transactions WHERE player_id = $1 AND type = $2', [id, type]))[0].s;
const backdateZone = (zone: string, interval: string) =>
  q(`UPDATE zones SET yield_collected_at = NOW() - $2::interval WHERE id = $1`, [zone, interval]);

describe.skipIf(!TEST_DB)('Tide economy (Postgres)', () => {
  let A = '';
  let B = '';
  const Z = 'zone-kariakoo-market'; // 1800 yield − 180 upkeep = 1620 / day

  beforeAll(async () => {
    await startLocalNeon();
    const a = await call(players.POST as Handler, { handle: 'alpha', pin: '1234' });
    const b = await call(players.POST as Handler, { handle: 'bravo', pin: '1234' });
    A = a.body.player.id;
    B = b.body.player.id;
  });
  afterAll(stopLocalNeon);

  it('never sends the PIN hash to the client', async () => {
    const r = await call(players.POST as Handler, { handle: 'alpha', pin: '1234' });
    expect(r.status).toBe(200);
    expect(r.body.player).not.toHaveProperty('pin_hash');
  });

  it('pays turf yield on login, pro-rated, into the ledger', async () => {
    await call(surf.POST as Handler, { player_id: A }, Z);
    await backdateZone(Z, '1 day');
    const before = await tokens(A);
    const r = await call(players.POST as Handler, { player_id: A });
    expect(r.body.yield_collected).toBe(1620);
    expect(await tokens(A)).toBe(before + 1620);
    expect(await ledger(A, 'yield')).toBe(1620);
  });

  it('pays a window once even under concurrent logins', async () => {
    await backdateZone(Z, '1 day');
    const before = await tokens(A);
    const rs = await Promise.all(Array.from({ length: 6 }, () => call(players.POST as Handler, { player_id: A })));
    expect(rs.reduce((s, r) => s + r.body.yield_collected, 0)).toBe(1620);
    expect(await tokens(A)).toBe(before + 1620);
  });

  it('caps idle accrual at 7 days', async () => {
    await backdateZone(Z, '30 days');
    const r = await call(players.POST as Handler, { player_id: A });
    expect(r.body.yield_collected).toBe(1620 * 7);
  });

  it('pays the outgoing owner on capture and restarts the clock', async () => {
    await backdateZone(Z, '12 hours');
    const before = await tokens(A);
    await call(surf.POST as Handler, { player_id: B }, Z);
    expect((await tokens(A)) - before).toBe(810);
    const [{ s }] = await q<{ s: number }>('SELECT EXTRACT(EPOCH FROM NOW() - yield_collected_at)::float AS s FROM zones WHERE id = $1', [Z]);
    expect(s).toBeLessThan(5);
  });

  it('only the owner can build, and only with enough Tide', async () => {
    expect((await call(build.POST as Handler, { player_id: A }, Z)).status).toBe(403);
    await q('UPDATE players SET tide_tokens = 150 WHERE id = $1', [B]);
    expect((await call(build.POST as Handler, { player_id: B }, Z)).status).toBe(409);
    expect((await q<{ level: number }>('SELECT level FROM zones WHERE id = $1', [Z]))[0].level).toBe(1);
    expect(await tokens(B)).toBe(150);
  });

  it('builds charge level × 200 and raise yield; concurrent builds each pay the right price', async () => {
    await q('UPDATE players SET tide_tokens = 10000 WHERE id = $1', [B]);
    const r = await call(build.POST as Handler, { player_id: B }, Z);
    expect(r.body.zone.level).toBe(2);
    expect(r.body.zone.daily_yield).toBe(1950);
    expect(await tokens(B)).toBe(9800);
    await Promise.all([1, 2, 3].map(() => call(build.POST as Handler, { player_id: B }, Z)));
    expect((await q<{ level: number }>('SELECT level FROM zones WHERE id = $1', [Z]))[0].level).toBe(5);
    expect(await tokens(B)).toBe(9800 - 400 - 600 - 800);
    expect(await ledger(B, 'build')).toBe(-2000);
    expect((await call(build.POST as Handler, { player_id: B }, Z)).status).toBe(409);
  });

  describe('Surf Run payouts', () => {
    const start = async () => (await call(runs.POST as Handler, { player_id: A })).body.run_id as string;
    const ago = (id: string, secs: number) => q('UPDATE runs SET started_at = NOW() - make_interval(secs => $2) WHERE id = $1', [id, secs]);

    it('an instant run earns ~nothing whatever it claims', async () => {
      const r = await call(finish.POST as Handler, { player_id: A, distance_m: 5000, tide: 3000 }, await start());
      expect(r.body.payout).toBeLessThan(100);
    });

    it('pays an honest claim, once', async () => {
      const id = await start();
      await ago(id, 120);
      const before = await tokens(A);
      expect((await call(finish.POST as Handler, { player_id: A, distance_m: 3000, tide: 1000 }, id)).body.payout).toBe(1000);
      expect(await tokens(A)).toBe(before + 1000);
      expect((await call(finish.POST as Handler, { player_id: A, distance_m: 3000, tide: 1000 }, id)).status).toBe(409);
    });

    it('caps claims by distance and per run', async () => {
      const a = await start(); await ago(a, 120);
      expect((await call(finish.POST as Handler, { player_id: A, distance_m: 1000, tide: 9999 }, a)).body.payout).toBe(625);
      const b = await start(); await ago(b, 600);
      expect((await call(finish.POST as Handler, { player_id: A, distance_m: 50000, tide: 99999 }, b)).body.payout).toBe(5000);
    });

    it("won't bank someone else's run", async () => {
      const id = await start(); await ago(id, 600);
      expect((await call(finish.POST as Handler, { player_id: B, distance_m: 3000, tide: 500 }, id)).status).toBe(409);
    });

    it('caps run earnings at 20,000 a day', async () => {
      for (let i = 0; i < 6; i++) {
        const id = await start(); await ago(id, 600);
        await call(finish.POST as Handler, { player_id: A, distance_m: 50000, tide: 5000 }, id);
      }
      expect(await ledger(A, 'run')).toBe(20000);
    });
  });

  it('round-trips rider motion in heartbeats and clamps junk', async () => {
    await call(position.POST as Handler, { player_id: A, lat: -6.81, lng: 39.28, heading: 1.2, speed: 44.5, turn: -0.8, mode: 'boda' });
    let r = await call(position.POST as Handler, { player_id: B, lat: -6.82, lng: 39.27 });
    let a = r.body.players.find((p: { id: string }) => p.id === A);
    expect(a).toMatchObject({ heading: 1.2, speed: 44.5, turn: -0.8, mode: 'boda' });
    expect(a.age_s).toBeGreaterThanOrEqual(0);
    await call(position.POST as Handler, { player_id: A, lat: -6.81, lng: 39.28, speed: 1e9, turn: 'x' });
    r = await call(position.POST as Handler, { player_id: B, lat: -6.82, lng: 39.27 });
    a = r.body.players.find((p: { id: string }) => p.id === A);
    expect(a).toMatchObject({ speed: 200, turn: null, mode: 'board', heading: null });
  });

  it('plants turf without leaking the PIN hash', async () => {
    const r = await call(zones.POST as Handler, { player_id: B, lat: -6.8, lng: 39.27 });
    expect(r.status).toBe(200);
    expect(r.body.player).not.toHaveProperty('pin_hash');
  });
});
