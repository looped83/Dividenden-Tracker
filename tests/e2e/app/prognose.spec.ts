import { seedPortfolio } from "../support/portfolio";
import { expect, test } from "../support/appTest";

/**
 * Bestand › Prognose: Schaetzung der naechsten zwoelf Monate. Monatsluecken
 * und Schneeball stehen seit 2.20.0 im Planer (planer.spec.ts).
 */
test("schätzt die nächsten zwölf Monate", async ({ page, konto }) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/depot/prognose");

  await expect(page.getByText("Erwartet in 12 Monaten · netto")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nächste 12 Monate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schneeball" })).toHaveCount(0);
});
