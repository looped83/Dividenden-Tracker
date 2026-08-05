import { fileURLToPath } from "node:url";
import { expect, test } from "../support/appTest";

/**
 * Unterbereich „Entwicklung" des Depots (docs/PORTFOLIO_IMPORT.md).
 *
 * Der ganze Weg im Browser: zwei Depotstaende importieren, dann pruefen, dass
 * der Bereich beide zu einem Verlauf zusammensetzt und die erwartete
 * Jahresdividende dem gegenueberstellt, was in den zwoelf Monaten bis zum
 * Stichtag tatsaechlich hereinkam.
 *
 * Die beiden Beispieldateien sind erfunden; ihre Namen tragen die Zeitstempel,
 * aus denen der Assistent die Stichtage liest (02.02.2026 und 03.08.2026).
 */

const ALT = fileURLToPath(
  new URL("../fixtures/divvydiaryportfolio1770000000000.csv", import.meta.url),
);
const NEU = fileURLToPath(
  new URL("../fixtures/divvydiaryportfolio1785790381565.csv", import.meta.url),
);

test.use({
  seed: {
    payments: [
      { payDate: "2025-09-15", netAmount: "820.00" },
      { payDate: "2026-01-15", netAmount: "340.00" },
      { payDate: "2026-07-15", netAmount: "410.00" },
    ],
  },
});

async function importiere(page: import("@playwright/test").Page, datei: string) {
  await page.goto("/#/depot");
  await page.getByRole("button", { name: "Depotstand importieren" }).click();
  await page.setInputFiles('input[type="file"]', datei);
  await page.getByRole("button", { name: /Positionen übernehmen/ }).click();
  await expect(page.getByText(/gespeichert/)).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Schließen" })
    .first()
    .click();
}

test("setzt zwei Depotstände zu einem Verlauf zusammen", async ({ page }) => {
  await importiere(page, ALT);
  await importiere(page, NEU);

  await page.goto("/#/depot/entwicklung");

  // Erwartet aus dem juengsten Stand: 40 + 10 = 50 €.
  await expect(page.getByText("50,00 €").first()).toBeVisible();
  // Erhalten in den zwoelf Monaten bis zum 03.08.2026: 820 + 340 + 410.
  await expect(page.getByText("04.08.2025 – 03.08.2026")).toBeVisible();
  await expect(page.getByText("1.570,00 €").first()).toBeVisible();

  // Mit zwei Staenden entsteht der Verlauf.
  await expect(
    page.getByRole("img", {
      name: "Erwartete und tatsächlich erhaltene Dividenden je Stichtag",
    }),
  ).toBeVisible();

  // Die Aufteilung nennt fehlende Angaben, statt sie zu verschweigen: Der ETF
  // hat beim Import kein „mixed" als Branche bekommen.
  await expect(page.getByText("Aufteilung nach Branche")).toBeVisible();
  await expect(page.getByText("ohne Angabe").first()).toBeVisible();
});

test("zeigt bei gewähltem Asset dessen Erwartung, nicht die des Depots", async ({
  page,
  konto,
}) => {
  await importiere(page, NEU);

  // Ungefiltert: 40 € (Muster AG) + 10 € (Beispiel SE).
  await page.goto("/#/depot/entwicklung");
  await expect(page.getByText("50,00 €").first()).toBeVisible();

  // Der Filter kommt ueber die Adresse — wie in den uebrigen Filtertests und
  // unabhaengig davon, ob die Leiste auf schmalen Geraeten eingeklappt ist.
  await page.goto(`/#/depot/entwicklung?security=${konto.securityId}`);

  // Gefiltert muessen **beide** Seiten dem Asset folgen. Stuende hier
  // weiter 50 €, stuende die Erwartung des ganzen Depots neben der erhaltenen
  // Summe eines einzelnen Papiers.
  await expect(page.getByText("40,00 €").first()).toBeVisible();
  await expect(page.getByText("50,00 €")).toHaveCount(0);

  // Die Aufteilung entfaellt: eine Branche, ein Land, jeweils 100 %.
  await expect(page.getByText("Aufteilung nach Branche")).toHaveCount(0);

  // Ein Depotkontofilter in der Adresse bleibt wirkungslos, statt nur die erhaltene
  // Haelfte des Vergleichs zu treffen.
  await page.goto(
    `/#/depot/entwicklung?security=${konto.securityId}&depot=00000000-0000-0000-0000-000000000000`,
  );
  await expect(page.getByText("40,00 €").first()).toBeVisible();
  await expect(page.getByText("1.570,00 €").first()).toBeVisible();
});

test("nennt den fehlenden Depotstand, statt eine leere Seite zu zeigen", async ({
  page,
}) => {
  await page.goto("/#/depot/entwicklung");
  await expect(page.getByText("Noch kein Depotstand importiert")).toBeVisible();
  await expect(page.getByRole("link", { name: "Zu den Assets" })).toBeVisible();
});

test("läuft auf schmalen Geräten nicht seitlich über", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await importiere(page, NEU);
  await page.goto("/#/depot/entwicklung");
  await expect(page.getByText("Erwartet p. a.").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
