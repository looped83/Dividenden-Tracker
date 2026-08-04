import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asAnon,
  asSuperuser,
  asUser,
  closePool,
  createTestUser,
  firstRow,
} from "./support/db";

/**
 * Depotstaende aus dem Portfolio-Export (Migration 0029, docs/PORTFOLIO_IMPORT.md).
 *
 * Anders als beim Dividendenkalender schreibt hier der **Client**: Es gibt kein
 * Secret und keine Edge Function, die Datei wird im Browser gelesen. Geprueft
 * wird deshalb genau, wie weit diese Schreibrechte reichen — eigene Zeilen ja,
 * fremde nie, und kein UPDATE, weil ein Stichtag als Ganzes ersetzt wird.
 */
let userA: string;
let userB: string;
let securityA: string;
let securityB: string;

/**
 * Wie in den uebrigen Integrationstests als der Nutzer selbst angelegt: Der
 * Trigger `enforce_user_id` setzt `user_id` aus `auth.uid()`, das es in einer
 * Superuser-Sitzung nicht gibt.
 */
async function seedSecurity(userId: string, name: string): Promise<string> {
  return asUser(userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into securities (name) values ($1) returning id`,
      [name],
    );
    return firstRow(result).id;
  });
}

/** Legt einen Lauf an, wie es der Client tut. */
async function seedRun(userId: string, asOf: string): Promise<string> {
  return asUser(userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into security_snapshot_runs
         (as_of, file_name, rows_total, rows_imported, rows_skipped, rows_invalid)
       values ($1, 'divvydiaryportfolio.csv', 3, 1, 2, 0)
       returning id`,
      [asOf],
    );
    return firstRow(result).id;
  });
}

async function seedSnapshot(
  userId: string,
  securityId: string,
  runId: string,
  asOf: string,
  marketValue = "1200.00",
): Promise<string> {
  return asUser(userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into security_snapshots
         (security_id, run_id, as_of, quantity, market_value, annual_dividend_total, currency)
       values ($1, $2, $3, 10, $4, '60.00', 'EUR')
       returning id`,
      [securityId, runId, asOf, marketValue],
    );
    return firstRow(result).id;
  });
}

let runA: string;
let snapshotA: string;

beforeAll(async () => {
  userA = await createTestUser("snapshot-user-a@example.test");
  userB = await createTestUser("snapshot-user-b@example.test");
  securityA = await seedSecurity(userA, "Alpha AG");
  securityB = await seedSecurity(userB, "Beta AG");
  runA = await seedRun(userA, "2026-08-03");
  snapshotA = await seedSnapshot(userA, securityA, runA, "2026-08-03");
});

afterAll(async () => {
  await closePool();
});

describe("Depotstaende: nur eigene Zeilen sind sichtbar", () => {
  it("A sieht seinen eigenen Stand", async () => {
    const result = await asUser(userA, (client) =>
      client.query("select id from security_snapshots"),
    );
    expect(result.rows.map((row: { id: string }) => row.id)).toContain(snapshotA);
  });

  it("B sieht den Stand von A nicht — auch nicht ueber die id", async () => {
    const alle = await asUser(userB, (client) =>
      client.query("select id from security_snapshots"),
    );
    expect(alle.rowCount).toBe(0);

    const gezielt = await asUser(userB, (client) =>
      client.query("select * from security_snapshots where id = $1", [snapshotA]),
    );
    expect(gezielt.rowCount).toBe(0);
  });

  it("anonyme Anfragen erhalten keinen Zugriff", async () => {
    await expect(
      asAnon((client) => client.query("select id from security_snapshots")),
    ).rejects.toThrow(/permission denied|keine Berechtigung/i);
  });
});

describe("Depotstaende: Schreibrechte des Clients", () => {
  it("A darf einen eigenen Stand anlegen und wieder entfernen", async () => {
    const run = await seedRun(userA, "2026-07-01");
    const snapshot = await seedSnapshot(userA, securityA, run, "2026-07-01");
    expect(snapshot).toBeTruthy();

    await asUser(userA, (client) =>
      client.query("delete from security_snapshot_runs where as_of = '2026-07-01'"),
    );
    const rest = await asUser(userA, (client) =>
      client.query("select id from security_snapshots where as_of = '2026-07-01'"),
    );
    // Die Zeilen gehen ueber den Fremdschluessel mit — kein halber Stichtag.
    expect(rest.rowCount).toBe(0);
  });

  it("UPDATE ist gesperrt: ein Stichtag wird ersetzt, nicht umgeschrieben", async () => {
    await expect(
      asUser(userA, (client) =>
        client.query("update security_snapshots set market_value = '1.00'"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("A kann keinen Stand fuer B einschmuggeln", async () => {
    await expect(
      asUser(userA, (client) =>
        client.query(
          `insert into security_snapshot_runs (user_id, as_of, rows_total, rows_imported, rows_skipped, rows_invalid)
           values ($1, '2026-09-01', 0, 0, 0, 0)`,
          [userB],
        ),
      ),
    ).rejects.toThrow(/user_id muss auth.uid\(\) entsprechen/i);
  });

  it("A kann keinen Stand an das Unternehmen von B haengen", async () => {
    // Der Fremdschluessel allein pruefte nur die Existenz. Ohne die
    // Eigentumspruefung risse ein Loeschen bei B einen Stand bei A mit.
    await expect(seedSnapshot(userA, securityB, runA, "2026-08-03")).rejects.toThrow(
      /gehoert nicht zum eigenen Bestand/i,
    );
  });
});

describe("Eindeutigkeit und Bilanz", () => {
  it("dasselbe Unternehmen kann am selben Stichtag nur einmal stehen", async () => {
    await expect(seedSnapshot(userA, securityA, runA, "2026-08-03")).rejects.toThrow(
      /security_snapshots_day_unique|duplicate key/i,
    );
  });

  it("ein zweiter Lauf desselben Tages ist gesperrt", async () => {
    await expect(seedRun(userA, "2026-08-03")).rejects.toThrow(
      /security_snapshot_runs_day_unique|duplicate key/i,
    );
  });

  it("der Stichtag einer Zeile muss dem des Laufs entsprechen", async () => {
    // Der zusammengesetzte Fremdschluessel bindet beide aneinander: Ein
    // Snapshot mit fremdem Stichtag ist nicht speicherbar, nicht nur
    // unerwuenscht.
    await expect(seedSnapshot(userA, securityA, runA, "2026-07-15")).rejects.toThrow(
      /security_snapshots_run_fkey|foreign key/i,
    );
  });

  it("eine Bilanz, die nicht aufgeht, wird abgewiesen", async () => {
    await expect(
      asUser(userA, (client) =>
        client.query(
          `insert into security_snapshot_runs
             (as_of, rows_total, rows_imported, rows_skipped, rows_invalid)
           values ('2026-10-01', 10, 4, 4, 0)`,
        ),
      ),
    ).rejects.toThrow(/security_snapshot_runs_balance/i);
  });

  it("eine Position ohne Bestand ist nicht speicherbar", async () => {
    // Zeilen ohne Bestand werden gar nicht erst importiert; die Datenbank
    // haelt die Regel ein zweites Mal.
    await expect(
      asUser(userA, (client) =>
        client.query(
          `insert into security_snapshots
             (security_id, run_id, as_of, quantity, currency)
           values ($1, $2, '2026-08-03', 0, 'EUR')`,
          [securityA, runA],
        ),
      ),
    ).rejects.toThrow(/security_snapshots_quantity_check/i);
  });
});

describe("Abhaengigkeiten", () => {
  it("ein geloeschtes Unternehmen nimmt seine Staende mit", async () => {
    // Snapshots sind abgeleitete Daten. Ohne `cascade` wuerde ein Stand das
    // Loeschen eines archivierten Unternehmens blockieren.
    const security = await seedSecurity(userA, "Gamma AG");
    const run = await seedRun(userA, "2026-06-01");
    await seedSnapshot(userA, security, run, "2026-06-01");

    await asSuperuser((client) =>
      client.query("delete from securities where id = $1", [security]),
    );

    const rest = await asUser(userA, (client) =>
      client.query("select id from security_snapshots where security_id = $1", [
        security,
      ]),
    );
    expect(rest.rowCount).toBe(0);
  });
});
