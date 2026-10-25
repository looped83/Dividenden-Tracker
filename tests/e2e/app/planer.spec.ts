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
