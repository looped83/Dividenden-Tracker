import { expect, test } from "../support/appTest";

/**
 * Seitenbreite hinter der Anmeldung.
 *
 * Was breiter ist als das Fenster, scrollt innerhalb seines eigenen Rahmens —
 * die Seite selbst nicht (dieselbe Zusage wie in `tests/e2e/mobile.spec.ts`,
 * dort für die öffentlichen Routen). Der Breakdown ist der Härtefall: zwölf
 * Monatsspalten mit Beträgen werden breiter als jeder Inhaltsbereich.
 *
 * Diese Prüfung geht nur im Browser: Der Überlauf entstand nicht durch die
 * sichtbare Tabelle, sondern durch die absolut positionierten `sr-only`-Texte
 * darin. Ohne positionierten Vorfahren beziehen sie sich auf das Dokument, der
 * seitliche Bildlauf des Kastens klammert sie dann nicht ein — und die Seite
 * ließ sich bis zur rechten Tabellenkante schieben, obwohl dort nichts
 * Sichtbares stand. In jsdom hat nichts davon eine Breite.
 */

/** Drei volle Jahre: jeder der zwölf Monate trägt einen Betrag. */
const JAHRE = [2016, 2017, 2018];
const MONATE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

test.use({
  seed: {
    payments: JAHRE.flatMap((jahr) =>
      MONATE.map((monat) => ({
        payDate: `${String(jahr)}-${String(monat).padStart(2, "0")}-10`,
        // Fünfstellig: So ist jede Spalte breit genug, dass die Matrix den
        // Inhaltsbereich sicher überschreitet — unabhängig von der Schriftart
        // des Testrechners.
        netAmount: "12345.67",
      })),
    ),
  },
});

test("Breakdown: die Seite läuft nicht seitlich über", async ({ page }) => {
  // Feste, schmale Fenstergröße statt der Vorgabe des jeweiligen Projekts:
  // Die Prüfung soll am selben Verhältnis von Tabelle zu Inhaltsbereich
  // hängen, nicht an der Geometrie eines Geräts.
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/#/statistiken/breakdown");
  await expect(page.getByRole("table")).toBeVisible();

  // Die Matrix scrollt sehr wohl — sonst wäre die eigentliche Prüfung darunter
  // auch dann grün, wenn die Spalten gar nicht erst über den Rand hinausreichten.
  const kasten = await page.evaluate(() => {
    const element = document.querySelector("table")?.parentElement;
    return element ? element.scrollWidth - element.clientWidth : 0;
  });
  expect(kasten).toBeGreaterThan(0);

  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(ueberlauf).toBeLessThanOrEqual(0);
});
