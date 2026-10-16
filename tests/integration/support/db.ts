import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/dividend_tracker_test";

export const pool = new Pool({ connectionString });

/**
 * Emuliert eine einzelne PostgREST-Anfrage eines angemeldeten Nutzers: eine
 * Transaktion, `SET LOCAL ROLE authenticated` plus die JWT-Claim-GUC lokal
 * fuer genau diese Transaktion (analog zu echtem Supabase/PostgREST, siehe
 * supabase/test-support/local-postgres-bootstrap.sql).
 */
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

/** Emuliert eine nicht angemeldete Anfrage (kein JWT, Rolle anon). */
export async function asAnon<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role anon");
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

/** Direkter Zugriff als Superuser (nur fuer Setup/Seed/Assertions, nie fuer das eigentliche Testverhalten). */
export async function asSuperuser<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Legt einen simulierten auth.users-Eintrag an und liefert dessen id. */
export async function createTestUser(email: string): Promise<string> {
  return asSuperuser(async (client) => {
    const result = await client.query<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      [email],
    );
    return firstRow(result).id;
  });
}

/** Liefert die erste Zeile eines Ergebnisses oder wirft (statt `rows[0]!`). */
export function firstRow<T extends QueryResultRow>(result: QueryResult<T>): T {
  const row = result.rows[0];
  if (!row) {
    throw new Error("Erwartete mindestens eine Ergebniszeile, aber keine erhalten.");
  }
  return row;
}

export async function closePool(): Promise<void> {
  await pool.end();
}
