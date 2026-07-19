import type { WorksheetTable } from "@/lib/xlsx/parseWorkbook";
import { ISIN_PATTERN, TICKER_PATTERN, WKN_PATTERN } from "@/features/securities/schemas";
import type { DataQuality } from "@/lib/supabase/database.types";

export interface ImportedSecurityRow {
  name: string;
  ticker: string | null;
  isin: string | null;
  wkn: string | null;
  country: string | null;
  dataQuality: DataQuality;
  warnings: string[];
  /** 1-indizierte Zeilennummer in der Originaldatei (Kopfzeile = 1) fuer Rueckmeldungen. */
  sourceRow: number;
}

export interface InvalidSecurityRow {
  sourceRow: number;
  reason: string;
}

export interface MappedSecurities {
  valid: ImportedSecurityRow[];
  invalid: InvalidSecurityRow[];
}

/** Erkannte Spaltennamen (klein geschrieben) je Zielfeld — robust gegen Reihenfolge/Groß-Kleinschreibung. */
const HEADER_ALIASES: Record<"name" | "ticker" | "isin" | "wkn", string[]> = {
  name: ["name"],
  ticker: ["symbol", "ticker"],
  isin: ["isin"],
  wkn: ["wkn"],
};

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

function isRowBlank(row: (string | number | null)[]): boolean {
  return row.every((cell) => cell === null || String(cell).trim() === "");
}

function cellToTrimmedString(
  row: (string | number | null)[],
  index: number,
): string | null {
  if (index === -1) return null;
  const value = row[index];
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Bildet eine eingelesene Tabelle (z. B. aus einer Depot-Exportdatei) auf
 * Unternehmens-Stammdaten ab. Nur Name/Ticker/ISIN/WKN werden uebernommen —
 * andere Spalten (Stückzahl, Kurse, Kategorie, …) gehören fachlich nicht zu
 * den Unternehmens-Stammdaten (DATA_MODEL.md §3.4) und werden ignoriert.
 * Das Land wird aus den ersten zwei Zeichen einer gueltigen ISIN abgeleitet
 * (ISO-3166-Praefix der ISIN-Norm).
 */
export function mapWorksheetToSecurities(table: WorksheetTable): MappedSecurities {
  const nameIdx = findColumnIndex(table.headers, HEADER_ALIASES.name);
  const tickerIdx = findColumnIndex(table.headers, HEADER_ALIASES.ticker);
  const isinIdx = findColumnIndex(table.headers, HEADER_ALIASES.isin);
  const wknIdx = findColumnIndex(table.headers, HEADER_ALIASES.wkn);

  if (nameIdx === -1) {
    throw new Error('Spalte "Name" wurde in der Datei nicht gefunden.');
  }

  const valid: ImportedSecurityRow[] = [];
  const invalid: InvalidSecurityRow[] = [];

  table.rows.forEach((row, index) => {
    // Kopfzeile ist Zeile 1, erste Datenzeile daher Zeile 2.
    const sourceRow = index + 2;
    if (isRowBlank(row)) return; // z. B. Summenzeile am Tabellenende

    const name = cellToTrimmedString(row, nameIdx);
    if (!name) {
      invalid.push({ sourceRow, reason: "Name fehlt" });
      return;
    }

    const warnings: string[] = [];
    let dataQuality: DataQuality = "ok";

    let ticker = cellToTrimmedString(row, tickerIdx);
    if (ticker && !TICKER_PATTERN.test(ticker)) {
      warnings.push(`Ticker „${ticker}" ungültig, wird nicht übernommen`);
      ticker = null;
      dataQuality = "needs_review";
    }

    let isin = cellToTrimmedString(row, isinIdx)?.toUpperCase() ?? null;
    if (isin && !ISIN_PATTERN.test(isin)) {
      warnings.push(`ISIN „${isin}" ungültig, wird nicht übernommen`);
      isin = null;
      dataQuality = "needs_review";
    }

    let wkn = cellToTrimmedString(row, wknIdx)?.toUpperCase() ?? null;
    if (wkn && !WKN_PATTERN.test(wkn)) {
      warnings.push(`WKN „${wkn}" ungültig, wird nicht übernommen`);
      wkn = null;
      dataQuality = "needs_review";
    }

    const country = isin ? isin.slice(0, 2) : null;

    if (dataQuality === "ok" && !ticker && !isin) {
      dataQuality = "incomplete";
    }

    valid.push({ name, ticker, isin, wkn, country, dataQuality, warnings, sourceRow });
  });

  return { valid, invalid };
}
