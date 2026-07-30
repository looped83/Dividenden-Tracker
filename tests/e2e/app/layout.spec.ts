import { expect, test } from "../support/appTest";

/**
 * Seitenbreite hinter der Anmeldung.
 *
 * Was breiter ist als das Fenster, scrollt innerhalb seines eigenen Rahmens —
 * die Seite selbst nicht (dieselbe Zusage wie in `tests/e2e/mobile.spec.ts`,
 * dort für die öffentlichen Routen). Der Breakdown ist der Härtefall: eine
 * Matrix mit einer Spalte je Jahr wird zwangsläufig breiter als der Inhalt.
 *
 * Diese Prüfung geht nur im Browser: Der Überlauf entstand nicht durch die
 * sichtbare Tabelle, sondern durch die absolut positionierten `sr-only`-Texte
 * darin. Ohne positionierten Vorfahren beziehen sie sich auf das Dokument, der
 * seitliche Bildlauf des Kastens klammert sie dann nicht ein — und die Seite
 * ließ sich bis zur rechten Tabellenkante schieben, obwohl dort nichts
 * Sichtbares stand. In jsdom hat nichts davon eine Breite.
 */

/** Neun abgeschlossene Jahre — genug Spalten, dass die Matrix überläuft. */
const JAHRE = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

test.use({
  seed: {
    payments: JAHRE.flatMap((jahr) => [
      { payDate: `${String(jahr)}-03-10`, netAmount: "1234.56" },
      { payDate: `${String(jahr)}-11-20`, netAmount: "2345.67" },
    ]),
  },
});

test("Breakdown: die Seite läuft nicht seitlich über", async ({ page }) => {
  await page.goto("/#/statistiken/breakdown");
  await expect(page.getByRole("table")).toBeVisible();

  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(ueberlauf).toBeLessThanOrEqual(0);

  // Die Matrix selbst scrollt sehr wohl — sonst wäre der Test auch dann grün,
  // wenn die Spalten gar nicht erst über den Rand hinausreichten.
  const kasten = await page.evaluate(() => {
    const element = document.querySelector("table")?.parentElement;
    return element ? element.scrollWidth - element.clientWidth : 0;
  });
  expect(kasten).toBeGreaterThan(0);
});
