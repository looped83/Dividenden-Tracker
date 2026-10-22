import { readFile } from "node:fs/promises";
import { expect, test } from "../support/appTest";

/**
 * Datenexport als CSV und Excel.
 *
 * Geprüft wird die **heruntergeladene Datei**, nicht die Erfolgsmeldung. Der
 * Excel-Zweig las seine Werte lange über `payment[feld]` und kannte damit die
 * verbundenen Tabellen nicht: Beträge standen in der Datei, Unternehmen und
 * Depot blieben in jeder Zeile leer. Die Meldung „Export erstellt" kam
 * trotzdem.
 */
test.use({
  seed: {
    payments: [
      { payDate: "2026-01-15", netAmount: "10.00" },
      { payDate: "2026-04-15", netAmount: "20.50" },
    ],
  },
});

async function exportiere(page: import("@playwright/test").Page, format: string) {
  await page.goto("/#/einstellungen/datensicherung");
  await expect(page.getByRole("heading", { name: "Daten exportieren" })).toBeVisible();
  await page.getByLabel("Format").selectOption(format);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export herunterladen" }).click();
  const datei = await download;
  const pfad = await datei.path();
  return { datei, pfad };
}

test("CSV enthält Asset, Depot und Betrag je Zeile", async ({ page, konto }) => {
  const { datei, pfad } = await exportiere(page, "csv");
  expect(datei.suggestedFilename()).toMatch(/^dividenden-export-\d{4}-\d{2}-\d{2}\.csv$/);

  const inhalt = await readFile(pfad, "utf8");
  const zeilen = inhalt
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\r\n");

  expect(zeilen[0]).toContain("Asset");
  expect(zeilen).toHaveLength(3);
  for (const zeile of zeilen.slice(1)) {
    expect(zeile).toContain(konto.securityName);
    expect(zeile).toContain(konto.depotName);
  }
  expect(inhalt).toContain("20.50");
});

test("XLSX enthält dieselben Angaben als echte Zellen", async ({ page, konto }) => {
  const { datei, pfad } = await exportiere(page, "xlsx");
  expect(datei.suggestedFilename()).toMatch(
    /^dividenden-export-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  // Ohne Excel-Bibliothek: Das Blatt ist XML in einem ZIP. Zellen und
  // Rundlauf prueft der Unit-Test des Lesers (tests/unit/lib/xlsx).
  const { readFileSync } = await import("node:fs");
  const { strFromU8, unzipSync } = await import("fflate");
  const dateien = unzipSync(readFileSync(pfad));
  const blatt = dateien["xl/worksheets/sheet1.xml"];
  if (!blatt) throw new Error("Die Arbeitsmappe hat kein Blatt.");
  const xml = strFromU8(blatt);

  // Kopfzeile plus zwei Eingänge.
  expect(xml.match(/<row /g)).toHaveLength(3);
  expect(xml).toContain('<t xml:space="preserve">Asset</t>');
  expect(xml).toContain(konto.securityName);
  expect(xml).toContain(konto.depotName);
  // Zahl, nicht Text: Nur so lässt sich in Excel damit rechnen.
  expect(xml).toContain("<v>20.5</v>");
});
