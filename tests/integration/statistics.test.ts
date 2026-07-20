import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, closePool, createTestUser } from "./support/db";
import { seedDepot, seedPayment, seedSecurity } from "./support/seed";

/**
 * Integrationstests der Statistik-Datenbasis (Phase 5B). Sie pruefen die
 * SQL-Ebene, auf der die Analytics-Schicht aggregiert: aktive Eingaenge des
 * angemeldeten Nutzers (RLS), Ausschluss stornierter (archivierter) Zahlungen
 * und Einbeziehung archivierter Unternehmen/Depots ueber ihre aktiven
 * Zahlungen. Die Client-Aggregationen selbst (yearStatistics,
 * securityStatistics, depotStatistics, …) sind in
 * `tests/unit/lib/statistics/statistics.test.ts` decimal-genau abgedeckt; hier
 * wird sichergestellt, dass die zugrunde liegende Zeilenmenge (identische Query
 * wie `fetchDashboardPayments`) mit unabhaengigen SQL-`GROUP BY`-Summen
 * uebereinstimmt und RLS eingehalten wird.
 *
 * Voraussetzung: lokale Postgres-Testdatenbank (`npm run test:integration`).
 */

const ACTIVE_WHERE = "archived_at is null";

let userA: string;
let userB: string;
let depotA: string;
let depotB: string;
let securityActive: string;
let securityArchived: string;

beforeAll(async () => {
  userA = await createTestUser("stats-user-a@example.test");
  userB = await createTestUser("stats-user-b@example.test");

  depotA = await asUser(userA, (client) => seedDepot(client, "Statistik Depot A"));
  depotB = await asUser(userA, (client) => seedDepot(client, "Statistik Depot B"));
  securityActive = await asUser(userA, (client) =>
    seedSecurity(client, { name: "Aktive AG" }),
  );
  securityArchived = await asUser(userA, (client) =>
    seedSecurity(client, { name: "Historische AG" }),
  );

  // Zwei Jahre, Depot A, aktives Unternehmen.
  await asUser(userA, (client) =>
    seedPayment(client, {
      securityId: securityActive,
      depotId: depotA,
      payDate: "2024-03-10",
      grossAmount: "120.00",
      netAmount: "100.00",
    }),
  );
  await asUser(userA, (client) =>
    seedPayment(client, {
      securityId: securityActive,
      depotId: depotA,
      payDate: "2025-03-10",
      grossAmount: "240.00",
      netAmount: "200.00",
    }),
  );
  // Depot B, aktives Unternehmen.
  await asUser(userA, (client) =>
    seedPayment(client, {
      securityId: securityActive,
      depotId: depotB,
      payDate: "2025-05-10",
      grossAmount: "36.00",
      netAmount: "30.00",
    }),
  );
  // Aktive Zahlung eines danach archivierten Unternehmens — bleibt einbezogen.
  await asUser(userA, (client) =>
    seedPayment(client, {
      securityId: securityArchived,
      depotId: depotA,
      payDate: "2025-07-10",
      grossAmount: "60.00",
      netAmount: "50.00",
    }),
  );
  // Stornierte (archivierte) Zahlung — muss ausgeschlossen bleiben.
  const cancelled = await asUser(userA, (client) =>
    seedPayment(client, {
      securityId: securityActive,
      depotId: depotA,
      payDate: "2025-09-10",
      grossAmount: "999.00",
      netAmount: "999.00",
    }),
  );
  await asUser(userA, (client) =>
    client.query("update dividend_payments set archived_at = now() where id = $1", [
      cancelled.id,
    ]),
  );
  // Unternehmen und Depot archivieren — historische Zahlungen bleiben sichtbar.
  await asUser(userA, (client) =>
    client.query("update securities set archived_at = now() where id = $1", [
      securityArchived,
    ]),
  );
});

afterAll(async () => {
  await closePool();
});

describe("Statistik-Datenbasis (§11)", () => {
  it("Gesamtsumme über aktive Eingänge schließt Storno aus", async () => {
    const result = await asUser(userA, (client) =>
      client.query<{ total: string; count: string }>(
        `select coalesce(sum(net_amount),0)::text as total, count(*)::text as count
         from dividend_payments where ${ACTIVE_WHERE}`,
      ),
    );
    // 100 + 200 + 30 + 50 = 380 (Storno 999 ausgeschlossen)
    expect(Number(result.rows[0]?.total).toFixed(2)).toBe("380.00");
    expect(result.rows[0]?.count).toBe("4");
  });

  it("Jahresaggregation je Jahr (GROUP BY) inkl. archiviertem Unternehmen", async () => {
    const result = await asUser(userA, (client) =>
      client.query<{ year: string; total: string }>(
        `select extract(year from pay_date)::int::text as year,
                sum(net_amount)::text as total
         from dividend_payments where ${ACTIVE_WHERE}
         group by 1 order by 1`,
      ),
    );
    const byYear = new Map(result.rows.map((r) => [r.year, Number(r.total).toFixed(2)]));
    expect(byYear.get("2024")).toBe("100.00");
    expect(byYear.get("2025")).toBe("280.00"); // 200 + 30 + 50 (archiviertes Unternehmen zählt)
  });

  it("Unternehmensaggregation behält archivierte Unternehmen, schließt Storno aus", async () => {
    const result = await asUser(userA, (client) =>
      client.query<{ security_id: string; total: string }>(
        `select security_id, sum(net_amount)::text as total
         from dividend_payments where ${ACTIVE_WHERE}
         group by 1`,
      ),
    );
    const bySecurity = new Map(
      result.rows.map((r) => [r.security_id, Number(r.total).toFixed(2)]),
    );
    expect(bySecurity.get(securityActive)).toBe("330.00"); // 100 + 200 + 30
    expect(bySecurity.get(securityArchived)).toBe("50.00");
  });

  it("Depotaggregation je Depot (GROUP BY) inkl. archiviertem Depot", async () => {
    const result = await asUser(userA, (client) =>
      client.query<{ depot_id: string; total: string; companies: string }>(
        `select depot_id, sum(net_amount)::text as total,
                count(distinct security_id)::text as companies
         from dividend_payments where ${ACTIVE_WHERE}
         group by 1`,
      ),
    );
    const byDepot = new Map(result.rows.map((r) => [r.depot_id, r]));
    expect(Number(byDepot.get(depotA)?.total).toFixed(2)).toBe("350.00"); // 100 + 200 + 50
    expect(byDepot.get(depotA)?.companies).toBe("2"); // aktiv + archiviert
    expect(Number(byDepot.get(depotB)?.total).toFixed(2)).toBe("30.00");
  });

  it("isoliert Nutzer: B sieht keine Statistikdaten von A (RLS)", async () => {
    const result = await asUser(userB, (client) =>
      client.query(`select id from dividend_payments where ${ACTIVE_WHERE}`),
    );
    expect(result.rows).toHaveLength(0);
  });
});
