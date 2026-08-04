/**
 * Einlesen des DivvyDiary-Portfolio-Exports (docs/PORTFOLIO_IMPORT.md).
 *
 * Die Datei ist ein **Depotauszug zu einem Stichtag**: je Zeile eine Position
 * oder ein Beobachtungswert, mit Kurs, Marktwert und erwarteten Ausschuettungen.
 * Sie enthaelt keine erhaltenen Zahlungen — daraus entsteht deshalb nie ein
 * Dividendeneingang (PRODUCT_SPEC.md Grundsatz 8).
 *
 * Vier Eigenheiten der Quelle bestimmen diesen Code:
 *
 * 1. **`currency` ist nicht die Waehrung des Wertpapiers**, sondern die des
 *    Depots (im Export durchgaengig EUR). Die uebliche Ausschuettungswaehrung
 *    steht in `originalDividendCurrency` — nur sie passt zu
 *    `securities.currency` (DATA_DICTIONARY.md §3.4).
 * 2. **`country` und `sector` enthalten `"mixed"`** bei Fonds und ETFs. Das ist
 *    kein Land und keine Branche; `securities.country` ist `char(2)` und wiese
 *    den Wert ohnehin ab. Solche Angaben werden verworfen, nicht verbogen.
 * 3. **Leer ist nicht null.** Bei Zeilen ohne Bestand laesst die Quelle `gain`
 *    und `gainRel` leer, weil es keinen Gewinn zu berechnen gibt. Eine 0 stuende
 *    dort als Aussage, wo die Quelle bewusst schweigt.
 * 4. **Der Stichtag steht nicht in der Datei**, nur im Dateinamen
 *    (`divvydiaryportfolio<ms>.csv`). Er wird daraus gelesen und im Assistenten
 *    zur Bestaetigung vorgelegt — geraten wird er nie.
 *
 * Gerechnet wird hier nichts: Jede Zahl wird ueber `parseAmount` in einen
 * kanonischen Dezimalstring ueberfuehrt und erst in der App ueber `lib/money`
 * (Decimal) verrechnet, nie als Fliesskommazahl (CALCULATION_RULES.md §8).
 */
import { parseCsv } from "@/lib/import/parseCsv";
import { parseAmount } from "@/lib/import/parseAmount";
import { MoneyDecimal } from "@/lib/money";
import { ISIN_PATTERN, TICKER_PATTERN, WKN_PATTERN } from "@/features/securities/schemas";
import type { DividendFrequency, SecurityAssetType } from "@/lib/supabase/database.types";

/** Spalten, ohne die die Datei nicht verwertbar ist. */
const REQUIRED_HEADERS = ["isin", "name", "quantity"] as const;

/**
 * Ausschuettungsrhythmus der Quelle. Unbekannte Werte werden zu `irregular`
 * statt zu `null`: Die Quelle hat etwas gesagt, wir verstehen es nur nicht —
 * das ist ein anderer Zustand als „keine Angabe".
 */
const FREQUENCY_BY_SOURCE: Readonly<Record<string, DividendFrequency>> = {
  none: "none",
  monthly: "monthly",
  quarterly: "quarterly",
  biannually: "biannually",
  semiannually: "biannually",
  annually: "annually",
  yearly: "annually",
  irregular: "irregular",
};

const ASSET_TYPE_BY_SOURCE: Readonly<Record<string, SecurityAssetType>> = {
  equity: "equity",
  etf: "etf",
  fund: "fund",
  crypto: "crypto",
};

/**
 * Werte, die eine fehlende Angabe ausdruecken. `"mixed"` gehoert dazu: Es ist
 * die Antwort der Quelle fuer Fonds, die ueber Laender und Branchen streuen —
 * eine ehrliche Auskunft, aber keine, die in ein Stammdatenfeld gehoert.
 */
const PLACEHOLDER_VALUES = new Set(["", "-", "—", "n/a", "na", "null", "mixed"]);

/** Eine eingelesene Zeile mit Bestand. Alle Zahlen als kanonische Dezimalstrings. */
export interface DivvyDiaryPosition {
  /** 1-indizierte Zeile in der Datei (Kopfzeile = 1) fuer Rueckmeldungen. */
  sourceRow: number;

  // --- Identitaet ---
  name: string;
  ticker: string | null;
  isin: string;
  wkn: string | null;

  // --- Stammdaten-Kandidaten (Ziel: securities) ---
  country: string | null;
  sector: string | null;
  /** Uebliche Ausschuettungswaehrung — `originalDividendCurrency`, nicht `currency`. */
  dividendCurrency: string | null;

  // --- Stichtagsdaten (Ziel: security_snapshots) ---
  quantity: string;
  buyinPerShare: string | null;
  buyinTotal: string | null;
  price: string | null;
  marketValue: string | null;
  gainAbsolute: string | null;
  gainRelative: string | null;
  allocation: string | null;
  dividendYield: string | null;
  dividendYieldOnBuyin: string | null;
  annualDividendTotal: string | null;
  dividendPerShare: string | null;
  dividendFrequency: DividendFrequency | null;
  dividendCagr: string | null;
  dividendCagrPeriod: string | null;
  nextExDate: string | null;
  nextPayDate: string | null;
  assetType: SecurityAssetType | null;
  /** Waehrung der Betraege dieser Zeile (Depotwaehrung des Exports). */
  currency: string;

  warnings: string[];
}

export interface InvalidDivvyDiaryRow {
  sourceRow: number;
  reason: string;
}

export interface ParsedDivvyDiaryFile {
  /** Zeilen mit Bestand — nur sie werden importiert. */
  positions: DivvyDiaryPosition[];
  /** Zeilen ohne Bestand (Beobachtungswerte, verkaufte Positionen). */
  withoutHolding: number;
  invalid: InvalidDivvyDiaryRow[];
  /** Datenzeilen insgesamt; die Bilanz muss aufgehen (IMPORT_SPEC.md §8). */
  totalRows: number;
  /** Hinweise zur Datei als Ganzes (Kodierung, Trennzeichen). */
  warnings: string[];
}

export class DivvyDiaryCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DivvyDiaryCsvError";
  }
}

/**
 * Stichtag aus dem Dateinamen: DivvyDiary haengt den Exportzeitpunkt als
 * Millisekunden an (`divvydiaryportfolio1785790381565.csv`).
 *
 * Bewusst als Kalendertag in **lokaler** Zeit: Ein Export um 22:53 Uhr
 * deutscher Zeit beschreibt den Bestand dieses Tages; ueber UTC gelesen laege
 * er im Sommer bereits im Vortag.
 *
 * Liefert `null`, wenn der Name keinen plausiblen Zeitstempel enthaelt — dann
 * fragt der Assistent nach, statt ein Datum zu erfinden.
 */
export function parseExportDate(fileName: string, now = new Date()): string | null {
  const match = /(\d{13})/.exec(fileName);
  if (!match) return null;

  const milliseconds = Number.parseInt(match[1], 10);
  if (!Number.isFinite(milliseconds)) return null;

  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;

  // Plausibilitaet: nicht vor 2000 und nicht in der Zukunft. Ein Dateiname darf
  // sonst einen Stichtag setzen, den es nie gab.
  if (date.getFullYear() < 2000 || date.getTime() > now.getTime()) return null;

  return toIsoDay(date);
}

/** Kalendertag eines Zeitpunkts in lokaler Zeit als `YYYY-MM-DD`. */
export function toIsoDay(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findColumn(headers: string[], name: string): number {
  return headers.indexOf(name);
}

function cell(row: string[], index: number): string {
  if (index === -1) return "";
  return (row[index] ?? "").trim();
}

/** Leere Angabe oder Platzhalter der Quelle. */
function isMissing(value: string): boolean {
  return PLACEHOLDER_VALUES.has(value.toLowerCase());
}

function textOrNull(value: string, maxLength: number): string | null {
  if (isMissing(value)) return null;
  return value.slice(0, maxLength);
}

/**
 * Zahl der Quelle als kanonischer Dezimalstring. Das Format ist mit `"de"` fest
 * vorgegeben statt es zu erraten: Die Quelle schreibt durchgehend deutsch, und
 * bei `"auto"` waere ein Wert wie `1,234` nicht von Tausendern zu unterscheiden.
 * Ein falsch gelesenes Trennzeichen macht aus 1.234,56 € stillschweigend 1,23 €.
 */
function numberOrNull(value: string): string | null {
  if (isMissing(value)) return null;
  const parsed = parseAmount(value, "de");
  return parsed.ok ? parsed.value.canonical : null;
}

/** ISO-Kalendertag der Quelle (`YYYY-MM-DD`), sonst `null`. */
function isoDateOrNull(value: string): string | null {
  if (isMissing(value)) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Fangt den 31. Februar ab: JavaScript rollt ihn stillschweigend weiter.
  return date.toISOString().slice(0, 10) === value ? value : null;
}

function isPositive(canonical: string | null): boolean {
  if (canonical === null) return false;
  return new MoneyDecimal(canonical).greaterThan(0);
}

/**
 * Liest den Portfolio-Export. Zeilen **ohne Bestand** werden gezaehlt, aber
 * nicht zurueckgegeben: Ein Beobachtungswert ist keine Position, und ein
 * verkauftes Papier soll keinen Stand von gestern konservieren.
 *
 * @throws DivvyDiaryCsvError wenn die Datei keine erkennbare Kopfzeile hat.
 */
export function parseDivvyDiaryCsv(buffer: ArrayBuffer): ParsedDivvyDiaryFile {
  const { rows, warnings } = parseCsv(buffer);
  if (rows.length === 0) {
    throw new DivvyDiaryCsvError("Die Datei enthält keine Zeilen.");
  }
  const [headerRow, ...dataRows] = rows;

  const headers = headerRow.map((header) => header.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter((name) => findColumn(headers, name) === -1);
  if (missing.length > 0) {
    throw new DivvyDiaryCsvError(
      `Das ist kein DivvyDiary-Portfolio-Export: Die Spalte${
        missing.length === 1 ? "" : "n"
      } ${missing.map((name) => `„${name}"`).join(", ")} fehlt${
        missing.length === 1 ? "" : "en"
      }.`,
    );
  }

  // Spaltenpositionen einmal aufloesen statt in jeder Zeile zu suchen. Die
  // Namen der Quelle stehen hier als einzige Wahrheit — faellt eine weg, zeigt
  // sich das an genau einer Stelle.
  const column = {
    symbol: findColumn(headers, "symbol"),
    isin: findColumn(headers, "isin"),
    wkn: findColumn(headers, "wkn"),
    name: findColumn(headers, "name"),
    quantity: findColumn(headers, "quantity"),
    buyin: findColumn(headers, "buyin"),
    buyinTotal: findColumn(headers, "buyintotal"),
    price: findColumn(headers, "price"),
    value: findColumn(headers, "value"),
    gain: findColumn(headers, "gain"),
    gainRel: findColumn(headers, "gainrel"),
    currency: findColumn(headers, "currency"),
    allocation: findColumn(headers, "allocation"),
    dividendYield: findColumn(headers, "dividendyield"),
    dividendYieldOnBuyin: findColumn(headers, "dividendyieldonbuyin"),
    totalDividendRate: findColumn(headers, "totaldividendrate"),
    dividendRate: findColumn(headers, "dividendrate"),
    dividendFrequency: findColumn(headers, "dividendfrequency"),
    dividendCagr: findColumn(headers, "dividendcagr"),
    dividendCagrPeriod: findColumn(headers, "dividendcagrperiod"),
    sector: findColumn(headers, "sector"),
    securityType: findColumn(headers, "securitytype"),
    country: findColumn(headers, "country"),
    originalDividendCurrency: findColumn(headers, "originaldividendcurrency"),
    exDate: findColumn(headers, "exdate"),
    payDate: findColumn(headers, "paydate"),
  };

  const positions: DivvyDiaryPosition[] = [];
  const invalid: InvalidDivvyDiaryRow[] = [];
  let withoutHolding = 0;
  let totalRows = 0;

  dataRows.forEach((row, index) => {
    // Kopfzeile ist Zeile 1, erste Datenzeile daher Zeile 2.
    const sourceRow = index + 2;
    if (row.every((value) => value.trim() === "")) return; // Leerzeile am Dateiende
    totalRows += 1;

    const name = cell(row, column.name);
    if (name === "") {
      invalid.push({ sourceRow, reason: "Name fehlt" });
      return;
    }

    const isin = cell(row, column.isin).toUpperCase();
    if (!ISIN_PATTERN.test(isin)) {
      invalid.push({
        sourceRow,
        reason: `${name}: ISIN „${isin || "leer"}" ist ungültig`,
      });
      return;
    }

    const quantity = numberOrNull(cell(row, column.quantity));
    if (quantity === null || !isPositive(quantity)) {
      // Beobachtungswert oder verkaufte Position — kein Fehler, nur nichts,
      // was einen Depotstand beschreibt.
      withoutHolding += 1;
      return;
    }

    const rowWarnings: string[] = [];

    let ticker = textOrNull(cell(row, column.symbol), 20);
    if (ticker !== null && !TICKER_PATTERN.test(ticker)) {
      rowWarnings.push(`Ticker „${ticker}" ungültig, wird nicht übernommen`);
      ticker = null;
    }

    let wkn = textOrNull(cell(row, column.wkn), 6)?.toUpperCase() ?? null;
    if (wkn !== null && !WKN_PATTERN.test(wkn)) {
      rowWarnings.push(`WKN „${wkn}" ungültig, wird nicht übernommen`);
      wkn = null;
    }

    // Das Land der Quelle wird nur uebernommen, wenn es ein Laendercode ist.
    // Fuer alles andere gilt die ISIN als Quelle — ihre ersten beiden Zeichen
    // sind nach ISO 6166 der Emissionsstaat.
    const rawCountry = textOrNull(cell(row, column.country), 2)?.toUpperCase() ?? null;
    const country =
      rawCountry !== null && /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null;

    const dividendCurrency =
      textOrNull(cell(row, column.originalDividendCurrency), 3)?.toUpperCase() ?? null;

    const currency = cell(row, column.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      invalid.push({
        sourceRow,
        reason: `${name}: Währung „${currency || "leer"}" ist ungültig`,
      });
      return;
    }

    const frequencyRaw = cell(row, column.dividendFrequency).toLowerCase();
    const dividendFrequency = isMissing(frequencyRaw)
      ? null
      : (FREQUENCY_BY_SOURCE[frequencyRaw] ?? "irregular");

    const assetTypeRaw = cell(row, column.securityType).toLowerCase();
    const assetType = isMissing(assetTypeRaw)
      ? null
      : (ASSET_TYPE_BY_SOURCE[assetTypeRaw] ?? "other");

    positions.push({
      sourceRow,
      name,
      ticker,
      isin,
      wkn,
      country,
      sector: textOrNull(cell(row, column.sector), 100),
      dividendCurrency:
        dividendCurrency !== null && /^[A-Z]{3}$/.test(dividendCurrency)
          ? dividendCurrency
          : null,
      quantity,
      buyinPerShare: numberOrNull(cell(row, column.buyin)),
      buyinTotal: numberOrNull(cell(row, column.buyinTotal)),
      price: numberOrNull(cell(row, column.price)),
      marketValue: numberOrNull(cell(row, column.value)),
      gainAbsolute: numberOrNull(cell(row, column.gain)),
      gainRelative: numberOrNull(cell(row, column.gainRel)),
      allocation: numberOrNull(cell(row, column.allocation)),
      dividendYield: numberOrNull(cell(row, column.dividendYield)),
      dividendYieldOnBuyin: numberOrNull(cell(row, column.dividendYieldOnBuyin)),
      annualDividendTotal: numberOrNull(cell(row, column.totalDividendRate)),
      dividendPerShare: numberOrNull(cell(row, column.dividendRate)),
      dividendFrequency,
      dividendCagr: numberOrNull(cell(row, column.dividendCagr)),
      dividendCagrPeriod: textOrNull(cell(row, column.dividendCagrPeriod), 10),
      nextExDate: isoDateOrNull(cell(row, column.exDate)),
      nextPayDate: isoDateOrNull(cell(row, column.payDate)),
      assetType,
      currency,
      warnings: rowWarnings,
    });
  });

  return { positions, withoutHolding, invalid, totalRows, warnings };
}
