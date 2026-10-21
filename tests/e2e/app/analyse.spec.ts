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

  for (const titel of ["Asset-Typ", "Währung", "Rhythmus", "Branche", "Land"]) {
    await expect(page.getByRole("heading", { name: titel })).toBeVisible();
  }
  // Die Laender stehen direkt da: Allianz, Münchener Rück und BASF mit
  // 11.100 € von 57.300 € Depotwert.
  const land = page.getByRole("list", { name: /Anteile nach Land/ });
  await expect(land.getByText("Deutschland")).toBeVisible();
  await expect(land.getByText("19,4 %")).toBeVisible();
  // Der Rhythmus kennt nur ausschuettende Positionen.
  await expect(page.getByText("Keine Ausschüttung")).toHaveCount(0);

  await page.getByRole("radio", { name: "Dividende" }).click();
  await expect(page).toHaveURL(/nach=dividende/);
  // Der thesaurierende ETF nennt keine Dividende und zaehlt nicht mit.
  await expect(page.getByText(/1 Position ohne Betrag zählt nicht mit/)).toBeVisible();
});
