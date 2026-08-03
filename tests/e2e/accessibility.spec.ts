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

async function pruefe(page: import("@playwright/test").Page, kontext: string) {
  const ergebnis = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  // Bei einem Fund steht die Regel samt betroffenem Element im Bericht.
  expect(
    ergebnis.violations.map((v) => ({
      kontext,
      regel: v.id,
      beschreibung: v.help,
      elemente: v.nodes.map((n) => n.target.join(" ")),
    })),
  ).toEqual([]);
}

for (const route of ROUTEN) {
  test(`${route.name} ist frei von axe-Verstoessen`, async ({ page }) => {
    // Das Theme haengt an der Klasse `dark` am Wurzelelement. Beide Themes
    // werden gemessen — die Kontraste stammen je Theme aus eigenen Tokens —,
    // aber auf **einem** Seitenaufbau: Der ThemeProvider haengt an der
    // Medienabfrage und schaltet im laufenden Bild um. Die Zusicherung auf die
    // Klasse `dark` belegt, dass der Wechsel wirklich gegriffen hat.
    //
    // `reducedMotion` ist dabei Voraussetzung, kein Beiwerk: Flaechen wechseln
    // ihre Farbe ueber `transition-colors`, und axe wuerde mitten im Uebergang
    // eine Zwischenfarbe messen. Bei reduzierter Bewegung schaltet
    // `styles/index.css` die Uebergaenge ab — gemessen wird derselbe
    // Endzustand, nur ohne Zwischenbilder.
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(route.pfad);
    await expect(page.getByRole("heading", { name: route.name })).toBeVisible();

    const wurzel = page.locator("html");
    await expect(wurzel).not.toHaveClass(/\bdark\b/);
    await pruefe(page, `${route.name} (hell)`);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(wurzel).toHaveClass(/\bdark\b/);
    await pruefe(page, `${route.name} (dunkel)`);
  });
}
