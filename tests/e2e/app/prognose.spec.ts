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
