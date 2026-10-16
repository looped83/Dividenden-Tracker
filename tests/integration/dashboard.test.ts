import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activeAnalyticsPayments,
  type RawAnalyticsRow,
} from "@/lib/statistics/mapPayment";
import { asUser, closePool, createTestUser } from "./support/db";
import { seedDepot, seedPayment, seedSecurity } from "./support/seed";

/**
 * Integrationstests fuer die Dashboard-Datenbasis (Phase 5A). Sie pruefen die
 * Abfrage von `fetchAllPayments` samt der Auswahl, die die Auswertungen daraus
 * treffen (`activeAnalyticsPayments`): aktive Eingaenge des angemeldeten
 * Nutzers, Ausschluss stornierter/zurueckgerollter (archivierter) Zahlungen und
 * Einbeziehung archivierter Unternehmen/Depots ueber ihre aktiven Zahlungen.
 *
 * Voraussetzung: lokale Postgres-Testdatenbank (`npm run test:integration`).
 */

// Exakt die Query aus src/lib/supabase/repositories/payments.ts (fetchAllPayments).
// Stornierte Zeilen kommen mit — die Eingangsliste braucht sie; die
// Auswertungen sortieren sie clientseitig aus.
const HISTORY_SELECT = `
  select id, security_id, depot_id, pay_date, net_amount::text, gross_amount::text,
         original_currency, payment_type, source, import_id, archived_at::text,
         created_at::text, updated_at::text
  from dividend_payments
  order by pay_date desc, id asc
`;

/** Ids, die die Auswertungen aus der Historie des Nutzers zaehlen. */
async function dashboardIds(userId: string): Promise<string[]> {
  const result = await asUser(userId, (client) =>
    client.query<RawAnalyticsRow & { archived_at: string | null }>(HISTORY_SELECT),
  );
  return activeAnalyticsPayments(result.rows).map((payment) => payment.id);
}

let userA: string;
let userB: string;
let depotA: string;
let securityActive: string;
let securityArchived: string;

let activePaymentId: string;
let archivedPaymentId: string;
let archivedCompanyPaymentId: string;

beforeAll(async () => {
  userA = await createTestUser("dash-user-a@example.test");
  userB = await createTestUser("dash-user-b@example.test");

  depotA = await asUser(userA, (client) => seedDepot(client, "Dashboard Depot"));
  securityActive = await asUser(userA, (client) =>
    seedSecurity(client, { name: "Aktive AG" }),
  );
  securityArchived = await asUser(userA, (client) =>
    seedSecurity(client, { name: "Historische AG" }),
  );

  // Aktive Zahlung eines aktiven Unternehmens.
  const active = await asUser(userA, (client) =>
    seedPayment(client, {
      securityId: securityActive,
      depotId: depotA,
      payDate: "2026-03-10",
      netAmount: "50.00",
    }),
  );
  activePaymentId = active.id;

  // Aktive Zahlung eines danach archivierten Unternehmens.
  const historic = await asUser(userA, (client) =>
    seedPayment(client, {
      securityId: securityArchived,
      depotId: depotA,
      payDate: "2020-05-10",
      netAmount: "70.00",
    }),
  );
  archivedCompanyPaymentId = historic.id;

  // Stornierte (archivierte) Zahlung — muss ausgeschlossen bleiben.
  const cancelled = await asUser(userA, (client) =>
    seedPayment(client, {
      securityId: securityActive,
      depotId: depotA,
      payDate: "2026-04-10",
      netAmount: "999.00",
    }),
  );
  archivedPaymentId = cancelled.id;
  await asUser(userA, (client) =>
    client.query("update dividend_payments set archived_at = now() where id = $1", [
      cancelled.id,
    ]),
  );

  // Unternehmen archivieren — historische Zahlung darf sichtbar bleiben.
  await asUser(userA, (client) =>
    client.query("update securities set archived_at = now() where id = $1", [
      securityArchived,
    ]),
  );
});

afterAll(async () => {
  await closePool();
});

describe("Dashboard-Datenbasis", () => {
  it("liefert aktive Zahlungen des Nutzers und schliesst stornierte aus", async () => {
    const ids = await dashboardIds(userA);

    expect(ids).toContain(activePaymentId);
    expect(ids).not.toContain(archivedPaymentId);
  });

  it("behält historische Zahlungen archivierter Unternehmen im Dashboard", async () => {
    const ids = await dashboardIds(userA);

    expect(ids).toContain(archivedCompanyPaymentId);
  });

  it("summiert nur aktive Nettobeträge (50,00 + 70,00 = 120,00)", async () => {
    const result = await asUser(userA, (client) =>
      client.query<{ total: string }>(
        "select coalesce(sum(net_amount), 0)::text as total from dividend_payments where archived_at is null",
      ),
    );
    expect(result.rows[0]?.total).toBe("120.00");
  });

  it("isoliert Nutzer: B sieht keine Dashboard-Daten von A", async () => {
    expect(await dashboardIds(userB)).toHaveLength(0);
  });
});
