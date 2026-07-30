import { Pool, type PoolClient } from "pg";

/**
 * Datenbankzugriff der angemeldeten Browsertests — dieselbe Testdatenbank, die
 * `npm run db:test:reset` aufbaut, und dieselbe Anfrage-Umgebung wie in
 * `tests/integration/support/db.ts` (Rolle + JWT-Claims je Transaktion).
 *
 * Bewusst getrennt von der Integrations-Testhilfe: Beide Suiten laufen in
 * eigenen Prozessen mit eigenem Verbindungspool und sollen sich nicht
 * gegenseitig am Leben halten.
 */
const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/dividend_tracker_test";

export const pool = new Pool({ connectionString, max: 4 });

/** Führt Anweisungen als angemeldeter Nutzer aus (RLS aktiv). */
export async function asUser<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Direkter Zugriff für Aufbau und Nachprüfung (nie für das Testverhalten selbst). */
export async function asSuperuser<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
