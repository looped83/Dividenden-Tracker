import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
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

import { analyzeWorkbook, readSheet } from "@/lib/import/parseWorkbook";
import { suggestColumnMapping, missingRequiredFields } from "@/lib/import/columnMapping";
import { normalizeRows, groupCompanies, groupBrokers } from "@/lib/import/pipeline";
import { computeChecksums } from "@/lib/import/checksums";
import { buildCommitPayload } from "@/lib/import/buildCommitPayload";
import { hashFile } from "@/lib/import/fingerprint";
import { normalizeCompareName } from "@/lib/import/normalizeName";
import type { CompanyDecision, BrokerDecision, NormalizedRow } from "@/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../fixtures/Details-Dividenden-2012-2026.xlsx");

// Die reale Datei enthaelt persoenliche Finanzdaten und wird NICHT eingecheckt
// (.gitignore). Ist sie lokal vorhanden, laeuft der vollstaendige E2E-Datenpfad;
// sonst wird diese Suite uebersprungen (die uebrigen Integrationstests decken
// commit/rollback/RLS bereits mit synthetischen Daten ab). Datei zum Ausfuehren
// unter tests/fixtures/ ablegen.
const HAS_FIXTURE = existsSync(FIXTURE);
const describeReal = HAS_FIXTURE ? describe : describe.skip;

/** Erwartete Jahreskontrollwerte aus der Aufgabenstellung (Task §13). */
const EXPECTED_BY_YEAR: Record<string, { count: number; sum: string }> = {
  "2012": { count: 2, sum: "13.80" },
  "2013": { count: 6, sum: "31.20" },
  "2014": { count: 8, sum: "51.68" },
  "2015": { count: 18, sum: "146.60" },
  "2016": { count: 18, sum: "174.87" },
  "2017": { count: 19, sum: "502.58" },
  "2018": { count: 19, sum: "734.35" },
  "2019": { count: 38, sum: "1689.27" },
  "2020": { count: 109, sum: "3250.69" },
  "2021": { count: 144, sum: "4365.11" },
  "2022": { count: 156, sum: "6034.75" },
  "2023": { count: 203, sum: "6991.30" },
  "2024": { count: 242, sum: "7961.38" },
  "2025": { count: 298, sum: "9623.98" },
  "2026": { count: 159, sum: "7820.01" },
};

function fileBuffer(): ArrayBuffer {
  const buf = readFileSync(FIXTURE);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

interface Pipeline {
  fileHash: string;
  rows: NormalizedRow[];
  companyDecisions: Map<string, CompanyDecision>;
  brokerDecisions: Map<string, BrokerDecision>;
  payload: ReturnType<typeof buildCommitPayload>;
}

/** Faehrt die komplette Client-Pipeline auf der realen Datei durch (frische Datenbasis). */
async function runPipeline(): Promise<Pipeline> {
  const buffer = fileBuffer();
  const fileHash = await hashFile(buffer);

  const analysis = await analyzeWorkbook(buffer);
  expect(analysis.sheets.map((s) => s.name)).toEqual(["Dividenden"]);
  const [firstSheet] = analysis.sheets;
  if (!firstSheet) throw new Error("Kein Tabellenblatt gefunden.");
  expect(firstSheet.hidden).toBe(false);
  expect(firstSheet.hasMergedCells).toBe(false);

  const sheet = await readSheet(buffer, "Dividenden");
  const header = (sheet.rows[0] ?? []).map((c) => String(c ?? "").trim());
  expect(header).toEqual(["Datum", "Investment", "Betrag", "Broker"]);

  const mapping = suggestColumnMapping(header);
  expect(missingRequiredFields(mapping)).toEqual([]);
  const { pay_date, security, net_amount, broker } = mapping;
  if (
    pay_date === undefined ||
    security === undefined ||
    net_amount === undefined ||
    broker === undefined
  ) {
    throw new Error("Pflichtspalten wurden nicht erkannt.");
  }

  const rows = await normalizeRows(
    sheet.rows.slice(1),
    { date: pay_date, investment: security, amount: net_amount, broker },
    {
      dateFormat: "iso",
      numberFormat: "auto",
      date1904: analysis.date1904,
      currency: "EUR",
      minDate: "1970-01-01",
      maxDate: "2026-07-19",
    },
  );

  // Frische Datenbasis: keine bestehenden Stammdaten -> alle neu (archiviert).
  const companyGroups = groupCompanies(rows, [], []);
  const brokerGroups = groupBrokers(rows, []);

  const companyDecisions = new Map<string, CompanyDecision>(
    companyGroups.map((g) => [g.normalized, g.defaultDecision]),
  );
  const brokerDecisions = new Map<string, BrokerDecision>(
    brokerGroups.map((g) => [g.normalized, g.defaultDecision]),
  );

  const payload = buildCommitPayload({
    rows,
    companyDecisions,
    brokerDecisions,
    sheetName: "Dividenden",
    columnMapping: mapping,
  });

  return { fileHash, rows, companyDecisions, brokerDecisions, payload };
}

async function insertImport(client: PoolClient, fileHash: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into imports (file_name, file_hash, file_size_bytes, file_type, status)
     values ($1, $2, $3, 'xlsx', 'pending_confirmation') returning id`,
    ["Details-Dividenden-2012-2026.xlsx", fileHash, 48412],
  );
  return firstRow(result).id;
}

describeReal("Realer Excel-Import — Client-Pipeline (Task §13, DoD)", () => {
  let pipe: Pipeline;

  beforeAll(async () => {
    pipe = await runPipeline();
  });

  it("erkennt 1.439 gueltige Zeilen ohne Fehler", () => {
    const invalid = pipe.rows.filter((r) => r.status === "invalid");
    expect(invalid).toHaveLength(0);
    expect(pipe.rows).toHaveLength(1439);
  });

  it("berechnet die Gesamtsumme exakt auf 49.391,57 €", () => {
    const checksums = computeChecksums(
      pipe.rows.flatMap((r) =>
        r.payDate !== null && r.netAmount !== null
          ? [{ payDate: r.payDate, netAmount: r.netAmount, broker: r.brokerName }]
          : [],
      ),
    );
    expect(checksums.rowCount).toBe(1439);
    expect(checksums.totalNet).toBe("49391.57");
    expect(checksums.minDate).toBe("2012-11-15");
    expect(checksums.maxDate).toBe("2026-07-17");
  });

  it("stimmt in jedem Jahr exakt mit den Kontrollwerten ueberein", () => {
    const checksums = computeChecksums(
      pipe.rows.flatMap((r) =>
        r.payDate !== null && r.netAmount !== null
          ? [{ payDate: r.payDate, netAmount: r.netAmount, broker: r.brokerName }]
          : [],
      ),
    );
    for (const [year, expected] of Object.entries(EXPECTED_BY_YEAR)) {
      expect(checksums.byYear[year]).toEqual(expected);
    }
  });

  it("gruppiert 94 Investmentnamen und 3 Broker", () => {
    expect(pipe.payload.new_securities).toHaveLength(94);
    expect(pipe.payload.new_depots).toHaveLength(3);
    const brokerCounts = pipe.payload.expected.by_broker;
    expect(brokerCounts.Consorsbank?.count).toBe(312);
    expect(brokerCounts["Trade Republic"]?.count).toBe(1012);
    expect(brokerCounts["Scalable Capital"]?.count).toBe(115);
  });

  it("erhaelt die legitime Gladstone-Mehrfachzahlung (4,76 und 7,84)", () => {
    const gladstone = pipe.rows.filter(
      (r) =>
        normalizeCompareName(r.investmentName) === "gladstone capital" &&
        r.payDate === "2025-09-30",
    );
    expect(gladstone.map((r) => r.netAmount).sort()).toEqual(["4.76", "7.84"]);
    // Unterschiedliche Fingerprints -> werden nie als Duplikat zusammengefasst.
    expect(new Set(gladstone.map((r) => r.rowFingerprint)).size).toBe(2);
  });
});

describeReal("Atomarer Import via commit_import (Task §15, §23)", () => {
  let pipe: Pipeline;
  let userId: string;

  beforeAll(async () => {
    pipe = await runPipeline();
    userId = await createTestUser(`import-a-${String(Date.now())}@example.com`);
  });

  it("committet alle 1.439 Zeilen und verifiziert serverseitig die Kontrollsummen", async () => {
    const importId = await asUser(userId, async (client) => {
      const id = await insertImport(client, pipe.fileHash);
      const committed = await client.query<{ status: string }>(
        "select status from commit_import($1::uuid, $2::jsonb)",
        [id, JSON.stringify(pipe.payload)],
      );
      expect(firstRow(committed).status).toBe("committed");
      return id;
    });

    await asSuperuser(async (client) => {
      const count = await client.query<{ c: string; s: string; mn: string; mx: string }>(
        `select count(*) c, sum(net_amount) s,
                min(pay_date)::text mn, max(pay_date)::text mx
         from dividend_payments where import_id = $1`,
        [importId],
      );
      const row = firstRow(count);
      expect(Number(row.c)).toBe(1439);
      expect(row.s).toBe("49391.57");
      expect(row.mn).toBe("2012-11-15");
      expect(row.mx).toBe("2026-07-17");

      // Neue Unternehmen: 94, alle archiviert + Herkunft gesetzt.
      const secs = await client.query<{
        total: string;
        archived: string;
        withimport: string;
      }>(
        `select count(*) total,
                count(*) filter (where archived_at is not null) archived,
                count(*) filter (where created_by_import_id = $1) withimport
         from securities where created_by_import_id = $1`,
        [importId],
      );
      expect(Number(firstRow(secs).total)).toBe(94);
      expect(Number(firstRow(secs).archived)).toBe(94);
      expect(Number(firstRow(secs).withimport)).toBe(94);

      const depots = await client.query<{ c: string }>(
        "select count(*) c from depots where created_by_import_id = $1",
        [importId],
      );
      expect(Number(firstRow(depots).c)).toBe(3);

      // Provenance je Zeile.
      const provenance = await client.query<{ c: string }>(
        "select count(*) c from import_rows where import_id = $1 and classification = 'imported'",
        [importId],
      );
      expect(Number(firstRow(provenance).c)).toBe(1439);

      // Gladstone-Mehrfachzahlung bleibt zweimal erhalten.
      const gladstone = await client.query<{ net_amount: string }>(
        `select dp.net_amount from dividend_payments dp
         join securities s on s.id = dp.security_id
         where dp.import_id = $1 and s.name = 'Gladstone Capital' and dp.pay_date = '2025-09-30'
         order by dp.net_amount`,
        [importId],
      );
      expect(gladstone.rows.map((r) => r.net_amount)).toEqual(["4.76", "7.84"]);
    });
  });

  it("lehnt einen manipulierten Zeilenzahl-Erwartungswert komplett ab (Rollback der Transaktion)", async () => {
    const badUser = await createTestUser(`import-bad-${String(Date.now())}@example.com`);
    const tampered = {
      ...pipe.payload,
      expected: { ...pipe.payload.expected, row_count: 1438 },
    };
    await expect(
      asUser(badUser, async (client) => {
        const id = await insertImport(client, `${pipe.fileHash.slice(0, 60)}bad0`);
        await client.query("select commit_import($1::uuid, $2::jsonb)", [
          id,
          JSON.stringify(tampered),
        ]);
      }),
    ).rejects.toThrow(/Kontrollsumme Zeilenanzahl/);

    // Nichts wurde gespeichert (atomar).
    await asSuperuser(async (client) => {
      const c = await client.query<{ c: string }>(
        "select count(*) c from dividend_payments where user_id = $1",
        [badUser],
      );
      expect(Number(firstRow(c).c)).toBe(0);
    });
  });
});

describeReal("Wiederholungsimport, Rollback und Sicherheit (Task §3, §17, §18)", () => {
  let pipe: Pipeline;

  beforeAll(async () => {
    pipe = await runPipeline();
  });

  it("erkennt eine bereits importierte Datei am Datei-Hash", async () => {
    const userId = await createTestUser(`import-dup-${String(Date.now())}@example.com`);
    const importId = await asUser(userId, async (client) => {
      const id = await insertImport(client, pipe.fileHash);
      await client.query("select commit_import($1::uuid, $2::jsonb)", [
        id,
        JSON.stringify(pipe.payload),
      ]);
      return id;
    });

    const prior = await asUser(userId, async (client) =>
      client.query<{ id: string; committed_at: string }>(
        "select id, committed_at from imports where file_hash = $1 and status = 'committed'",
        [pipe.fileHash],
      ),
    );
    expect(prior.rows).toHaveLength(1);
    expect(prior.rows[0]?.id).toBe(importId);
  });

  it("rollt einen abgeschlossenen Import vollstaendig zurueck", async () => {
    const userId = await createTestUser(`import-rb-${String(Date.now())}@example.com`);
    const importId = await asUser(userId, async (client) => {
      const id = await insertImport(client, `rb${pipe.fileHash.slice(2)}`);
      await client.query("select commit_import($1::uuid, $2::jsonb)", [
        id,
        JSON.stringify(pipe.payload),
      ]);
      return id;
    });

    // Aktive Summe vor Rollback.
    const before = await asUser(userId, async (client) =>
      firstRow(
        await client.query<{ c: string }>(
          "select count(*) c from dividend_payments where user_id = $1 and archived_at is null",
          [userId],
        ),
      ),
    );
    expect(Number(before.c)).toBe(1439);

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

    await asSuperuser(async (client) => {
      const active = await client.query<{ c: string; s: string | null }>(
        "select count(*) c, sum(net_amount) s from dividend_payments where user_id = $1 and archived_at is null",
        [userId],
      );
      expect(Number(firstRow(active).c)).toBe(0);
      expect(firstRow(active).s).toBeNull();

      // Der Importdatensatz bleibt als Historie erhalten.
      const imp = await client.query<{ status: string }>(
        "select status from imports where id = $1",
        [importId],
      );
      expect(firstRow(imp).status).toBe("rolled_back");

      // Durch den Import angelegte Wertpapiere bleiben archiviert (kein Hard Delete).
      const secs = await client.query<{ total: string; active: string }>(
        `select count(*) total, count(*) filter (where archived_at is null) active
         from securities where created_by_import_id = $1`,
        [importId],
      );
      expect(Number(firstRow(secs).total)).toBe(94);
      expect(Number(firstRow(secs).active)).toBe(0);
    });
  });

  it("verhindert, dass Nutzer B den Import von Nutzer A sieht oder zurueckrollt (RLS)", async () => {
    const userA = await createTestUser(`rls-a-${String(Date.now())}@example.com`);
    const userB = await createTestUser(`rls-b-${String(Date.now())}@example.com`);
    const importId = await asUser(userA, async (client) => {
      const id = await insertImport(client, `ax${pipe.fileHash.slice(2)}`);
      await client.query("select commit_import($1::uuid, $2::jsonb)", [
        id,
        JSON.stringify(pipe.payload),
      ]);
      return id;
    });

    // B sieht den Import nicht.
    const seen = await asUser(userB, async (client) =>
      client.query("select id from imports where id = $1", [importId]),
    );
    expect(seen.rows).toHaveLength(0);

    // B sieht keine Zahlungen von A.
    const pays = await asUser(userB, async (client) =>
      client.query("select id from dividend_payments where import_id = $1", [importId]),
    );
    expect(pays.rows).toHaveLength(0);

    // B kann den Import von A nicht zurueckrollen.
    await expect(
      asUser(userB, async (client) => {
        await client.query("select rollback_import($1::uuid)", [importId]);
      }),
    ).rejects.toThrow(/nicht gefunden|keine Berechtigung/);

    // A's Daten sind unveraendert aktiv.
    await asSuperuser(async (client) => {
      const c = await client.query<{ c: string }>(
        "select count(*) c from dividend_payments where user_id = $1 and archived_at is null",
        [userA],
      );
      expect(Number(firstRow(c).c)).toBe(1439);
    });
  });

  it("verbietet dem Client, einen Import selbst als committed zu markieren", async () => {
    const userId = await createTestUser(`guard-${String(Date.now())}@example.com`);
    await expect(
      asUser(userId, async (client) => {
        const id = await insertImport(client, `gd${pipe.fileHash.slice(2)}`);
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

afterAll(async () => {
  await closePool();
});
