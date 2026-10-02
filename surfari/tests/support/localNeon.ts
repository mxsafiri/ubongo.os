// Route the Neon HTTP driver into a plain Postgres for tests.
//
// The app talks to Neon over HTTP (one POST per query). When
// TEST_DATABASE_URL is set, this replaces fetch with a responder that runs
// each query on that Postgres and answers in Neon's wire format (raw text,
// array rows), so the real driver — and its type parsing — is exercised.
// Every run gets its own schema, dropped afterwards.
import { Pool } from 'pg';

export const TEST_DB = process.env.TEST_DATABASE_URL;

let pool: Pool | null = null;
let schema = '';

export async function startLocalNeon() {
  if (!TEST_DB) throw new Error('TEST_DATABASE_URL not set');
  schema = `surfari_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const admin = new Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  pool = new Pool({
    connectionString: TEST_DB,
    max: 10,
    options: `-c search_path=${schema}`,
    types: { getTypeParser: () => (v: string) => v },
  });
  // The driver only needs a well-formed URL; requests never leave this process
  process.env.DATABASE_URL = 'postgresql://test:test@db.local.test/surfari';
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const { query, params } = JSON.parse(String(init?.body));
    try {
      const r = await pool!.query({ text: query, values: params, rowMode: 'array' });
      return new Response(JSON.stringify({
        command: r.command, rowCount: r.rowCount, rowAsArray: true,
        fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        rows: r.rows,
      }));
    } catch (e) {
      const err = e as { message: string; code?: string };
      return new Response(JSON.stringify({ message: err.message, code: err.code }), { status: 400 });
    }
  }) as typeof fetch;
}

export async function stopLocalNeon() {
  await pool?.end();
  if (!TEST_DB || !schema) return;
  const admin = new Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}

/** Run SQL directly against the test schema (setup and assertions). */
export async function q<T = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const c = await pool!.connect();
  try {
    await c.query(`SET search_path TO ${schema}`);
    const r = await c.query({ text, values, types: { getTypeParser: (oid: number) => (v: string) => (oid === 23 || oid === 20 || oid === 700 || oid === 701 || oid === 1700 ? Number(v) : oid === 16 ? v === 't' : v) } });
    return r.rows as T[];
  } finally {
    c.release();
  }
}
