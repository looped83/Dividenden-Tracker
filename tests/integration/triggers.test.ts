import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asSuperuser, asUser, closePool, createTestUser, firstRow } from "./support/db";
import { seedDepot, seedPayment, seedSecurity } from "./support/seed";

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

describe("Änderungsprotokoll entfernt (DECISIONS.md ADR-011)", () => {
  it("hat weder Tabelle noch Funktion oder Enums", async () => {
    const result = await asSuperuser((client) =>
      client.query<{ table: string | null; fn: string | null; type: string | null }>(
        `select to_regclass('public.audit_log')::text as table,
                to_regproc('public.audit_row_change')::text as fn,
                to_regtype('public.audit_origin')::text as type`,
      ),
    );
    expect(firstRow(result)).toEqual({ table: null, fn: null, type: null });
  });

  it("setzt in keiner Funktion mehr eine Protokoll-Herkunft", async () => {
    const result = await asSuperuser((client) =>
      client.query<{ proname: string }>(
        `select p.proname from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosrc like '%audit_origin%'`,
      ),
    );
    expect(result.rows).toEqual([]);
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

describe("Härtung der Trigger-Funktionen (0035)", () => {
  const pinned = [
    "set_updated_at",
    "enforce_user_id",
    "protect_payment_immutables",
    "guard_base_currency_change",
    "guard_import_status",
    "enforce_own_security",
    "enforce_own_depot",
    "handle_new_user",
  ];

  it("setzt bei allen Trigger-Funktionen einen festen search_path", async () => {
    const result = await asSuperuser((client) =>
      client.query<{ proname: string }>(
        `select p.proname from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = any($1)
            and not exists (
              select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
            )`,
        [pinned],
      ),
    );
    expect(result.rows).toEqual([]);
  });

  it("entzieht anon und authenticated EXECUTE auf die security-definer-Funktionen", async () => {
    const result = await asSuperuser((client) =>
      client.query<{ role: string; fn: string; allowed: boolean }>(
        `select r.role, f.fn, has_function_privilege(r.role, ('public.' || f.fn || '()')::regprocedure, 'execute') as allowed
           from unnest(array['anon', 'authenticated']) as r(role)
           cross join unnest(array['handle_new_user']) as f(fn)`,
      ),
    );
    expect(result.rows.filter((row) => row.allowed)).toEqual([]);
  });
});
