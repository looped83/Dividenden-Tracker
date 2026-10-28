import { seedPortfolio } from "../support/portfolio";
import { expect, test } from "../support/appTest";

/**
 * Reinvestition (seit 2.38.0): Der Schalter auf der Seite des Assets speichert
 * sofort; die Bestandsliste kennzeichnet das Asset danach — auch nach dem
 * Neuladen, also aus der Datenbank.
 */
test("schaltet die Reinvestition am Asset und zeigt sie im Bestand", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/depot");
  await expect(page.getByText("Dividenden werden reinvestiert")).toHaveCount(0);

  await page.getByRole("link", { name: "Microsoft" }).first().click();
  const schalter = page.getByRole("switch", { name: "Dividenden reinvestieren" });
  await expect(schalter).toHaveAttribute("aria-checked", "false");
  await schalter.click();
  await expect(schalter).toHaveAttribute("aria-checked", "true");

  await page.goto("/#/depot");
  await page.reload();
  await expect(page.getByText("Dividenden werden reinvestiert")).toHaveCount(1);
});
