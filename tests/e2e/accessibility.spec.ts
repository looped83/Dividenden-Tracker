import { expect, test } from "@playwright/test";
import { erwarteTheme, pruefeAxe, stelleThemeEin } from "./support/axe";

/**
 * Automatisierte Barrierefreiheitspruefung (TEST_STRATEGY.md §9) auf den
 * Routen, die ohne Konto erreichbar sind — in beiden Themes, weil Kontraste
 * je Theme aus eigenen Tokens stammen.
 *
 * axe findet nur einen Teil der Probleme; die Checkliste fuer Tastatur,
 * Screenreader und Zoom bleibt daneben bestehen. Geprueft werden die
 * verbindlichen Stufen; welche das sind, steht in `support/axe.ts`.
 */
const ROUTEN = [
  { pfad: "/#/login", name: "Anmelden" },
  { pfad: "/#/registrieren", name: "Registrieren" },
  { pfad: "/#/passwort-vergessen", name: "Passwort vergessen" },
];

const THEMES = ["light", "dark"] as const;

for (const theme of THEMES) {
  for (const route of ROUTEN) {
    test(`${route.name} ist frei von axe-Verstoessen (${theme})`, async ({ page }) => {
      await stelleThemeEin(page, theme);
      await page.goto(route.pfad);
      await expect(page.getByRole("heading", { name: route.name })).toBeVisible();
      await erwarteTheme(page, theme);

      await pruefeAxe(page, `${route.name} (${theme})`);
    });
  }
}
