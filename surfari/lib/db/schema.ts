import { sql } from './client';
import { DAR_ZONES } from '@/lib/game/zones';

// Schema setup runs once per server instance, not on every request.
let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = migrate().catch((err) => {
      ready = null; // let the next request retry
      throw err;
    });
  }
  return ready;
}

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      handle VARCHAR(50) UNIQUE NOT NULL,
      avatar_color VARCHAR(20) DEFAULT '#00D4FF',
      avatar_pattern VARCHAR(50) DEFAULT 'waves',
      origin_zone_id VARCHAR(100),
      tide_tokens INTEGER DEFAULT 100000,
      tier VARCHAR(20) DEFAULT 'surfari',
      reputation INTEGER DEFAULT 0,
      zones_owned INTEGER DEFAULT 0,
      assets_owned INTEGER DEFAULT 0,
      traces_left INTEGER DEFAULT 0,
      traces_received INTEGER DEFAULT 0,
      geo_lat DECIMAL(10,7),
      geo_lng DECIMAL(10,7),
      pin_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_active TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add pin_hash to existing deployments that predate this column
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS pin_hash TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS zones (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      district VARCHAR(100) NOT NULL,
      tier VARCHAR(50) NOT NULL,
      type VARCHAR(50) NOT NULL,
      state VARCHAR(50) DEFAULT 'unclaimed',
      owner_id UUID REFERENCES players(id) ON DELETE SET NULL,
      owner_handle VARCHAR(50),
      owner_color VARCHAR(20),
      lat DECIMAL(10,7) NOT NULL,
      lng DECIMAL(10,7) NOT NULL,
      radius_meters INTEGER DEFAULT 200,
      claim_strength INTEGER DEFAULT 0,
      trace_count INTEGER DEFAULT 0,
      contested_threshold INTEGER DEFAULT 5,
      daily_yield INTEGER NOT NULL,
      upkeep_cost INTEGER NOT NULL,
      level INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add level to existing deployments that predate this column
  await sql`ALTER TABLE zones ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1`;

  // Yield clock: owned zones accrue Tide from this moment until it's settled
  await sql`ALTER TABLE zones ADD COLUMN IF NOT EXISTS yield_collected_at TIMESTAMPTZ DEFAULT NOW()`;

  // Ledger — every server-side change to a player's Tide balance lands here
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id UUID REFERENCES players(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      zone_id VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS transactions_player_created ON transactions(player_id, created_at DESC)`;

  // Surf Runs — the server clocks each run so payouts can be sanity-checked
  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id UUID REFERENCES players(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      distance_m INTEGER,
      claimed_tide INTEGER,
      payout INTEGER
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      zone_id VARCHAR(100) REFERENCES zones(id) ON DELETE CASCADE,
      player_id UUID REFERENCES players(id) ON DELETE SET NULL,
      player_handle VARCHAR(50),
      player_color VARCHAR(20),
      content TEXT NOT NULL,
      msg_type VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS messages_zone_created ON messages(zone_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS messages_global_created ON messages(created_at DESC) WHERE zone_id IS NULL`;

  // Seed zones from static data if the table is empty
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM zones`;
  if (count === 0) {
    for (const z of DAR_ZONES) {
      await sql`
        INSERT INTO zones (id, name, district, tier, type, lat, lng, radius_meters,
          contested_threshold, daily_yield, upkeep_cost)
        VALUES (
          ${z.id}, ${z.name}, ${z.district}, ${z.tier}, ${z.type},
          ${z.lat}, ${z.lng}, ${z.radius_meters},
          ${z.contested_threshold}, ${z.daily_yield}, ${z.upkeep_cost}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
  }
}
