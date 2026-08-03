import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../support/appTest";

/**
 * Barrierefreiheit **hinter** der Anmeldung (TEST_STRATEGY.md §9,
 * docs/AUDIT_2026-07-29.md §4.1).
 *
 * Bis hierher endete jede automatisierte Prüfung an der Anmeldemaske. Geprüft
 * werden deshalb nicht nur die Routen, sondern gerade die Zustände, in denen
 * Barrierefreiheit erfahrungsgemäß bricht: geöffneter Dialog, gesetzte Filter,
 * eingeblendete Rückmeldung, Leer- und Fehlerzustand.
 *
 * axe deckt nur einen Teil ab; die Checkliste für Tastatur, Screenreader und
 * Zoom bleibt daneben bestehen. Gemessen werden die verbindlichen Stufen A
 * und AA.
 */
test.use({
  seed: {
    payments: [
      { payDate: "2026-01-15", netAmount: "10.00" },
      { payDate: "2026-04-15", netAmount: "20.00" },
    ],
  },
});

type Page = import("@playwright/test").Page;

async function pruefe(page: Page, kontext: string) {
  const ergebnis = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    ergebnis.violations.map((v) => ({
      kontext,
      regel: v.id,
      beschreibung: v.help,
      elemente: v.nodes.map((n) => n.target.join(" ")),
    })),
  ).toEqual([]);
}

/**
 * Prüft dieselbe, bereits geladene Seite in hell **und** dunkel.
 *
 * Beide Themes brauchen eine eigene Messung — die Farbtoken stammen je Theme
 * aus eigenen Werten, und Kontrast ist genau das, was dabei bricht. Sie
 * brauchen aber **keinen zweiten Seitenaufbau**: Der `ThemeProvider` liest die
 * Systemvorliebe über `useSyncExternalStore` mit einem Listener auf der
 * Medienabfrage, `emulateMedia` schaltet also im laufenden Bild um. Das spart
 * je Route ein Testkonto, einen Browserkontext und einen Seitenaufbau, ohne
 * eine einzige Prüfung aufzugeben.
 *
 * Die Zusicherung auf die Klasse `dark` ist dabei kein Beiwerk, sondern der
 * Kern: Ohne sie würde ein nicht greifender Themewechsel unbemerkt zweimal
 * dasselbe helle Bild prüfen — ein Test, der bestätigt, was er nie gemessen
 * hat.
 *
 * Vorausgesetzt wird `reducedMotion: "reduce"` (im Test gesetzt): Flächen und
 * Rahmen wechseln ihre Farbe über `transition-colors`, und axe misst die Farbe
 * im Moment der Prüfung. Mitten im Übergang misst es eine Zwischenfarbe und
 * meldet einen Kontrastfehler, den es 150 ms später nicht mehr gibt. Statt
 * einer Wartezeit nutzt der Test die Vorkehrung der Anwendung selbst: Bei
 * reduzierter Bewegung schaltet `styles/index.css` die Übergänge ab. Gemessen
 * wird derselbe Endzustand, nur ohne Zwischenbilder.
 */
async function pruefeBeideThemes(page: Page, name: string) {
  const wurzel = page.locator("html");

  await expect(wurzel).not.toHaveClass(/\bdark\b/);
  await pruefe(page, `${name} (hell)`);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(wurzel).toHaveClass(/\bdark\b/);
  await pruefe(page, `${name} (dunkel)`);
}

const ROUTEN = [
  { pfad: "/#/", name: "Übersicht", warten: "Übersicht" },
  { pfad: "/#/eingaenge", name: "Dividenden", warten: "Dividenden" },
  { pfad: "/#/eingaenge/neu", name: "Neue Dividende", warten: "Neue Dividende" },
  { pfad: "/#/eingaenge/datenqualitaet", name: "Datenqualität", warten: "Datenqualität" },
  { pfad: "/#/kalender", name: "Kalender", warten: "Dividendenkalender" },
  { pfad: "/#/unternehmen", name: "Unternehmen", warten: "Unternehmen" },
  { pfad: "/#/statistiken", name: "Statistiken", warten: "Statistik" },
  { pfad: "/#/statistiken/jahre", name: "Statistik Jahre", warten: "Statistik" },
  { pfad: "/#/statistiken/breakdown", name: "Statistik Breakdown", warten: "Statistik" },
  { pfad: "/#/statistiken/vergleich", name: "Statistik Vergleich", warten: "Statistik" },
  { pfad: "/#/ziele", name: "Ziele", warten: "Ziele" },
  { pfad: "/#/ziele/beendet", name: "Ziele beendet", warten: "Ziele" },
  { pfad: "/#/einstellungen", name: "Einstellungen", warten: "Einstellungen" },
  { pfad: "/#/einstellungen/depots", name: "Depots", warten: "Einstellungen" },
  { pfad: "/#/einstellungen/importe", name: "Importe", warten: "Einstellungen" },
  {
    pfad: "/#/einstellungen/datensicherung",
    name: "Datensicherung",
    warten: "Einstellungen",
  },
] as const;

for (const route of ROUTEN) {
  test(`${route.name} ist frei von axe-Verstößen`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(route.pfad);
    await expect(
      page.getByRole("heading", { name: route.warten, level: 1 }).first(),
    ).toBeVisible();
    await pruefeBeideThemes(page, route.name);
  });
}

test("geöffneter Storno-Dialog ist frei von axe-Verstößen", async ({ page, konto }) => {
  await page.goto(`/#/eingaenge/${konto.paymentIds[0] ?? ""}`);
  await page.getByRole("button", { name: "Stornieren", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await pruefe(page, "Storno-Dialog");
});

test("gesetzte Filter sind frei von axe-Verstößen", async ({ page, konto }) => {
  await page.goto(`/#/eingaenge?year=2026&month=1&security=${konto.securityId}`);
  await expect(page.getByRole("heading", { name: "Dividenden", level: 1 })).toBeVisible();
  // Erst prüfen, dass die Filter wirklich greifen — sonst liefe die
  // axe-Prüfung auf einer ungefilterten Liste und behauptete etwas, das sie
  // nicht gemessen hat. Die Werte stehen in den Feldern der Filterleiste, das
  // Ergebnis in der Zeile darunter.
  await expect(page.getByLabel("Jahr")).toHaveValue("2026");
  await expect(page.getByLabel("Monat")).toHaveValue("1");
  // `#f-security`: „Unternehmen" heisst auch der Navigationspunkt daneben.
  await expect(page.locator("#f-security")).toHaveValue(konto.securityId);
  await expect(page.getByText("1 Eingang gefunden.")).toBeVisible();
  await pruefe(page, "Eingangsliste mit Filtern");
});

test("eingeblendete Rückmeldung ist frei von axe-Verstößen", async ({ page, konto }) => {
  await page.goto(`/#/eingaenge/${konto.paymentIds[0] ?? ""}/bearbeiten`);
  await page.getByLabel("Nettobetrag").fill("11,11");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Dividende gespeichert.")).toBeVisible();
  await pruefe(page, "Toast");
});

test("Fehlerzustand ist frei von axe-Verstößen", async ({ page }) => {
  // Eine fremde/unbekannte Id: die Seite meldet „nicht gefunden".
  await page.goto("/#/eingaenge/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("Dividendeneingang nicht gefunden")).toBeVisible();
  await pruefe(page, "Nicht gefunden");
});
