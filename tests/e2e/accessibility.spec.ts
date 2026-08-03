import { expect, test } from "@playwright/test";
import { pruefeBeideThemes } from "./support/axe";

/**
 * Automatisierte Barrierefreiheitspruefung (TEST_STRATEGY.md §9) auf den
 * Routen, die ohne Konto erreichbar sind — in beiden Themes, weil Kontraste
 * je Theme aus eigenen Tokens stammen. Gemessen wird beides auf **einem**
 * Seitenaufbau; die Einzelheiten dazu stehen in `support/axe.ts`.
 *
 * axe findet nur einen Teil der Probleme; die Checkliste fuer Tastatur,
 * Screenreader und Zoom bleibt daneben bestehen.
 */
const ROUTEN = [
  { pfad: "/#/login", name: "Anmelden" },
  { pfad: "/#/registrieren", name: "Registrieren" },
  { pfad: "/#/passwort-vergessen", name: "Passwort vergessen" },
];

for (const route of ROUTEN) {
  test(`${route.name} ist frei von axe-Verstoessen`, async ({ page }) => {
    // Das Theme haengt an der Klasse `dark` am Wurzelelement; die
    // Systemvorliebe wird vor dem Laden gesetzt, damit der ThemeProvider sie
    // uebernimmt. `reducedMotion` schaltet ueber styles/index.css die
    // Farbuebergaenge ab — sonst maesse axe beim Wechsel eine Zwischenfarbe.
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(route.pfad);
    await expect(page.getByRole("heading", { name: route.name })).toBeVisible();

    await pruefeBeideThemes(page, route.name);
  });
}
