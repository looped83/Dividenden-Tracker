import { seedPortfolio } from "../support/portfolio";
import { expect, test } from "../support/appTest";

/**
 * Bestand › Analyse: Aufschluesselung des juengsten Depotstands, umschaltbar
 * zwischen Marktwert und erwarteter Dividende.
 */
test("schlüsselt den Depotstand auf und schaltet die Bezugsgröße um", async ({
  page,
  konto,
}) => {
  await seedPortfolio(konto.userId);
  await page.goto("/#/depot/analyse");

  for (const titel of ["Gattung", "Währung", "Rhythmus", "Branche", "Region"]) {
    await expect(page.getByRole("heading", { name: titel })).toBeVisible();
  }
  const region = page.getByRole("list", { name: /Anteile nach Region/ });
  // Sieben europaeische Positionen mit 20.900 € von 57.300 € Depotwert: 36,5 %.
  await expect(region.getByText("Europa")).toBeVisible();
  await expect(region.getByText("36,5 %")).toBeVisible();

  // Die Laender stehen aufklappbar unter ihrer Region.
  await region.getByText("Europa").click();
  await expect(region.getByText("Deutschland")).toBeVisible();

  await page.getByRole("radio", { name: "Dividende" }).click();
  await expect(page).toHaveURL(/nach=dividende/);
  // Der thesaurierende ETF nennt keine Dividende und zaehlt nicht mit.
  await expect(page.getByText(/1 Position ohne Betrag zählt nicht mit/)).toBeVisible();
});
