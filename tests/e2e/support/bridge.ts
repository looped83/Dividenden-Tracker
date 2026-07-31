import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Pool, type PoolClient } from "pg";
import { mintAccessToken, verifyAccessToken } from "./jwt";

/**
 * Testbruecke zwischen der gebauten Anwendung und einer **echten**
 * PostgreSQL-Testdatenbank (TEST_STRATEGY.md, Phase A).
 *
 * Die angemeldeten Browsertests sollen dieselbe Fachlogik treffen wie die
 * Produktion: RLS, Constraints, Trigger und die RPCs (`archive_payment`,
 * `commit_import`, `restore_backup`). Deshalb wird der Server **nicht**
 * nachgebaut, sondern nur der HTTP-Teil uebersetzt:
 *
 * - `/rest/v1/…`  → SQL gegen die Testdatenbank, ausgefuehrt in einer
 *   Transaktion mit `set local role authenticated` und der JWT-Claim-GUC —
 *   identisch zu `tests/integration/support/db.ts` und zu dem, was PostgREST
 *   auf einem echten Projekt tut.
 * - `/auth/v1/…` → das Noetigste aus GoTrue (Anmelden, Abmelden, Nutzer,
 *   Token-Erneuerung). Passwoerter werden nicht geprueft: Die Testdatenbank
 *   emuliert `auth.users` ohne Passwortspeicher.
 *
 * **Grundsatz: lieber laut scheitern als still danebenliegen.** Jede
 * PostgREST-Eigenschaft, die hier nicht abgebildet ist (unbekannter Operator,
 * unbekannter Parameter), fuehrt zu 501 statt zu einem stillschweigend
 * ignorierten Filter. Ein Test, der dadurch rot wird, ist ein guter Test; ein
 * Test, der auf ungefilterten Daten gruen wird, waere genau die Attrappe, die
 * dieses Projekt einmal teuer bezahlt hat (docs/AUDIT_2026-07-29.md §3.5).
 */

const DEFAULT_CONNECTION =
  "postgresql://postgres:postgres@127.0.0.1:5432/dividend_tracker_test";

/** Reservierte Abfrageparameter von PostgREST (alles andere ist ein Spaltenfilter). */
const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset"]);

/**
 * Eingebettete Beziehungen, die die Anwendung tatsaechlich abfragt
 * (`securities!inner(name, ticker)` in der Eingangsliste). Absichtlich eine
 * kurze, ausdrueckliche Liste statt einer Fremdschluessel-Ermittlung: Was hier
 * fehlt, faellt als 501 auf.
 */
const EMBEDS: Record<string, Record<string, { table: string; fk: string }>> = {
  dividend_payments: {
    securities: { table: "securities", fk: "security_id" },
    depots: { table: "depots", fk: "depot_id" },
  },
};

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

class BridgeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: string | null = null,
  ) {
    super(message);
  }
}

function ident(name: string): string {
  const trimmed = name.trim();
  if (!IDENTIFIER.test(trimmed)) {
    throw new BridgeError(501, "PGRSTX01", `Unerwarteter Bezeichner: ${trimmed}`);
  }
  return `"${trimmed}"`;
}

// --- Abfrageuebersetzung -----------------------------------------------------

interface SelectPart {
  columns: string[];
  embeds: { alias: string; table: string; fk: string; columns: string[] }[];
}

/** Zerlegt eine Auswahlliste an den Kommas der obersten Ebene. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseSelect(table: string, select: string | null): SelectPart {
  const result: SelectPart = { columns: [], embeds: [] };
  if (!select || select.trim() === "*") {
    result.columns.push("*");
    return result;
  }
  for (const part of splitTopLevel(select)) {
    // `security:securities(name)` — PostgREST erlaubt der Einbettung einen
    // eigenen Namen in der Antwort. Der Datenexport nutzt das, damit `security`
    // und `depot` im Ergebnis einzahlig heissen.
    const embedMatch =
      /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(!inner)?\((.*)\)$/.exec(part);
    if (embedMatch) {
      const [, alias, relation, , inner] = embedMatch as unknown as [
        string,
        string | undefined,
        string,
        string | undefined,
        string,
      ];
      const relations = EMBEDS[table];
      const embed = relations?.[relation];
      if (!embed) {
        throw new BridgeError(
          501,
          "PGRSTX02",
          `Eingebettete Beziehung ${table}.${relation} ist in der Testbruecke nicht hinterlegt.`,
        );
      }
      result.embeds.push({
        alias: alias ?? relation,
        table: embed.table,
        fk: embed.fk,
        columns: splitTopLevel(inner),
      });
      continue;
    }
    result.columns.push(part);
  }
  if (result.columns.length === 0) result.columns.push("*");
  return result;
}

function buildSelectList(table: string, parsed: SelectPart): string {
  const columns = parsed.columns.map((column) =>
    column === "*" ? "t.*" : `t.${ident(column)}`,
  );
  for (const embed of parsed.embeds) {
    const pairs = embed.columns
      .map((column) => `'${column.trim()}', e.${ident(column)}`)
      .join(", ");
    columns.push(
      `(select json_build_object(${pairs}) from ${ident(embed.table)} e ` +
        `where e."id" = t.${ident(embed.fk)}) as ${ident(embed.alias)}`,
    );
  }
  return columns.join(", ");
}

interface WhereClause {
  sql: string;
  values: unknown[];
}

/**
 * Uebersetzt die Spaltenfilter der Anfrage. Unterstuetzt genau die Operatoren,
 * die die Anwendung verwendet — jeder andere ist ein 501.
 */
function buildWhere(
  params: URLSearchParams,
  parsed: SelectPart,
  startIndex = 1,
): WhereClause {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let index = startIndex;

  for (const [key, raw] of params.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    const column = ident(key);
    const [operator, ...rest] = raw.split(".");
    const value = rest.join(".");

    switch (operator) {
      case "eq":
        conditions.push(`t.${column} = $${String(index)}`);
        values.push(value);
        index += 1;
        break;
      case "is":
        if (value !== "null") {
          throw new BridgeError(501, "PGRSTX03", `is.${value} wird nicht unterstuetzt.`);
        }
        conditions.push(`t.${column} is null`);
        break;
      case "in": {
        const list = value.replace(/^\(/, "").replace(/\)$/, "");
        const items = list
          .split(",")
          .map((item) => item.trim().replace(/^"(.*)"$/, "$1"))
          .filter((item) => item.length > 0);
        conditions.push(`t.${column} = any($${String(index)})`);
        values.push(items);
        index += 1;
        break;
      }
      default:
        throw new BridgeError(
          501,
          "PGRSTX04",
          `Filteroperator "${String(operator)}" ist in der Testbruecke nicht hinterlegt (${key}=${raw}).`,
        );
    }
  }

  // `!inner` bedeutet: nur Zeilen mit vorhandener Beziehung.
  for (const embed of parsed.embeds) {
    conditions.push(
      `exists (select 1 from ${ident(embed.table)} i where i."id" = t.${ident(embed.fk)})`,
    );
  }

  return {
    sql: conditions.length > 0 ? ` where ${conditions.join(" and ")}` : "",
    values,
  };
}

function buildOrder(order: string | null): string {
  if (!order) return "";
  const parts = splitTopLevel(order).map((part) => {
    const [column, ...modifiers] = part.split(".");
    const direction = modifiers.includes("desc") ? "desc" : "asc";
    const nulls = modifiers.includes("nullsfirst")
      ? " nulls first"
      : modifiers.includes("nullslast")
        ? " nulls last"
        : "";
    return `t.${ident(column ?? "")} ${direction}${nulls}`;
  });
  return ` order by ${parts.join(", ")}`;
}

/** `Range: 0-999` (PostgREST-Paginierung) bzw. `limit`/`offset`. */
function buildRange(
  headers: IncomingMessage["headers"],
  params: URLSearchParams,
): { sql: string; offset: number; limit: number | null } {
  const rangeHeader = typeof headers.range === "string" ? headers.range : null;
  if (rangeHeader) {
    const match = /^(\d+)-(\d+)$/.exec(rangeHeader.replace(/^items=/, ""));
    if (!match) {
      throw new BridgeError(
        501,
        "PGRSTX05",
        `Range-Kopf nicht unterstuetzt: ${rangeHeader}`,
      );
    }
    const from = Number(match[1]);
    const to = Number(match[2]);
    return {
      sql: ` limit ${String(to - from + 1)} offset ${String(from)}`,
      offset: from,
      limit: to - from + 1,
    };
  }
  const limit = params.get("limit");
  const offset = params.get("offset");
  let sql = "";
  if (limit) sql += ` limit ${String(Number(limit))}`;
  if (offset) sql += ` offset ${String(Number(offset))}`;
  return {
    sql,
    offset: offset ? Number(offset) : 0,
    limit: limit ? Number(limit) : null,
  };
}

// --- Datenbankzugriff --------------------------------------------------------

interface Requester {
  userId: string | null;
  email: string | null;
}

/**
 * Fuehrt die Anfrage in derselben Umgebung aus wie PostgREST: eine Transaktion,
 * Rolle `authenticated` (bzw. `anon`) und die JWT-Claims als GUC. Damit gelten
 * die echten RLS-Policies.
 */
async function inRequestContext<T>(
  pool: Pool,
  requester: Requester,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (requester.userId) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: requester.userId, role: "authenticated" }),
      ]);
    } else {
      await client.query("set local role anon");
    }
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

// --- HTTP --------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  "access-control-allow-headers":
    "authorization,apikey,content-type,prefer,range,x-client-info,accept,accept-profile,content-profile,x-supabase-api-version",
  "access-control-expose-headers": "content-range,content-length",
  "access-control-max-age": "86400",
};

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): void {
  const payload = body === null ? "" : JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    ...extra,
    "content-type": "application/json; charset=utf-8",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return null;
  return JSON.parse(text) as unknown;
}

function bearerOf(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function requesterOf(req: IncomingMessage): Requester {
  const token = bearerOf(req);
  if (!token) return { userId: null, email: null };
  const claims = verifyAccessToken(token);
  if (!claims) return { userId: null, email: null };
  return { userId: claims.sub, email: claims.email };
}

function prefersRepresentation(req: IncomingMessage): boolean {
  const prefer = req.headers.prefer;
  return typeof prefer === "string" && prefer.includes("return=representation");
}

function wantsExactCount(req: IncomingMessage): boolean {
  const prefer = req.headers.prefer;
  return typeof prefer === "string" && prefer.includes("count=exact");
}

function wantsSingleObject(req: IncomingMessage): boolean {
  const accept = req.headers.accept;
  return (
    typeof accept === "string" && accept.includes("application/vnd.pgrst.object+json")
  );
}

/** PostgREST liefert `PGRST116`, wenn `.single()` nicht genau eine Zeile bekommt. */
function singleOrThrow(rows: unknown[]): unknown {
  if (rows.length === 1) return rows[0];
  throw new BridgeError(
    406,
    "PGRST116",
    "JSON object requested, multiple (or no) rows returned",
    `Results contain ${String(rows.length)} rows`,
  );
}

// --- Auth (GoTrue-Teilmenge) -------------------------------------------------

interface AuthUserRow {
  id: string;
  email: string | null;
  created_at: string;
}

function sessionPayload(user: AuthUserRow): Record<string, unknown> {
  const { token, expiresAt } = mintAccessToken(user.id, user.email ?? "");
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: expiresAt - Math.floor(Date.now() / 1000),
    expires_at: expiresAt,
    refresh_token: `refresh-${user.id}`,
    user: userPayload(user),
  };
}

function userPayload(user: AuthUserRow): Record<string, unknown> {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.created_at,
    confirmed_at: user.created_at,
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: user.created_at,
    updated_at: user.created_at,
  };
}

async function findUserByEmail(pool: Pool, email: string): Promise<AuthUserRow | null> {
  const result = await pool.query<AuthUserRow>(
    "select id, email, created_at from auth.users where lower(email) = lower($1)",
    [email],
  );
  return result.rows[0] ?? null;
}

async function findUserById(pool: Pool, id: string): Promise<AuthUserRow | null> {
  const result = await pool.query<AuthUserRow>(
    "select id, email, created_at from auth.users where id = $1",
    [id],
  );
  return result.rows[0] ?? null;
}

async function handleAuth(
  pool: Pool,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const path = url.pathname.replace(/^\/auth\/v1/, "");

  if (path === "/logout") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (path === "/user" && req.method === "GET") {
    const requester = requesterOf(req);
    if (!requester.userId) {
      sendJson(res, 401, { message: "invalid claim: missing sub claim", code: 401 });
      return;
    }
    const user = await findUserById(pool, requester.userId);
    if (!user) {
      sendJson(res, 401, {
        message: "User from sub claim in JWT does not exist",
        code: 401,
      });
      return;
    }
    sendJson(res, 200, userPayload(user));
    return;
  }

  if (path === "/token") {
    const grantType = url.searchParams.get("grant_type");
    const body = (await readBody(req)) as {
      email?: string;
      password?: string;
      refresh_token?: string;
    } | null;

    if (grantType === "password") {
      // Die Testdatenbank emuliert `auth.users` ohne Passwortspeicher: Ein
      // vorhandenes Konto meldet sich an, ein unbekanntes nicht. Das genuegt,
      // um den Anmeldeweg der Oberflaeche samt Fehlerfall zu pruefen.
      const email = body?.email ?? "";
      const user = email ? await findUserByEmail(pool, email) : null;
      if (!user || !body?.password) {
        sendJson(res, 400, {
          error: "invalid_grant",
          error_description: "Invalid login credentials",
          msg: "Invalid login credentials",
        });
        return;
      }
      sendJson(res, 200, sessionPayload(user));
      return;
    }

    if (grantType === "refresh_token") {
      const userId = (body?.refresh_token ?? "").replace(/^refresh-/, "");
      const user = userId ? await findUserById(pool, userId) : null;
      if (!user) {
        sendJson(res, 400, {
          error: "invalid_grant",
          error_description: "Invalid Refresh Token",
          msg: "Invalid Refresh Token",
        });
        return;
      }
      sendJson(res, 200, sessionPayload(user));
      return;
    }

    throw new BridgeError(
      501,
      "PGRSTX06",
      `grant_type ${String(grantType)} fehlt in der Bruecke.`,
    );
  }

  throw new BridgeError(501, "PGRSTX07", `Auth-Pfad ${path} fehlt in der Bruecke.`);
}

// --- REST --------------------------------------------------------------------

async function handleRest(
  pool: Pool,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const path = url.pathname.replace(/^\/rest\/v1/, "");
  const requester = requesterOf(req);
  const params = url.searchParams;

  // Funktionsaufrufe (RPC) laufen unveraendert gegen die echten Funktionen.
  if (path.startsWith("/rpc/")) {
    const fn = path.slice("/rpc/".length);
    const args = ((await readBody(req)) ?? {}) as Record<string, unknown>;
    const names = Object.keys(args);
    const assignments = names
      .map((name, position) => `${ident(name)} := $${String(position + 1)}`)
      .join(", ");
    const values = names.map((name) => {
      const value = args[name];
      // jsonb-Parameter muessen als Text uebergeben werden, sonst versucht der
      // Treiber ein Array zu binden.
      return typeof value === "object" && value !== null ? JSON.stringify(value) : value;
    });
    const rows = await inRequestContext(pool, requester, async (client) => {
      const result = await client.query<{ result: unknown }>(
        `select to_jsonb(${ident(fn)}(${assignments})) as result`,
        values,
      );
      return result.rows;
    });
    sendJson(res, 200, rows[0]?.result ?? null);
    return;
  }

  const table = path.replace(/^\//, "");
  const parsed = parseSelect(table, params.get("select"));
  const method = req.method ?? "GET";

  if (method === "GET" || method === "HEAD") {
    const where = buildWhere(params, parsed);
    const range = buildRange(req.headers, params);
    const { rows, total } = await inRequestContext(pool, requester, async (client) => {
      // `to_jsonb` liefert exakt die Darstellung, die auch PostgREST ausgibt:
      // `date` als "2026-04-08", `timestamptz` als ISO-8601 mit Zonenversatz,
      // `numeric` als JSON-Zahl. Der Treiber wuerde sonst eigene Typen bilden
      // (Date-Objekte, Strings fuer numeric) — und der Test liefe auf Daten,
      // die es in der Anwendung nie gibt.
      const data =
        method === "HEAD"
          ? { rows: [] as { row: Record<string, unknown> }[] }
          : await client.query<{ row: Record<string, unknown> }>(
              "select to_jsonb(sub) as row from (" +
                `select ${buildSelectList(table, parsed)} from ${ident(table)} t` +
                where.sql +
                buildOrder(params.get("order")) +
                range.sql +
                ") sub",
              where.values,
            );
      let count: number | null = null;
      if (wantsExactCount(req)) {
        const counted = await client.query<{ count: string }>(
          `select count(*)::text as count from ${ident(table)} t` + where.sql,
          where.values,
        );
        count = Number(counted.rows[0]?.count ?? "0");
      }
      return { rows: data.rows.map((entry) => entry.row), total: count };
    });

    const last = range.offset + Math.max(rows.length, 1) - 1;
    const contentRange = `${String(range.offset)}-${String(last)}/${
      total === null ? "*" : String(total)
    }`;

    if (method === "HEAD") {
      res.writeHead(200, { ...CORS_HEADERS, "content-range": contentRange });
      res.end();
      return;
    }
    sendJson(res, 200, wantsSingleObject(req) ? singleOrThrow(rows) : rows, {
      "content-range": contentRange,
    });
    return;
  }

  if (method === "POST") {
    const body = await readBody(req);
    const records = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
    if (records.length === 0) {
      sendJson(res, 201, []);
      return;
    }
    const columns = Object.keys(records[0] ?? {});
    const rows = await inRequestContext(pool, requester, async (client) => {
      const inserted: Record<string, unknown>[] = [];
      for (const record of records) {
        const values = columns.map((column) => record[column]);
        const placeholders = columns
          .map((_, index) => `$${String(index + 1)}`)
          .join(", ");
        const result = await client.query<{ row: Record<string, unknown> }>(
          `with neu as (insert into ${ident(table)} (${columns.map(ident).join(", ")}) ` +
            `values (${placeholders}) returning *) ` +
            "select to_jsonb(neu) as row from neu",
          values,
        );
        inserted.push(...result.rows.map((entry) => entry.row));
      }
      return inserted;
    });
    if (!prefersRepresentation(req)) {
      res.writeHead(201, CORS_HEADERS);
      res.end();
      return;
    }
    sendJson(res, 201, wantsSingleObject(req) ? singleOrThrow(rows) : rows);
    return;
  }

  if (method === "PATCH") {
    const body = (await readBody(req)) as Record<string, unknown>;
    const columns = Object.keys(body);
    const assignments = columns
      .map((column, index) => `${ident(column)} = $${String(index + 1)}`)
      .join(", ");
    const where = buildWhere(params, parsed, columns.length + 1);
    const rows = await inRequestContext(pool, requester, async (client) => {
      const result = await client.query<{ row: Record<string, unknown> }>(
        `with geaendert as (update ${ident(table)} t set ${assignments}` +
          where.sql +
          " returning t.*) select to_jsonb(geaendert) as row from geaendert",
        [...columns.map((column) => body[column]), ...where.values],
      );
      return result.rows.map((entry) => entry.row);
    });
    if (!prefersRepresentation(req)) {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    sendJson(res, 200, wantsSingleObject(req) ? singleOrThrow(rows) : rows);
    return;
  }

  if (method === "DELETE") {
    const where = buildWhere(params, parsed);
    const rows = await inRequestContext(pool, requester, async (client) => {
      const result = await client.query<{ row: Record<string, unknown> }>(
        `with geloescht as (delete from ${ident(table)} t` +
          where.sql +
          " returning t.*) select to_jsonb(geloescht) as row from geloescht",
        where.values,
      );
      return result.rows.map((entry) => entry.row);
    });
    const contentRange = `*/${String(rows.length)}`;
    if (!prefersRepresentation(req)) {
      res.writeHead(204, { ...CORS_HEADERS, "content-range": contentRange });
      res.end();
      return;
    }
    sendJson(res, 200, rows, { "content-range": contentRange });
    return;
  }

  throw new BridgeError(501, "PGRSTX08", `Methode ${method} fehlt in der Bruecke.`);
}

interface PostgresError {
  code?: string;
  message?: string;
  detail?: string;
  hint?: string;
}

export interface Bridge {
  url: string;
  close: () => Promise<void>;
}

/** Startet die Bruecke; `port: 0` waehlt einen freien Port. */
export async function startBridge(options: {
  port: number;
  connectionString?: string;
}): Promise<Bridge> {
  const pool = new Pool({
    connectionString:
      options.connectionString ?? process.env.TEST_DATABASE_URL ?? DEFAULT_CONNECTION,
    max: 8,
  });

  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        if (req.method === "OPTIONS") {
          res.writeHead(204, CORS_HEADERS);
          res.end();
          return;
        }
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname.startsWith("/auth/v1")) {
          await handleAuth(pool, req, res, url);
          return;
        }
        if (url.pathname.startsWith("/rest/v1")) {
          await handleRest(pool, req, res, url);
          return;
        }
        throw new BridgeError(
          501,
          "PGRSTX09",
          `Pfad ${url.pathname} fehlt in der Bruecke.`,
        );
      } catch (error) {
        if (error instanceof BridgeError) {
          sendJson(res, error.status, {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: null,
          });
          return;
        }
        const pgError = error as PostgresError;
        // SQLSTATE unveraendert durchreichen: Die Anwendung wertet Codes wie
        // 23503 (Fremdschluessel) aus.
        sendJson(res, 400, {
          code: pgError.code ?? "XXUNK",
          message: pgError.message ?? String(error),
          details: pgError.detail ?? null,
          hint: pgError.hint ?? null,
        });
      }
    })();
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;

  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await pool.end();
    },
  };
}
