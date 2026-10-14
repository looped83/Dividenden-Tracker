import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, closePool, createTestUser, firstRow } from "./support/db";
import { seedDepot, seedPayment, seedSecurity } from "./support/seed";
import type { PoolClient } from "pg";

let userA: string;
let userB: string;

beforeAll(async () => {
  userA = await createTestUser("phase6-a@example.test");
  userB = await createTestUser("phase6-b@example.test");
});

afterAll(async () => {
  await closePool();
});

async function seedImport(client: PoolClient, fileName: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into imports (file_name, file_hash, file_size_bytes, file_type, status, committed_at)
     values ($1, $2, 100, 'csv', 'committed', now()) returning id`,
    [fileName, `hash-${fileName}`],
  );
  return firstRow(result).id;
}

async function seedImportRow(
  client: PoolClient,
  importId: string,
  rowNumber: number,
  paymentId: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into import_rows
       (import_id, source_row_number, payment_id, classification, raw, normalized)
     values ($1, $2, $3, 'imported', '{}'::jsonb, '{}'::jsonb) returning id`,
    [importId, rowNumber, paymentId],
  );
  return firstRow(result).id;
}

describe("Einzellöschung importierter Eingänge (§13.4)", () => {
  it("löscht nur die eine Zahlung; Importlauf und übrige Zeilen bleiben erhalten", async () => {
    const depotId = await asUser(userA, (c) => seedDepot(c, "Depot Import Delete"));
    const securityId = await asUser(userA, (c) =>
      seedSecurity(c, { name: "Import Delete AG" }),
    );
    const importId = await asUser(userA, (c) => seedImport(c, "einzel.csv"));

    const p1 = await asUser(userA, (c) =>
      seedPayment(c, {
        securityId,
        depotId,
        source: "csv_import",
        importId,
        sourceRowNumber: 1,
        rowFingerprint: "fp-1",
        payDate: "2025-03-10",
      }),
    );
    const p2 = await asUser(userA, (c) =>
      seedPayment(c, {
        securityId,
        depotId,
        source: "csv_import",
        importId,
        sourceRowNumber: 2,
        rowFingerprint: "fp-2",
        payDate: "2025-06-10",
      }),
    );
    await asUser(userA, (c) => seedImportRow(c, importId, 1, p1.id));
    await asUser(userA, (c) => seedImportRow(c, importId, 2, p2.id));

    // Einzellöschung von p1.
    const deleted = await asUser(userA, (c) =>
      c.query("delete from dividend_payments where id = $1", [p1.id]),
    );
    expect(deleted.rowCount).toBe(1);

    // Importlauf bleibt nachvollziehbar.
    const importRun = await asUser(userA, (c) =>
      c.query("select id from imports where id = $1", [importId]),
    );
    expect(importRun.rowCount).toBe(1);

    // Andere Zahlung desselben Imports unverändert.
    const p2Still = await asUser(userA, (c) =>
      c.query("select id from dividend_payments where id = $1", [p2.id]),
    );
    expect(p2Still.rowCount).toBe(1);

    // Herkunftszeile von p1 bleibt als Provenance erhalten, verliert aber den
    // Verweis (ON DELETE SET NULL, 0019).
    const orphanRow = await asUser(userA, (c) =>
      c.query<{ payment_id: string | null }>(
        "select payment_id from import_rows where import_id = $1 and source_row_number = 1",
        [importId],
      ),
    );
    expect(orphanRow.rowCount).toBe(1);
    expect(firstRow(orphanRow).payment_id).toBeNull();

    // Herkunftszeile von p2 unverändert (Verweis bleibt).
    const keptRow = await asUser(userA, (c) =>
      c.query<{ payment_id: string | null }>(
        "select payment_id from import_rows where import_id = $1 and source_row_number = 2",
        [importId],
      ),
    );
    expect(firstRow(keptRow).payment_id).toBe(p2.id);
  });
});

describe("duplicate_dismissals RLS (§16, D-6-4)", () => {
  it("A kann eine eigene Entscheidung anlegen und lesen; B sieht sie nicht", async () => {
    await asUser(userA, (c) =>
      c.query("insert into duplicate_dismissals (pair_key) values ($1)", ["a-id:b-id"]),
    );

    const own = await asUser(userA, (c) =>
      c.query("select pair_key from duplicate_dismissals where pair_key = $1", [
        "a-id:b-id",
      ]),
    );
    expect(own.rowCount).toBe(1);

    const foreign = await asUser(userB, (c) =>
      c.query("select pair_key from duplicate_dismissals where pair_key = $1", [
        "a-id:b-id",
      ]),
    );
    expect(foreign.rowCount).toBe(0);
  });

  it("verhindert das Unterschieben einer fremden user_id", async () => {
    await expect(
      asUser(userB, (c) =>
        c.query("insert into duplicate_dismissals (user_id, pair_key) values ($1, $2)", [
          userA,
          "foreign-attempt",
        ]),
      ),
    ).rejects.toThrow(/user_id muss auth.uid/);
  });
});

describe("anomaly_reviews RLS (Datenqualität, D-6-4)", () => {
  async function seedOwnPayment(user: string, name: string) {
    return asUser(user, async (c) => {
      const depotId = await seedDepot(c, `Depot ${name}`);
      const securityId = await seedSecurity(c, { name });
      return seedPayment(c, { securityId, depotId, payDate: "2025-05-05" });
    });
  }

  it("A markiert eine eigene Auffälligkeit; B sieht die Markierung nicht", async () => {
    const payment = await seedOwnPayment(userA, "Geprüft AG");
    await asUser(userA, (c) =>
      c.query("insert into anomaly_reviews (payment_id, code) values ($1, $2)", [
        payment.id,
        "unusually_high",
      ]),
    );

    const own = await asUser(userA, (c) =>
      c.query("select code from anomaly_reviews where payment_id = $1", [payment.id]),
    );
    expect(own.rowCount).toBe(1);

    const foreign = await asUser(userB, (c) =>
      c.query("select code from anomaly_reviews where payment_id = $1", [payment.id]),
    );
    expect(foreign.rowCount).toBe(0);
  });

  it("verweigert die Markierung eines fremden Eingangs", async () => {
    const payment = await seedOwnPayment(userA, "Fremd geprüft AG");
    await expect(
      asUser(userB, (c) =>
        c.query("insert into anomaly_reviews (payment_id, code) values ($1, $2)", [
          payment.id,
          "zero_amount",
        ]),
      ),
    ).rejects.toThrow(/gehoert nicht zum eigenen Bestand/);
  });

  it("verschwindet mit dem gelöschten Eingang", async () => {
    const payment = await seedOwnPayment(userA, "Gelöscht AG");
    await asUser(userA, async (c) => {
      await c.query("insert into anomaly_reviews (payment_id, code) values ($1, $2)", [
        payment.id,
        "zero_amount",
      ]);
      await c.query("delete from dividend_payments where id = $1", [payment.id]);
    });

    const rest = await asUser(userA, (c) =>
      c.query("select 1 from anomaly_reviews where payment_id = $1", [payment.id]),
    );
    expect(rest.rowCount).toBe(0);
  });
});
