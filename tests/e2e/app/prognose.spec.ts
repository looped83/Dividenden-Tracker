import { seedPortfolio } from "../support/portfolio";
import { expect, test } from "../support/appTest";

/**
 * Bestand › Prognose: Schaetzung der naechsten zwoelf Monate und
 * Dividenden-Schneeball. Die Annahmen stehen am Profil und ueberdauern ein
 * Neuladen (Migration 0034).
 */
test("schätzt die nächsten zwölf Monate und speichert die Annahmen", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/depot/prognose");

  await expect(page.getByText("Erwartet in 12 Monaten · netto")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nächste 12 Monate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schneeball" })).toBeVisible();

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
  await page.goto("/#/depot/prognose");

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
