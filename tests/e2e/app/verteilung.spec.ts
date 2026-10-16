import { asUser } from "../support/db";
import type { Page } from "@playwright/test";
import { expect, test, type Konto } from "../support/appTest";

/**
 * „Verteilung" auf der Übersicht: Der Umschalter zwischen Assets und Depots
 * bleibt beim Umschalten an seiner Stelle im Fenster.
 *
 * Fünf Assets mit Link „Alle 6 Assets" sind höher als drei Depots. Dass sich
 * der Inhalt darunter verschiebt, ist gewollt (kein Weißraum, keine gekürzte
 * Liste) — der Umschalter selbst darf dabei aber nicht unter dem Finger
 * wegspringen. Positionen gibt es nur im Browser; in jsdom ist alles 0 px.
 */

const DEPOTS = ["Depot 2", "Depot 3"];
const ASSETS = ["Alpha AG", "Beta AG", "Gamma AG", "Delta AG", "Epsilon AG"];

async function seedDistribution(konto: Konto) {
  await asUser(konto.userId, async (client) => {
    const depotIds = [konto.depotId];
    for (const name of DEPOTS) {
      const depot = await client.query<{ id: string }>(
        "insert into depots (name) values ($1) returning id",
        [name],
      );
      depotIds.push(depot.rows[0]?.id ?? "");
    }
    // Sechstes Asset: So erscheint unter den fünf der Link „Alle 6 Assets".
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
}

/** Schaltet hin und zurück; der Umschalter muss jedes Mal dort stehen bleiben. */
async function expectToggleStays(page: Page) {
  const section = page.getByRole("region", { name: "Verteilung" });
  const toggle = section.getByRole("radiogroup", { name: "Verteilung nach" });
  const before = await toggle.boundingBox();

  await section.getByRole("radio", { name: "Depots" }).click();
  await expect(
    section.getByRole("list", { name: "Nettodividende je Depot" }),
  ).toBeVisible();
  const afterDepots = await toggle.boundingBox();

  await section.getByRole("radio", { name: "Assets" }).click();
  await expect(
    section.getByRole("list", { name: "Top-Assets nach Nettodividende" }),
  ).toBeVisible();
  const afterAssets = await toggle.boundingBox();

  expect(afterDepots?.y).toBeCloseTo(before?.y ?? Number.NaN, 0);
  expect(afterAssets?.y).toBeCloseTo(before?.y ?? Number.NaN, 0);
}

async function openOverview(page: Page) {
  await page.goto("/#/");
  await expect(
    page
      .getByRole("region", { name: "Verteilung" })
      .getByRole("list", { name: "Top-Assets nach Nettodividende" }),
  ).toBeVisible();
}

test("Verteilung: Umschalter bleibt mitten auf der Seite stehen", async ({
  page,
  konto,
}) => {
  await seedDistribution(konto);
  await openOverview(page);
  // Wie beim Lesen auf dem Telefon: Die Überschrift steht im oberen Drittel,
  // die Liste reicht bis unter den Fensterrand.
  await page.getByRole("region", { name: "Verteilung" }).evaluate((element) => {
    window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 200);
  });
  await expectToggleStays(page);
});

test("Verteilung: Umschalter bleibt am Seitenende stehen", async ({ page, konto }) => {
  // Hohes Fenster: Ganz unten ist der Umschalter noch zu sehen. Ohne
  // Gegenmaßnahme schrumpft die Seite unter dem Fenster weg, der Browser setzt
  // den Bildlauf zurück und der Umschalter rutscht um die Differenz nach unten.
  await page.setViewportSize({ width: 390, height: 1300 });
  await seedDistribution(konto);
  await openOverview(page);
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expectToggleStays(page);

  // Der festgehaltene Platz am Seitenende schmilzt beim Zurückscrollen weg.
  await page.getByRole("radio", { name: "Depots" }).click();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.minHeight))
    .toBe("");
});
