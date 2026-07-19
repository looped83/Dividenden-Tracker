import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asSuperuser, asUser, closePool, createTestUser, firstRow } from "./support/db";
import { seedDepot, seedPayment, seedSecurity } from "./support/seed";

interface AuditLogRow {
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  origin: string;
}

let userId: string;

beforeAll(async () => {
  userId = await createTestUser("triggers-user@example.test");
});

afterAll(async () => {
  await closePool();
});

describe("set_updated_at", () => {
  it("aktualisiert updated_at bei UPDATE, nicht aber bei INSERT unveraendert", async () => {
    const depotId = await asUser(userId, (client) =>
      seedDepot(client, "Depot Updated At"),
    );

    const before = await asUser(userId, (client) =>
      client.query<{ updated_at: string }>(
        "select updated_at from depots where id = $1",
        [depotId],
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    await asUser(userId, (client) =>
      client.query("update depots set note = $1 where id = $2", ["Notiz", depotId]),
    );

    const after = await asUser(userId, (client) =>
      client.query<{ updated_at: string }>(
        "select updated_at from depots where id = $1",
        [depotId],
      ),
    );

    expect(new Date(firstRow(after).updated_at).getTime()).toBeGreaterThan(
      new Date(firstRow(before).updated_at).getTime(),
    );
  });
});

describe("enforce_user_id", () => {
  it("setzt user_id automatisch auf auth.uid(), wenn nicht angegeben", async () => {
    const depotId = await asUser(userId, (client) =>
      seedDepot(client, "Depot Enforce 1"),
    );
    const row = await asSuperuser((client) =>
      client.query<{ user_id: string }>("select user_id from depots where id = $1", [
        depotId,
      ]),
    );
    expect(firstRow(row).user_id).toBe(userId);
  });

  it("lehnt eine abweichende explizite user_id beim INSERT ab", async () => {
    const otherUserId = await createTestUser("other-enforce@example.test");
    await expect(
      asUser(userId, (client) =>
        client.query("insert into depots (user_id, name) values ($1, 'Fremd')", [
          otherUserId,
        ]),
      ),
    ).rejects.toThrow(/user_id muss auth.uid/);
  });

  it("verbietet die nachtraegliche Aenderung von user_id", async () => {
    const depotId = await asUser(userId, (client) =>
      seedDepot(client, "Depot Enforce 2"),
    );
    const otherUserId = await createTestUser("other-enforce-2@example.test");
    await expect(
      asUser(userId, (client) =>
        client.query("update depots set user_id = $1 where id = $2", [
          otherUserId,
          depotId,
        ]),
      ),
    ).rejects.toThrow(/user_id ist unveraenderlich/);
  });
});

describe("recompute_business_fingerprint (CALCULATION_RULES.md §5)", () => {
  it("berechnet exakt den dokumentierten SHA-256-Fingerprint", async () => {
    const depotId = await asUser(userId, (client) =>
      seedDepot(client, "Depot Fingerprint 1"),
    );
    const securityId = await asUser(userId, (client) =>
      seedSecurity(client, { name: "Fingerprint AG", isin: "DE0007100000" }),
    );

    const payment = await asUser(userId, (client) =>
      seedPayment(client, {
        securityId,
        depotId,
        payDate: "2025-03-10",
        grossAmount: "50.00",
        netAmount: "42.50",
        originalCurrency: "EUR",
      }),
    );

    const US = "\x1f";
    const expectedPayload = [
      userId,
      "2025-03-10",
      "DE0007100000",
      "42.50",
      "EUR",
      depotId,
    ].join(US);
    const expectedFingerprint = createHash("sha256")
      .update(expectedPayload, "utf8")
      .digest("hex");

    expect(payment.business_fingerprint).toBe(expectedFingerprint);
  });

  it("nutzt Ticker, wenn keine ISIN vorhanden ist, sonst den normalisierten Namen", async () => {
    const depotId = await asUser(userId, (client) =>
      seedDepot(client, "Depot Fingerprint 2"),
    );
    const securityWithTicker = await asUser(userId, (client) =>
      seedSecurity(client, { name: "Ticker AG", ticker: "TICK" }),
    );
    const securityNameOnly = await asUser(userId, (client) =>
      seedSecurity(client, { name: "  Nur   Name AG  " }),
    );

    const paymentWithTicker = await asUser(userId, (client) =>
      seedPayment(client, {
        securityId: securityWithTicker,
        depotId,
        payDate: "2025-04-01",
      }),
    );
    const paymentWithName = await asUser(userId, (client) =>
      seedPayment(client, {
        securityId: securityNameOnly,
        depotId,
        payDate: "2025-04-01",
      }),
    );

    const US = "\x1f";
    const expectedTicker = createHash("sha256")
      .update([userId, "2025-04-01", "TICK", "85.00", "EUR", depotId].join(US), "utf8")
      .digest("hex");
    const expectedName = createHash("sha256")
      .update(
        [userId, "2025-04-01", "nur name ag", "85.00", "EUR", depotId].join(US),
        "utf8",
      )
      .digest("hex");

    expect(paymentWithTicker.business_fingerprint).toBe(expectedTicker);
    expect(paymentWithName.business_fingerprint).toBe(expectedName);
  });
});

describe("protect_payment_immutables", () => {
  it("verbietet die Aenderung von source", async () => {
    const depotId = await asUser(userId, (client) =>
      seedDepot(client, "Depot Immutable 1"),
    );
    const securityId = await asUser(userId, (client) =>
      seedSecurity(client, { name: "Immutable AG 1" }),
    );
    const payment = await asUser(userId, (client) =>
      seedPayment(client, { securityId, depotId }),
    );

    // 'restore' bleibt in derselben import_fields_consistency-Gruppe wie
    // 'manual' (beide != csv_import/excel_import), sodass ausschliesslich
    // die Unveraenderlichkeitspruefung greift, nicht die CHECK-Constraint.
    await expect(
      asUser(userId, (client) =>
        client.query("update dividend_payments set source = 'restore' where id = $1", [
          payment.id,
        ]),
      ),
    ).rejects.toThrow(/unveraenderlich/);
  });

  it("verbietet jede Bearbeitung einer archivierten Zeile ausser Reaktivierung", async () => {
    const depotId = await asUser(userId, (client) =>
      seedDepot(client, "Depot Immutable 2"),
    );
    const securityId = await asUser(userId, (client) =>
      seedSecurity(client, { name: "Immutable AG 2" }),
    );
    const payment = await asUser(userId, (client) =>
      seedPayment(client, { securityId, depotId }),
    );

    await asUser(userId, (client) =>
      client.query("update dividend_payments set archived_at = now() where id = $1", [
        payment.id,
      ]),
    );

    await expect(
      asUser(userId, (client) =>
        client.query("update dividend_payments set note = 'geaendert' where id = $1", [
          payment.id,
        ]),
      ),
    ).rejects.toThrow(/Archivierte Eingaenge/);

    // Reaktivierung (archived_at -> null) kombiniert mit einer weiteren
    // Feldaenderung muss abgelehnt werden (nur reine Reaktivierung erlaubt).
    await expect(
      asUser(userId, (client) =>
        client.query(
          "update dividend_payments set archived_at = null, note = 'geaendert' where id = $1",
          [payment.id],
        ),
      ),
    ).rejects.toThrow(/keine weiteren Felder/);

    const reactivated = await asUser(userId, (client) =>
      client.query<{ archived_at: string | null }>(
        "update dividend_payments set archived_at = null where id = $1 returning archived_at",
        [payment.id],
      ),
    );
    expect(firstRow(reactivated).archived_at).toBeNull();
  });
});

describe("Audit Log (SECURITY_MODEL.md §8)", () => {
  it("protokolliert INSERT mit bereinigten Werten", async () => {
    const depotId = await asUser(userId, (client) => seedDepot(client, "Depot Audit 1"));

    const entries = await asUser(userId, (client) =>
      client.query<AuditLogRow>(
        `select action, old_values, new_values, origin from audit_log
         where entity_type = 'depot' and entity_id = $1`,
        [depotId],
      ),
    );

    expect(entries.rows).toHaveLength(1);
    const entry = firstRow(entries);
    expect(entry.action).toBe("insert");
    expect(entry.old_values).toBeNull();
    expect(entry.new_values?.name).toBe("Depot Audit 1");
    // Technische Felder duerfen nicht protokolliert werden.
    expect(entry.new_values?.id).toBeUndefined();
    expect(entry.new_values?.user_id).toBeUndefined();
    expect(entry.new_values?.created_at).toBeUndefined();
    expect(entry.origin).toBe("ui");
  });

  it("protokolliert UPDATE nur mit den geaenderten Feldern", async () => {
    const depotId = await asUser(userId, (client) => seedDepot(client, "Depot Audit 2"));
    await asUser(userId, (client) =>
      client.query("update depots set note = $1 where id = $2", ["Erste Notiz", depotId]),
    );

    const entries = await asUser(userId, (client) =>
      client.query<AuditLogRow>(
        `select action, old_values, new_values from audit_log
         where entity_type = 'depot' and entity_id = $1 and action = 'update'
         order by created_at desc limit 1`,
        [depotId],
      ),
    );

    expect(entries.rows).toHaveLength(1);
    const entry = firstRow(entries);
    expect(entry.old_values).toEqual({ note: null });
    expect(entry.new_values).toEqual({ note: "Erste Notiz" });
  });

  it("erzeugt keinen Eintrag, wenn sich fachlich nichts aendert", async () => {
    const depotId = await asUser(userId, (client) => seedDepot(client, "Depot Audit 3"));

    const countBefore = await asUser(userId, (client) =>
      client.query<{ count: string }>(
        "select count(*) from audit_log where entity_type = 'depot' and entity_id = $1",
        [depotId],
      ),
    );

    // Setzt exakt denselben Namen erneut - keine fachliche Aenderung.
    await asUser(userId, (client) =>
      client.query("update depots set name = 'Depot Audit 3' where id = $1", [depotId]),
    );

    const countAfter = await asUser(userId, (client) =>
      client.query<{ count: string }>(
        "select count(*) from audit_log where entity_type = 'depot' and entity_id = $1",
        [depotId],
      ),
    );

    expect(firstRow(countAfter).count).toBe(firstRow(countBefore).count);
  });

  it("markiert Archivierung/Reaktivierung als eigene Aktion", async () => {
    const depotId = await asUser(userId, (client) => seedDepot(client, "Depot Audit 4"));
    const securityId = await asUser(userId, (client) =>
      seedSecurity(client, { name: "Audit AG 4" }),
    );
    const payment = await asUser(userId, (client) =>
      seedPayment(client, { securityId, depotId }),
    );

    await asUser(userId, (client) =>
      client.query("update dividend_payments set archived_at = now() where id = $1", [
        payment.id,
      ]),
    );
    await asUser(userId, (client) =>
      client.query("update dividend_payments set archived_at = null where id = $1", [
        payment.id,
      ]),
    );

    const entries = await asUser(userId, (client) =>
      client.query<{ action: string }>(
        `select action from audit_log
         where entity_type = 'dividend_payment' and entity_id = $1
         order by created_at asc`,
        [payment.id],
      ),
    );

    expect(entries.rows.map((r) => r.action)).toEqual(["insert", "archive", "unarchive"]);
  });

  it("audit_log ist insert-only: kein UPDATE/DELETE ueber die API", async () => {
    const depotId = await asUser(userId, (client) => seedDepot(client, "Depot Audit 5"));
    const entry = await asUser(userId, (client) =>
      client.query<{ id: number }>(
        "select id from audit_log where entity_type = 'depot' and entity_id = $1",
        [depotId],
      ),
    );
    const entryId = firstRow(entry).id;

    // Kein UPDATE/DELETE-Grant fuer authenticated (Least Privilege) -> die
    // Datenbank verweigert den Zugriff bereits vor jeder RLS-Auswertung.
    await expect(
      asUser(userId, (client) =>
        client.query("update audit_log set origin = 'restore' where id = $1", [entryId]),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      asUser(userId, (client) =>
        client.query("delete from audit_log where id = $1", [entryId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("guard_base_currency_change (DECISIONS.md D-002)", () => {
  it("erlaubt die Aenderung der Basiswaehrung ohne vorhandene Zahlungen", async () => {
    const freshUserId = await createTestUser("base-currency-free@example.test");
    const result = await asUser(freshUserId, (client) =>
      client.query<{ base_currency: string }>(
        "update profiles set base_currency = 'USD' where id = $1 returning base_currency",
        [freshUserId],
      ),
    );
    expect(firstRow(result).base_currency).toBe("USD");
  });

  it("verbietet die Aenderung der Basiswaehrung bei vorhandenen Zahlungen", async () => {
    const depotId = await asUser(userId, (client) =>
      seedDepot(client, "Depot Currency Guard"),
    );
    const securityId = await asUser(userId, (client) =>
      seedSecurity(client, { name: "Currency Guard AG" }),
    );
    await asUser(userId, (client) => seedPayment(client, { securityId, depotId }));

    await expect(
      asUser(userId, (client) =>
        client.query("update profiles set base_currency = 'USD' where id = $1", [userId]),
      ),
    ).rejects.toThrow(/Basiswaehrung kann nicht geaendert werden/);
  });
});
