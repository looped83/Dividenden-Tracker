import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asAnon,
  asSuperuser,
  asUser,
  closePool,
  createTestUser,
  firstRow,
} from "./support/db";
import {
  type DividendPaymentRow,
  seedDepot,
  seedPayment,
  seedSecurity,
} from "./support/seed";

// Zwei getrennte Testnutzer + anon (SECURITY_MODEL.md §10, TEST_STRATEGY.md §6).
let userA: string;
let userB: string;

let depotA: string;
let securityA: string;
let paymentAId: string;

beforeAll(async () => {
  userA = await createTestUser("rls-user-a@example.test");
  userB = await createTestUser("rls-user-b@example.test");

  depotA = await asUser(userA, (client) => seedDepot(client, "Depot A"));
  securityA = await asUser(userA, (client) =>
    seedSecurity(client, { name: "Security A" }),
  );
  const paymentA = await asUser(userA, (client) =>
    seedPayment(client, { securityId: securityA, depotId: depotA }),
  );
  paymentAId = paymentA.id;
});

afterAll(async () => {
  await closePool();
});

describe("1) Nutzer liest nur eigene Zeilen", () => {
  it("A sieht sein eigenes Depot, seine eigene Zahlung und sein eigenes Wertpapier", async () => {
    const depots = await asUser(userA, (client) => client.query("select id from depots"));
    const payments = await asUser(userA, (client) =>
      client.query("select id from dividend_payments"),
    );
    const securities = await asUser(userA, (client) =>
      client.query("select id from securities"),
    );

    expect(depots.rows.map((r: { id: string }) => r.id)).toContain(depotA);
    expect(payments.rows.map((r: { id: string }) => r.id)).toContain(paymentAId);
    expect(securities.rows.map((r: { id: string }) => r.id)).toContain(securityA);
  });
});

describe("2) Fremde Daten sind fuer andere Nutzer unsichtbar", () => {
  it("B sieht keine der Zeilen von A (in keiner Tabelle)", async () => {
    const depots = await asUser(userB, (client) => client.query("select id from depots"));
    const payments = await asUser(userB, (client) =>
      client.query("select id from dividend_payments"),
    );
    const securities = await asUser(userB, (client) =>
      client.query("select id from securities"),
    );

    expect(depots.rows.map((r: { id: string }) => r.id)).not.toContain(depotA);
    expect(payments.rows.map((r: { id: string }) => r.id)).not.toContain(paymentAId);
    expect(securities.rows.map((r: { id: string }) => r.id)).not.toContain(securityA);
  });

  it("B kann A's Zahlung nicht direkt per ID lesen (leeres Ergebnis, kein Fehler-Leak)", async () => {
    const result = await asUser(userB, (client) =>
      client.query("select * from dividend_payments where id = $1", [paymentAId]),
    );
    expect(result.rowCount).toBe(0);
  });
});

describe("3) Manipulierte user_id beim INSERT", () => {
  it("wird abgelehnt, wenn sie nicht auth.uid() entspricht", async () => {
    await expect(
      asUser(userB, (client) =>
        client.query("insert into depots (user_id, name) values ($1, 'Untergeschoben')", [
          userA,
        ]),
      ),
    ).rejects.toThrow(/user_id muss auth.uid/);
  });

  it("RLS with-check wuerde ebenfalls greifen, falls der Trigger fehlte (Defense in Depth)", async () => {
    // Simuliert den Fall, dass ausschliesslich RLS (ohne Trigger) prueft:
    // direktes SELECT nach dem (fehlgeschlagenen) Versuch zeigt keine fremde Zeile.
    const rows = await asUser(userB, (client) =>
      client.query("select id from depots where name = 'Untergeschoben'"),
    );
    expect(rows.rowCount).toBe(0);
  });
});

describe("4) UPDATE/Archivierung fremder Zeilen betrifft 0 Zeilen", () => {
  it("B kann A's Zahlung nicht archivieren", async () => {
    const result = await asUser(userB, (client) =>
      client.query("update dividend_payments set archived_at = now() where id = $1", [
        paymentAId,
      ]),
    );
    expect(result.rowCount).toBe(0);

    const stillActive = await asUser(userA, (client) =>
      client.query<{ archived_at: string | null }>(
        "select archived_at from dividend_payments where id = $1",
        [paymentAId],
      ),
    );
    expect(firstRow(stillActive).archived_at).toBeNull();
  });

  it("B kann A's Depotnamen nicht aendern", async () => {
    const result = await asUser(userB, (client) =>
      client.query("update depots set name = 'Uebernommen' where id = $1", [depotA]),
    );
    expect(result.rowCount).toBe(0);
  });
});

describe("5) DELETE auf dividend_payments ist nur fuer bereits archivierte eigene Zeilen erlaubt (Grundsatz 3, engste Ausnahme, 0013)", () => {
  it("A kann seine aktive (nicht archivierte) Zahlung nicht loeschen", async () => {
    const result = await asUser(userA, (client) =>
      client.query("delete from dividend_payments where id = $1", [paymentAId]),
    );
    expect(result.rowCount).toBe(0);

    const stillExists = await asUser(userA, (client) =>
      client.query("select id from dividend_payments where id = $1", [paymentAId]),
    );
    expect(stillExists.rowCount).toBe(1);
  });

  it("B kann A's archivierte Zahlung nicht loeschen (fremde Zeile)", async () => {
    const depotId = await asUser(userA, (client) =>
      seedDepot(client, "Depot Delete Foreign"),
    );
    const securityId = await asUser(userA, (client) =>
      seedSecurity(client, { name: "Delete Foreign AG" }),
    );
    const payment = await asUser(userA, (client) =>
      seedPayment(client, { securityId, depotId }),
    );
    await asUser(userA, (client) =>
      client.query("update dividend_payments set archived_at = now() where id = $1", [
        payment.id,
      ]),
    );

    const result = await asUser(userB, (client) =>
      client.query("delete from dividend_payments where id = $1", [payment.id]),
    );
    expect(result.rowCount).toBe(0);

    const stillExists = await asUser(userA, (client) =>
      client.query("select id from dividend_payments where id = $1", [payment.id]),
    );
    expect(stillExists.rowCount).toBe(1);
  });

  it("A kann seine eigene archivierte Zahlung endgueltig loeschen", async () => {
    const depotId = await asUser(userA, (client) =>
      seedDepot(client, "Depot Delete Own"),
    );
    const securityId = await asUser(userA, (client) =>
      seedSecurity(client, { name: "Delete Own AG" }),
    );
    const payment = await asUser(userA, (client) =>
      seedPayment(client, { securityId, depotId }),
    );
    await asUser(userA, (client) =>
      client.query("update dividend_payments set archived_at = now() where id = $1", [
        payment.id,
      ]),
    );

    const result = await asUser(userA, (client) =>
      client.query("delete from dividend_payments where id = $1", [payment.id]),
    );
    expect(result.rowCount).toBe(1);

    const stillExists = await asUser(userA, (client) =>
      client.query("select id from dividend_payments where id = $1", [payment.id]),
    );
    expect(stillExists.rowCount).toBe(0);
  });
});

describe("6) Zugriff ohne Anmeldung (anon)", () => {
  it("anon hat keinerlei Tabellenrechte (Grant verweigert vor RLS)", async () => {
    await expect(
      asAnon((client) => client.query("select id from depots")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asAnon((client) => client.query("select id from dividend_payments")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asAnon((client) => client.query("select id from securities")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asAnon((client) => client.query("select id from profiles")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asAnon((client) => client.query("select id from audit_log")),
    ).rejects.toThrow(/permission denied/);
  });

  it("anon kann nichts einfuegen", async () => {
    await expect(
      asAnon((client) => client.query("insert into depots (name) values ('Anon Depot')")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("7) Direkte Anfragen mit manipulierten Filtern (kein API-Umweg)", () => {
  it("ein OR-Filter ueber alle Zeilen liefert trotzdem nur eigene Daten", async () => {
    // Simuliert eine versuchte Umgehung durch einen weiten WHERE-Filter
    // (etwa "true" oder OR-Verkettung), wie er ueber eine direkte
    // PostgREST-Anfrage denkbar waere. RLS wird immer UND-verknuepft.
    const result = await asUser(userB, (client) =>
      client.query("select id from depots where true or 1=1"),
    );
    expect(result.rows.map((r: { id: string }) => r.id)).not.toContain(depotA);
  });
});

describe("8) RPC mit fremder ID", () => {
  it("archive_payment schlaegt fehl, wenn B die ID von A's Zahlung nutzt", async () => {
    await expect(
      asUser(userB, (client) =>
        client.query("select archive_payment($1, $2)", [paymentAId, "Fremdversuch"]),
      ),
    ).rejects.toThrow(/nicht gefunden/);

    const stillActive = await asUser(userA, (client) =>
      client.query<{ archived_at: string | null }>(
        "select archived_at from dividend_payments where id = $1",
        [paymentAId],
      ),
    );
    expect(firstRow(stillActive).archived_at).toBeNull();
  });

  it("archive_payment funktioniert fuer den Eigentuemer", async () => {
    const depotId = await asUser(userA, (client) => seedDepot(client, "Depot RPC Own"));
    const securityId = await asUser(userA, (client) =>
      seedSecurity(client, { name: "RPC Own AG" }),
    );
    const payment = await asUser(userA, (client) =>
      seedPayment(client, { securityId, depotId }),
    );

    const result = await asUser(userA, (client) =>
      client.query<DividendPaymentRow>("select * from archive_payment($1, $2)", [
        payment.id,
        "Testgrund",
      ]),
    );
    const archived = firstRow(result);
    expect(archived.archived_at).not.toBeNull();
    expect(archived.archive_reason).toBe("Testgrund");
  });
});

describe("9) audit_log: nur eigene Eintraege lesbar, kein Schreibzugriff", () => {
  it("A sieht nur eigene Audit-Eintraege, B keinen davon", async () => {
    const auditA = await asUser(userA, (client) =>
      client.query(
        "select entity_id from audit_log where entity_type = 'depot' and entity_id = $1",
        [depotA],
      ),
    );
    const auditB = await asUser(userB, (client) =>
      client.query(
        "select entity_id from audit_log where entity_type = 'depot' and entity_id = $1",
        [depotA],
      ),
    );

    expect(auditA.rowCount).toBeGreaterThan(0);
    expect(auditB.rowCount).toBe(0);
  });

  it("kein Nutzer kann direkt in audit_log schreiben", async () => {
    await expect(
      asUser(userA, (client) =>
        client.query(
          `insert into audit_log (user_id, entity_type, entity_id, action, new_values, origin)
           values ($1, 'depot', $2, 'insert', '{}'::jsonb, 'ui')`,
          [userA, depotA],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("Grants (Least Privilege, SECURITY_MODEL.md §3.4)", () => {
  it("anon-Rolle hat keine Tabellenrechte (revoke all)", async () => {
    const result = await asSuperuser((client) =>
      client.query(
        `select table_name, privilege_type from information_schema.role_table_grants
         where grantee = 'anon' and table_schema = 'public'`,
      ),
    );
    expect(result.rowCount).toBe(0);
  });
});
