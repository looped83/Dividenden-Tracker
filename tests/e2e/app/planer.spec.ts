import { seedPortfolio } from "../support/portfolio";
import { expect, test } from "../support/appTest";

/**
 * Planer (seit 2.20.0): Nachkauf, Monatsluecken und Schneeball. Annahmen und
 * ausgeschlossene Assets stehen am Profil und ueberdauern ein Neuladen
 * (Migration 0034).
 */
test("verteilt einen Einmalkauf und merkt sich ausgeschlossene Assets", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/planer");

  await expect(page.getByText("Mehr im Jahr · netto")).toBeVisible();
  const kaeufe = page.getByRole("region", { name: "Käufe" }).getByRole("listitem");
  await expect(kaeufe).toHaveCount(3);

  const erster = kaeufe.first().getByRole("link");
  const name = (await erster.locator(".font-medium").first().textContent()) ?? "";
  expect(name).not.toBe("");
  await kaeufe
    .first()
    .getByRole("button", { name: `${name} nicht mehr vorschlagen` })
    .click();
  await expect(page.getByText("1 Asset ausgeschlossen")).toBeVisible();

  await page.reload();
  await expect(page.getByText("1 Asset ausgeschlossen")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Käufe" }).getByText(name, { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "1 Asset ausgeschlossen" }).click();
  await page.getByRole("button", { name: `${name} wieder vorschlagen` }).click();
  await expect(page.getByText("1 Asset ausgeschlossen")).toHaveCount(0);
});

test("rechnet Sparpläne als Monatsrate", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/planer?modus=sparplan&betrag=500");

  await expect(page.getByText("Mehr im Jahr nach 12 Monaten · netto")).toBeVisible();
  await expect(page.getByLabel("Sparrate pro Monat")).toHaveValue("500");
  await expect(page.getByRole("heading", { name: "Sparpläne" })).toBeVisible();
});

test("speichert die Annahmen des Schneeballs", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/planer/schneeball");

  const savings = page.getByLabel("Sparrate pro Monat");
  await savings.fill("500");
  await savings.press("Enter");
  await expect(savings).toHaveValue("500");

  await page.reload();
  await expect(page.getByLabel("Sparrate pro Monat")).toHaveValue("500");
});

test("verwirft Annahmen über der Obergrenze, statt still anders zu rechnen", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/planer/schneeball");

  // 35 % liegt ueber der Grenze von 30 %: Das Feld stellt den vorigen Wert
  // wieder her, statt 35 zu zeigen und mit 2 % zu rechnen.
  const inflation = page.getByLabel("Inflation pro Jahr");
  await expect(inflation).toHaveValue("2");
  await inflation.fill("35");
  await inflation.press("Enter");
  await expect(inflation).toHaveValue("2");

  await page.reload();
  await expect(page.getByLabel("Inflation pro Jahr")).toHaveValue("2");
});

test("pflegt Sparpläne und zeigt sie am Asset", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/planer/sparplaene");

  await page.getByRole("button", { name: "Sparplan eintragen" }).click();
  const dialog = page.getByRole("dialog", { name: "Neuer Sparplan" });
  await dialog.getByLabel("Asset").selectOption({ label: "Allianz" });
  await dialog.getByLabel("Rate (€)").fill("30");
  await dialog.getByLabel("Rhythmus").selectOption("weekly");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(dialog).toHaveCount(0);

  // 30 € wöchentlich sind 130 € im Monat.
  await page.reload();
  const plaene = page.getByRole("region", { name: "Pläne" });
  await expect(plaene.getByText("Allianz", { exact: true })).toBeVisible();
  await expect(page.getByText("Sparpläne im Monat")).toBeVisible();
  await expect(plaene.getByText("≈ 130 €")).toBeVisible();

  await page.goto("/#/depot");
  await page
    .getByRole("link", { name: /Allianz/ })
    .first()
    .click();
  const abschnitt = page.getByRole("region", { name: "Sparplan" });
  await expect(abschnitt.getByText("30 € wöchentlich")).toBeVisible();

  // Der Nachkauf übernimmt die Summe der Pläne als Monatsrate.
  await page.goto("/#/planer?modus=sparplan");
  await expect(page.getByLabel("Sparrate pro Monat")).toHaveValue("130");
  await expect(page.getByText("Deine Sparpläne")).toBeVisible();
});
