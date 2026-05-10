import { neon } from '@neondatabase/serverless';

// Lazy wrapper — neon() is called at request time, never at build time.
// This keeps the same `sql\`...\`` usage at all call sites.
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url)(strings, ...values);
}
