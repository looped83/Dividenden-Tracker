import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  asUser,
  asAnon,
  asSuperuser,
  createTestUser,
  firstRow,
  closePool,
} from "./support/db";

import { normalizeRows, groupCompanies, groupBrokers } from "@/lib/import/pipeline";
import { buildCommitPayload } from "@/lib/import/buildCommitPayload";
import { hashFile } from "@/lib/import/fingerprint";
import type { ImportCellValue } from "@/lib/import/parseWorkbook";
import type { CompanyDecision, BrokerDecision } from "@/lib/import/types";

// Erfundene Daten (das Repository ist oeffentlich). Abgedeckt ist der Weg
// Client-Pipeline -> commit_import -> rollback_import gegen die echten
// Migrationen; das Lesen der Excel-Datei pruefen die Unit-Tests.
const ROWS: ImportCellValue[][] = [
  ["2024-03-15", "Beispiel AG", "12,50", "Bank Alpha"],
  ["2024-06-14", "Beispiel AG", "12,50", "Bank Alpha"],
  ["2024-09-30", "Muster Inc", "3,10", "Bank Beta"],
  // Zwei verschiedene Betraege am selben Tag sind zwei Zahlungen, kein Duplikat.
  ["2025-09-30", "Muster Inc", "4,20", "Bank Beta"],
  ["2025-09-30", "Muster Inc", "6,80", "Bank Beta"],
  ["2025-12-01", "Probe SE", "1.000,05", "Bank Alpha"],
];
const ROW_COUNT = ROWS.length;
const TOTAL = "1039.15";

async function buildPayload() {
  const fileHash = await hashFile(new TextEncoder().encode(JSON.stringify(ROWS)).buffer);
  const rows = await normalizeRows(
    ROWS,
    { date: 0, investment: 1, amount: 2, broker: 3 },
    {
      dateFormat: "iso",
      numberFormat: "auto",
      date1904: false,
      currency: "EUR",
      minDate: "1970-01-01",
      maxDate: "2026-12-31",
    },
  );
  const companyDecisions = new Map<string, CompanyDecision>(
    groupCompanies(rows, [], []).map((g) => [g.normalized, g.defaultDecision]),
  );
  const brokerDecisions = new Map<string, BrokerDecision>(
    groupBrokers(rows, []).map((g) => [g.normalized, g.defaultDecision]),
  );
  const payload = buildCommitPayload({
    rows,
    companyDecisions,
    brokerDecisions,
    sheetName: "Dividenden",
    columnMapping: { pay_date: 0, security: 1, net_amount: 2, broker: 3 },
  });
  return { fileHash, rows, payload };
}

type Built = Awaited<ReturnType<typeof buildPayload>>;

/** Legt einen Importlauf an; `tag` macht den Datei-Hash je Test eindeutig. */
async function insertImport(
  client: PoolClient,
  fileHash: string,
  tag: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into imports (file_name, file_hash, file_size_bytes, file_type, status)
     values ('beispiel.xlsx', $1, 1024, 'xlsx', 'pending_confirmation') returning id`,
    [`${tag}${fileHash.slice(tag.length)}`],
  );
  return firstRow(result).id;
}

async function commit(userId: string, built: Built, tag: string): Promise<string> {
  return asUser(userId, async (client) => {
    const id = await insertImport(client, built.fileHash, tag);
    const committed = await client.query<{ status: string }>(
      "select status from commit_import($1::uuid, $2::jsonb)",
      [id, JSON.stringify(built.payload)],
    );
    expect(firstRow(committed).status).toBe("committed");
    return id;
  });
}

async function activePayments(userId: string): Promise<{ c: number; s: string | null }> {
  return asSuperuser(async (client) => {
    const row = firstRow(
      await client.query<{ c: string; s: string | null }>(
        `select count(*) c, sum(net_amount)::text s from dividend_payments
         where user_id = $1 and archived_at is null`,
        [userId],
      ),
    );
    return { c: Number(row.c), s: row.s };
  });
}

let built: Built;

beforeAll(async () => {
  built = await buildPayload();
});

afterAll(async () => {
  await closePool();
});

describe("Client-Pipeline (erfundene Daten)", () => {
  it("normalisiert alle Zeilen fehlerfrei und erkennt Unternehmen und Broker", () => {
    expect(built.rows.filter((r) => r.status === "invalid")).toHaveLength(0);
    expect(built.rows).toHaveLength(ROW_COUNT);
    expect(built.payload.new_securities).toHaveLength(3);
    expect(built.payload.new_depots).toHaveLength(2);
    expect(built.payload.expected.row_count).toBe(ROW_COUNT);
  });
});

describe("commit_import", () => {
  it("speichert alle Zeilen atomar und legt Unternehmen archiviert an", async () => {
    const userId = await createTestUser(`import-a-${String(Date.now())}@example.com`);
    const importId = await commit(userId, built, "ca");

    expect(await activePayments(userId)).toEqual({ c: ROW_COUNT, s: TOTAL });

    await asSuperuser(async (client) => {
      const secs = firstRow(
        await client.query<{ total: string; archived: string }>(
          `select count(*) total, count(*) filter (where archived_at is not null) archived
           from securities where created_by_import_id = $1`,
          [importId],
        ),
      );
      expect(Number(secs.total)).toBe(3);
      expect(Number(secs.archived)).toBe(3);

      const depots = await client.query<{ c: string }>(
        "select count(*) c from depots where created_by_import_id = $1",
        [importId],
      );
      expect(Number(firstRow(depots).c)).toBe(2);

      const sameDay = await client.query<{ net_amount: string }>(
        `select dp.net_amount from dividend_payments dp
         join securities s on s.id = dp.security_id
         where dp.import_id = $1 and s.name = 'Muster Inc' and dp.pay_date = '2025-09-30'
         order by dp.net_amount`,
        [importId],
      );
      expect(sameDay.rows.map((r) => r.net_amount)).toEqual(["4.20", "6.80"]);
    });
  });

  it("lehnt einen manipulierten Erwartungswert komplett ab und speichert nichts", async () => {
    const userId = await createTestUser(`import-bad-${String(Date.now())}@example.com`);
    const tampered = {
      ...built.payload,
      expected: { ...built.payload.expected, row_count: ROW_COUNT - 1 },
    };
    await expect(
      asUser(userId, async (client) => {
        const id = await insertImport(client, built.fileHash, "bd");
        await client.query("select commit_import($1::uuid, $2::jsonb)", [
          id,
          JSON.stringify(tampered),
        ]);
      }),
    ).rejects.toThrow(/Kontrollsumme Zeilenanzahl/);

    expect((await activePayments(userId)).c).toBe(0);
  });

  it("findet eine bereits importierte Datei am Datei-Hash", async () => {
    const userId = await createTestUser(`import-dup-${String(Date.now())}@example.com`);
    const importId = await commit(userId, built, "dp");
    const prior = await asUser(userId, async (client) =>
      client.query<{ id: string }>(
        "select id from imports where file_hash = $1 and status = 'committed'",
        [`dp${built.fileHash.slice(2)}`],
      ),
    );
    expect(prior.rows.map((r) => r.id)).toEqual([importId]);
  });
});

describe("rollback_import und Sicherheit", () => {
  it("rollt einen Import vollstaendig zurueck, der Importlauf bleibt als Historie", async () => {
    const userId = await createTestUser(`import-rb-${String(Date.now())}@example.com`);
    const importId = await commit(userId, built, "rb");
    expect((await activePayments(userId)).c).toBe(ROW_COUNT);

    const status = await asUser(
      userId,
      async (client) =>
        firstRow(
          await client.query<{ status: string }>(
            "select status from rollback_import($1::uuid)",
            [importId],
          ),
        ).status,
    );
    expect(status).toBe("rolled_back");
    expect(await activePayments(userId)).toEqual({ c: 0, s: null });

    await asSuperuser(async (client) => {
      const imp = await client.query<{ status: string }>(
        "select status from imports where id = $1",
        [importId],
      );
      expect(firstRow(imp).status).toBe("rolled_back");
      const active = await client.query<{ c: string }>(
        `select count(*) c from securities
         where created_by_import_id = $1 and archived_at is null`,
        [importId],
      );
      expect(Number(firstRow(active).c)).toBe(0);
    });
  });

  it("Nutzer B sieht den Import von Nutzer A nicht und kann ihn nicht zurueckrollen", async () => {
    const userA = await createTestUser(`rls-a-${String(Date.now())}@example.com`);
    const userB = await createTestUser(`rls-b-${String(Date.now())}@example.com`);
    const importId = await commit(userA, built, "ax");

    const seen = await asUser(userB, async (client) =>
      client.query("select id from imports where id = $1", [importId]),
    );
    expect(seen.rows).toHaveLength(0);
    const pays = await asUser(userB, async (client) =>
      client.query("select id from dividend_payments where import_id = $1", [importId]),
    );
    expect(pays.rows).toHaveLength(0);

    await expect(
      asUser(userB, async (client) => {
        await client.query("select rollback_import($1::uuid)", [importId]);
      }),
    ).rejects.toThrow(/nicht gefunden|keine Berechtigung/);
    expect((await activePayments(userA)).c).toBe(ROW_COUNT);
  });

  it("verbietet dem Client, einen Import selbst als committed zu markieren", async () => {
    const userId = await createTestUser(`guard-${String(Date.now())}@example.com`);
    await expect(
      asUser(userId, async (client) => {
        const id = await insertImport(client, built.fileHash, "gd");
        await client.query("update imports set status = 'committed' where id = $1", [id]);
      }),
    ).rejects.toThrow(/commit_import|Statuswechsel/);
  });

  it("verweigert einem nicht angemeldeten Nutzer den Import", async () => {
    await expect(
      asAnon(async (client) => {
        await client.query(
          `insert into imports (file_name, file_hash, file_size_bytes, file_type)
           values ('x.xlsx', $1, 1, 'xlsx')`,
          ["z".repeat(64)],
        );
      }),
    ).rejects.toThrow();
  });
});
