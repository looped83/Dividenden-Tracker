import { fileURLToPath } from "node:url";
import { expect, test } from "../support/appTest";

/**
 * Seitenbreite hinter der Anmeldung.
 *
 * Was breiter ist als das Fenster, scrollt innerhalb seines eigenen Rahmens —
 * die Seite selbst nicht (dieselbe Zusage wie in `tests/e2e/mobile.spec.ts`,
 * dort für die öffentlichen Routen). Die Matrix aus Jahren und Monaten in der
 * Statistik-Übersicht ist der Härtefall: zwölf Monatsspalten mit Beträgen
 * werden breiter als jeder Inhaltsbereich. Auf dem Telefon steht sie gedreht
 * (Monate als Zeilen) — auch dort darf die Seite nicht seitlich laufen.
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

test("Matrix: die Seite läuft nicht seitlich über", async ({ page }) => {
  // Feste, schmale Fenstergröße statt der Vorgabe des jeweiligen Projekts:
  // Die Prüfung soll am selben Verhältnis von Tabelle zu Inhaltsbereich
  // hängen, nicht an der Geometrie eines Geräts.
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/#/statistiken");
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

test("Matrix auf dem Telefon: gedreht, ohne seitlichen Überlauf der Seite", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/statistiken");
  const tabelle = page.getByRole("table");
  await expect(tabelle).toBeVisible();
  // Monate als Zeilen: Der Dezember steht als Zeilenkopf da.
  await expect(tabelle.getByRole("rowheader", { name: "Dezember" })).toBeVisible();

  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(ueberlauf).toBeLessThanOrEqual(0);
});

/**
 * Dialoge auf dem Telefon. Zwei Fehler, die nur im Browser sichtbar werden:
 *
 * 1. Das Panel ist ein Grid; seine Spalte wuchs bis zur Mindestbreite des
 *    Inhalts. Die Vorschautabelle des Depotstands zog es so auf rund 530px —
 *    Text lief rechts aus dem Bild, man musste seitlich scrollen.
 * 2. Die klebende Fußzeile stand um den unteren Innenabstand des Panels über
 *    dessen Rand; darunter lief der Inhalt durchs Bild.
 */
test("Depotstand-Vorschau auf dem Telefon: so breit wie der Bildschirm, Fußzeile am Rand", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/#/depot");
  await page.getByRole("button", { name: "Depotstand importieren" }).click();
  await page.setInputFiles(
    'input[type="file"]',
    fileURLToPath(
      new URL("../fixtures/divvydiaryportfolio1785790381565.csv", import.meta.url),
    ),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("table")).toBeVisible();

  // Die Hauptaktion steht in der Fußzeile; ihr Elternelement ist die Fußzeile.
  const aktion = dialog.getByRole("button", { name: /Positionen übernehmen/ });
  const masse = await aktion.evaluate((button) => {
    const panel = button.closest('[role="dialog"]');
    const footer = button.parentElement;
    if (!panel || !footer) throw new Error("Dialog oder Fußzeile fehlt.");
    return {
      ueberlauf: panel.scrollWidth - panel.clientWidth,
      breite: panel.getBoundingClientRect().width,
      // Die Prüfung der Fußzeile braucht Inhalt unter ihr — sonst stünde sie
      // auch mit dem alten Fehler am Rand.
      scrollt: panel.scrollHeight > panel.clientHeight,
      abstandUnten:
        panel.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom,
    };
  });

  expect(masse.ueberlauf).toBeLessThanOrEqual(0);
  expect(masse.breite).toBeLessThanOrEqual(360);
  expect(masse.scrollt).toBe(true);
  // Höchstens der Rahmen des Panels (1px) liegt unter der Fußzeile.
  expect(masse.abstandUnten).toBeLessThanOrEqual(1.5);
});
