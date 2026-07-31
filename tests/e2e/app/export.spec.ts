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

test("CSV enthält Unternehmen, Depot und Betrag je Zeile", async ({ page, konto }) => {
  const { datei, pfad } = await exportiere(page, "csv");
  expect(datei.suggestedFilename()).toMatch(/^dividenden-export-\d{4}-\d{2}-\d{2}\.csv$/);

  const inhalt = await readFile(pfad, "utf8");
  const zeilen = inhalt
    .replace(/^\uFEFF/, "")
    .trim()
    .split("\r\n");

  expect(zeilen[0]).toContain("Unternehmen");
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

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(pfad);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Die Arbeitsmappe hat kein Blatt.");

  const kopf = sheet.getRow(1).values as unknown[];
  const spalte = (name: string) => kopf.indexOf(name);
  expect(spalte("Unternehmen")).toBeGreaterThan(0);

  // Kopfzeile plus zwei Eingänge.
  expect(sheet.rowCount).toBe(3);

  const zeile = sheet.getRow(2);
  expect(zeile.getCell(spalte("Unternehmen")).value).toBe(konto.securityName);
  expect(zeile.getCell(spalte("Depot")).value).toBe(konto.depotName);
  // Zahl, nicht Text: Nur so lässt sich in Excel damit rechnen.
  expect(zeile.getCell(spalte("Nettobetrag")).value).toBe(20.5);
  expect(zeile.getCell(spalte("Zahlungsdatum")).value).toBeInstanceOf(Date);
});
