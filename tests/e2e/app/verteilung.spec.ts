import { asUser } from "../support/db";
import { expect, test } from "../support/appTest";

/**
 * „Verteilung" auf der Übersicht: Der Umschalter zwischen Assets und Depots
 * darf die Seite nicht springen lassen.
 *
 * Früher standen fünf Assets mit Link gegen drei Depots: Der Abschnitt
 * schrumpfte beim Umschalten und alles darunter rutschte. Jetzt zeigen beide
 * Sichten gleich viele Zeilen und je einen Link. Höhen gibt es nur
 * im Browser; in jsdom ist jede Liste 0 px hoch.
 */

const DEPOTS = ["Depot 2", "Depot 3"];
const ASSETS = ["Alpha AG", "Beta AG", "Gamma AG", "Delta AG", "Epsilon AG"];

test("Verteilung: Umschalten ändert die Höhe nicht", async ({ page, konto }) => {
  await asUser(konto.userId, async (client) => {
    const depotIds = [konto.depotId];
    for (const name of DEPOTS) {
      const depot = await client.query<{ id: string }>(
        "insert into depots (name) values ($1) returning id",
        [name],
      );
      depotIds.push(depot.rows[0]?.id ?? "");
    }
    // Sechstes Asset: mehr Assets als Zeilen, wie im echten Bestand.
    await client.query(
      `insert into dividend_payments
         (security_id, depot_id, pay_date, gross_amount, net_amount,
          withholding_tax, domestic_tax, original_currency, payment_type, source)
       values ($1, $2, '2026-03-10', 5, 5, 0, 0, 'EUR', 'regular', 'manual')`,
      [konto.securityId, konto.depotId],
    );
    for (const [index, name] of ASSETS.entries()) {
      const security = await client.query<{ id: string }>(
        "insert into securities (name, ticker, payout_months) values ($1, $2, '{}') returning id",
        [name, `T${String(index)}`],
      );
      await client.query(
        `insert into dividend_payments
           (security_id, depot_id, pay_date, gross_amount, net_amount,
            withholding_tax, domestic_tax, original_currency, payment_type, source)
         values ($1, $2, '2026-03-10', $3, $3, 0, 0, 'EUR', 'regular', 'manual')`,
        [
          security.rows[0]?.id,
          depotIds[index % depotIds.length],
          String(100 - index * 10),
        ],
      );
    }
  });

  await page.goto("/#/");
  const section = page.getByRole("region", { name: "Verteilung" });
  await expect(
    section.getByRole("list", { name: "Top-Assets nach Nettodividende" }),
  ).toBeVisible();
  const before = await section.boundingBox();

  await section.getByRole("radio", { name: "Depots" }).click();
  await expect(
    section.getByRole("list", { name: "Nettodividende je Depot" }),
  ).toBeVisible();
  const after = await section.boundingBox();

  expect(after?.height).toBe(before?.height);
});
