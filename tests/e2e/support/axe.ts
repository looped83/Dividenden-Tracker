import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Gemeinsame axe-Prüfung für die öffentlichen und die angemeldeten Routen
 * (TEST_STRATEGY.md §9). Eine Stelle für die geprüften Stufen und für den
 * Themewechsel — sonst liefen die beiden Prüfungen mit der Zeit auseinander.
 */

/**
 * Geprüft werden die verbindlichen Stufen. `wcag22aa` steht in axe-core 4.12
 * für genau eine Regel — `target-size` (2.5.8, Mindestgröße von
 * Bedienelementen); sie ist der Grund, warum der iPhone-Durchlauf mehr ist als
 * eine Wiederholung des Desktop-Durchlaufs.
 */
const STUFEN = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Misst die aktuell dargestellte Seite. Ein Fund nennt Regel und Element. */
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

function hintergrundfarbe(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
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
 * **Der Umschaltpunkt ist die heikle Stelle.** axe liest berechnete Farben im
 * Moment der Prüfung. Wird zu früh gemessen, misst es den alten oder einen
 * halb umgestellten Zustand und meldet Kontrastfehler, die es nicht gibt —
 * beobachtet in WebKit, wo sich die Fundliste zwischen Versuch und
 * Wiederholung unterschied. Deshalb wird nicht auf die Klasse allein gewartet,
 * sondern auf die **tatsächlich berechnete Hintergrundfarbe**: Sie ändert sich
 * erst, wenn die Stilberechnung durch ist. Danach noch ein Einzelbild, damit
 * auch Motoren fertig sind, die verzögert zeichnen.
 *
 * Die Zusicherung auf die Klasse `dark` bleibt daneben stehen: Ohne sie würde
 * ein nicht greifender Themewechsel unbemerkt zweimal dasselbe helle Bild
 * prüfen — ein Test, der bestätigt, was er nie gemessen hat.
 */
export async function pruefeBeideThemes(page: Page, name: string): Promise<void> {
  const wurzel = page.locator("html");

  await expect(wurzel).not.toHaveClass(/\bdark\b/);
  const hell = await hintergrundfarbe(page);
  await pruefeAxe(page, `${name} (hell)`);

  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(wurzel).toHaveClass(/\bdark\b/);
  await expect.poll(() => hintergrundfarbe(page)).not.toBe(hell);
  await naechstesBild(page);

  await pruefeAxe(page, `${name} (dunkel)`);
}

function naechstesBild(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((fertig) => {
        requestAnimationFrame(() => {
          fertig();
        });
      }),
  );
}
