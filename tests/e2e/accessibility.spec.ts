import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automatisierte Barrierefreiheitspruefung (TEST_STRATEGY.md §9) auf den
 * Routen, die ohne Konto erreichbar sind — in beiden Themes, weil Kontraste
 * je Theme aus eigenen Tokens stammen.
 *
 * axe findet nur einen Teil der Probleme; die Checkliste fuer Tastatur,
 * Screenreader und Zoom bleibt daneben bestehen. Geprueft werden die
 * verbindlichen Stufen A und AA.
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
      // Das Theme haengt an der Klasse `dark` am Wurzelelement; die
      // Systemvorliebe wird vor dem Laden gesetzt, damit der ThemeProvider sie
      // uebernimmt.
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(route.pfad);
      await expect(page.getByRole("heading", { name: route.name })).toBeVisible();

      const ergebnis = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      // Bei einem Fund steht die Regel samt betroffenem Element im Bericht.
      expect(
        ergebnis.violations.map((v) => ({
          regel: v.id,
          beschreibung: v.help,
          elemente: v.nodes.map((n) => n.target.join(" ")),
        })),
      ).toEqual([]);
    });
  }
}
