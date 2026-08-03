import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Gemeinsame axe-Prüfung für die öffentlichen und die angemeldeten Routen
 * (TEST_STRATEGY.md §9). Eine Stelle für die geprüften Stufen und für die
 * Auswertung — sonst liefen die beiden Prüfungen mit der Zeit auseinander.
 */

/**
 * Geprüft werden die verbindlichen Stufen. `wcag22aa` steht in axe-core 4.12
 * für genau eine Regel — `target-size` (2.5.8, Mindestgröße von
 * Bedienelementen); sie ist der Grund, warum der iPhone-Durchlauf mehr ist als
 * eine Wiederholung des Desktop-Durchlaufs.
 */
const STUFEN = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Misst die aktuell dargestellte Seite. Ein Fund nennt Kontext, Regel,
 * Beschreibung und betroffenes Element — genug, um ihn ohne Nachstellen zu
 * verstehen.
 */
export async function pruefeAxe(page: Page, kontext: string): Promise<void> {
  const ergebnis = await new AxeBuilder({ page }).withTags(STUFEN).analyze();

  expect(
    ergebnis.violations.map((verstoss) => ({
      kontext,
      regel: verstoss.id,
      beschreibung: verstoss.help,
      elemente: verstoss.nodes.map((knoten) => knoten.target.join(" ")),
    })),
  ).toEqual([]);
}

/**
 * Das Theme wird **vor** dem Laden gesetzt, nie im laufenden Bild umgeschaltet.
 *
 * Ein nachträgliches `emulateMedia` wäre schneller — es spart je Route einen
 * Seitenaufbau —, liefert aber nicht denselben Zustand: In WebKit meldete axe
 * danach reproduzierbar Kontrastfehler auf Überschriften, Beschriftungen und
 * Eingabefeldern, die bei einem frischen Dunkel-Start nicht auftreten. Ein
 * nachträglich geändertes `color-scheme` löst dort offenbar nicht alle Farben
 * neu auf; Warten hilft nicht, weil bereits der Endzustand ein anderer ist.
 *
 * Deshalb: Theme setzen, dann laden. So misst der Test die Lage, die auch im
 * Betrieb gilt — und es gibt keinen Farbübergang, gegen den die Messung
 * abgesichert werden müsste.
 *
 * **Bewusst ohne `reducedMotion`.** Es war die Absicherung für den
 * Umschaltweg und wurde mit ihm überflüssig. Beibehalten schadete sogar: In
 * WebKit meldete axe damit auf der Anmeldeseite in Dunkel reproduzierbar
 * Kontrastfehler auf `p` und `span`, die ohne die Emulation nicht auftreten.
 * Was die Anwendung unter reduzierter Bewegung darstellt, gehört eigenständig
 * geprüft (TEST_STRATEGY.md §9, manuelle Liste) — nicht als Nebenwirkung einer
 * Messvorbereitung.
 */
export async function stelleThemeEin(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}

/**
 * Belegt, dass das gewünschte Theme wirklich anliegt. Ohne diese Zusicherung
 * prüfte ein nicht greifender Themewechsel unbemerkt zweimal dasselbe Bild —
 * ein Test, der bestätigt, was er nie gemessen hat.
 */
export async function erwarteTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  const wurzel = page.locator("html");
  if (theme === "dark") await expect(wurzel).toHaveClass(/\bdark\b/);
  else await expect(wurzel).not.toHaveClass(/\bdark\b/);
}
