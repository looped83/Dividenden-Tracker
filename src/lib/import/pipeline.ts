import { MoneyDecimal } from "@/lib/money/decimalConfig";
import { MONEY_SCALE } from "@/lib/money/money";
import { roundHalfUp } from "@/lib/money/rounding";
import { toGermanDecimalString } from "@/lib/money/germanDecimalInput";
import { compareGerman } from "@/lib/utils/compareText";
import { parseDateValue, type DateFormat } from "./parseDate";
import { parseAmount, type NumberFormat } from "./parseAmount";
import { normalizeCompareName, normalizeBrokerName } from "./normalizeName";
import { matchCompany, type ExistingSecurity, type ExistingAlias } from "./matchCompany";
import { matchBroker, type ExistingDepot } from "./brokerMatch";
import type { ImportCellValue } from "./parseWorkbook";
import type {
  NormalizedRow,
  CompanyGroup,
  BrokerGroup,
  CompanyDecision,
  BrokerDecision,
} from "./types";

/**
 * Orchestrierung der Importnormalisierung (IMPORT_SPEC.md §5–§8, Task §5–§14).
 * Reine Funktionen ohne Seiteneffekte — dieselbe Logik laeuft in der UI
 * (Web-Worker-tauglich) und in den Tests gegen die reale Datei.
 */

export interface ColumnIndexes {
  date: number;
  investment: number;
  amount: number;
  broker: number;
}

export interface NormalizeOptions {
  dateFormat: DateFormat;
  numberFormat: NumberFormat;
  date1904: boolean;
  currency: string;
  /** Plausibler Datumsbereich (inklusive). Ausserhalb => Fehlerzeile. */
  minDate?: string;
  maxDate?: string;
}

function cellToString(value: ImportCellValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function isBlankRow(cells: ImportCellValue[]): boolean {
  return cells.every((c) => c === null || String(c).trim() === "");
}

/**
 * Normalisiert und validiert alle Datenzeilen. `dataRows` enthaelt nur die
 * Zeilen unterhalb der Kopfzeile; `firstDataRowNumber` ist die 1-indizierte
 * Nummer der ersten Datenzeile in der Quelldatei (i. d. R. 2).
 */
export function normalizeRows(
  dataRows: ImportCellValue[][],
  columns: ColumnIndexes,
  options: NormalizeOptions,
  firstDataRowNumber = 2,
): NormalizedRow[] {
  const result: NormalizedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows.at(i);
    const sourceRowNumber = firstDataRowNumber + i;

    // Leere Abschlusszeilen still ueberspringen (zaehlen nicht als Datenzeile).
    if (!cells || isBlankRow(cells)) continue;

    const rawDate = cells[columns.date] ?? null;
    const rawInvestment = cells[columns.investment] ?? null;
    const rawAmount = cells[columns.amount] ?? null;
    const rawBroker = cells[columns.broker] ?? null;

    const raw = {
      date: cellToString(rawDate),
      investment: cellToString(rawInvestment),
      amount: cellToString(rawAmount),
      broker: cellToString(rawBroker),
    };

    const warnings: string[] = [];
    const errors: string[] = [];

    // Datum
    let payDate: string | null = null;
    const dateOutcome = parseDateValue(rawDate, options.dateFormat, options.date1904);
    if (dateOutcome.ok) {
      payDate = dateOutcome.value.iso;
      if (dateOutcome.value.hasTimeComponent) {
        warnings.push(
          "Datumswert enthielt einen Zeitanteil; nur das Datum wurde uebernommen.",
        );
      }
      if (options.minDate && payDate < options.minDate) {
        errors.push(
          `Datum ${payDate} liegt vor dem plausiblen Bereich (ab ${options.minDate}).`,
        );
      }
      if (options.maxDate && payDate > options.maxDate) {
        errors.push(
          `Datum ${payDate} liegt nach dem plausiblen Bereich (bis ${options.maxDate}).`,
        );
      }
    } else {
      errors.push(`Zeile ${String(sourceRowNumber)}: ${dateOutcome.error.reason}.`);
    }

    // Betrag (ein Datumswert in der Betragsspalte ist kein gueltiger Betrag).
    let netAmount: string | null = null;
    const amountOutcome = parseAmount(
      rawAmount instanceof Date ? null : rawAmount,
      options.numberFormat,
    );
    if (amountOutcome.ok) {
      // R-1: Genau hier, beim Festschreiben, wird auf zwei Stellen gerundet.
      // Rundete erst die Datenbank, wichen ihre Summen von den hier
      // berechneten Kontrollsummen ab und der Import wuerde abgelehnt.
      const { canonical, decimal } = amountOutcome.value;
      const rounded = roundHalfUp(decimal, MONEY_SCALE);
      if (decimal.decimalPlaces() > MONEY_SCALE) {
        netAmount = rounded.toFixed(MONEY_SCALE);
        warnings.push(
          `Betrag ${toGermanDecimalString(canonical)} wurde kaufmännisch auf ${toGermanDecimalString(netAmount)} gerundet.`,
        );
      } else {
        netAmount = canonical;
      }
      // Der Import legt jede Zeile als regulaeren Eingang an; die Datenbank
      // laesst dafuer keinen negativen Betrag zu. Ohne diese Pruefung scheiterte
      // erst der Commit — als Ganzes und mit einer rohen Datenbankmeldung.
      // Geprueft wird der gerundete Wert: 0,004 waere sonst ein Eingang ueber
      // 0,00 €.
      if (rounded.lessThanOrEqualTo(0)) {
        errors.push(
          `Zeile ${String(sourceRowNumber)}: Betrag muss größer als 0 sein – Korrekturen und Stornos werden nicht importiert.`,
        );
      }
    } else {
      errors.push(`Zeile ${String(sourceRowNumber)}: ${amountOutcome.error.reason}.`);
    }

    const investmentName = raw.investment;
    if (investmentName === "")
      errors.push(`Zeile ${String(sourceRowNumber)}: Investmentname fehlt.`);

    const brokerName = raw.broker;
    if (brokerName === "") errors.push(`Zeile ${String(sourceRowNumber)}: Broker fehlt.`);

    result.push({
      sourceRowNumber,
      raw,
      payDate,
      netAmount,
      currency: options.currency,
      investmentName,
      brokerName,
      status:
        errors.length > 0 ? "invalid" : warnings.length > 0 ? "valid_warning" : "valid",
      warnings,
      errors,
    });
  }

  return result;
}

/** Gruppiert gueltige Zeilen nach eindeutigem Quell-Investmentnamen (Task §8). */
export function groupCompanies(
  rows: NormalizedRow[],
  existingSecurities: ExistingSecurity[],
  aliases: ExistingAlias[] = [],
): CompanyGroup[] {
  const groups = new Map<
    string,
    {
      sourceName: string;
      count: number;
      min: string | null;
      max: string | null;
      sum: ReturnType<typeof MoneyDecimal.prototype.plus>;
    }
  >();

  for (const row of rows) {
    if (row.status === "invalid" || row.status === "excluded") continue;
    if (!row.payDate || !row.netAmount) continue;
    const normalized = normalizeCompareName(row.investmentName);
    const bucket = groups.get(normalized) ?? {
      sourceName: row.investmentName,
      count: 0,
      min: null,
      max: null,
      sum: new MoneyDecimal(0),
    };
    bucket.count += 1;
    bucket.sum = bucket.sum.plus(new MoneyDecimal(row.netAmount));
    if (bucket.min === null || row.payDate < bucket.min) bucket.min = row.payDate;
    if (bucket.max === null || row.payDate > bucket.max) bucket.max = row.payDate;
    groups.set(normalized, bucket);
  }

  return [...groups.entries()]
    .map(([normalized, bucket]) => {
      const match = matchCompany(bucket.sourceName, existingSecurities, aliases);
      const defaultDecision: CompanyDecision =
        match.autoAssignable && match.securityId
          ? {
              kind: match.reason === "alias" ? "alias" : "existing",
              securityId: match.securityId,
            }
          : { kind: "new" };
      return {
        sourceName: bucket.sourceName,
        normalized,
        count: bucket.count,
        minDate: bucket.min,
        maxDate: bucket.max,
        sum: bucket.sum.toFixed(2),
        match,
        defaultDecision,
      };
    })
    .sort((a, b) => compareGerman(a.sourceName, b.sourceName));
}

/** Gruppiert gueltige Zeilen nach Broker (Task §9). */
export function groupBrokers(
  rows: NormalizedRow[],
  existingDepots: ExistingDepot[],
): BrokerGroup[] {
  const groups = new Map<
    string,
    {
      sourceName: string;
      count: number;
      sum: ReturnType<typeof MoneyDecimal.prototype.plus>;
    }
  >();

  for (const row of rows) {
    if (row.status === "invalid" || row.status === "excluded") continue;
    if (!row.netAmount) continue;
    const normalized = normalizeBrokerName(row.brokerName);
    const bucket = groups.get(normalized) ?? {
      sourceName: row.brokerName,
      count: 0,
      sum: new MoneyDecimal(0),
    };
    bucket.count += 1;
    bucket.sum = bucket.sum.plus(new MoneyDecimal(row.netAmount));
    groups.set(normalized, bucket);
  }

  return [...groups.entries()]
    .map(([normalized, bucket]) => {
      const match = matchBroker(bucket.sourceName, existingDepots);
      const defaultDecision: BrokerDecision =
        match.autoAssignable && match.depotId
          ? { kind: "existing", depotId: match.depotId }
          : { kind: "new" };
      return {
        sourceName: bucket.sourceName,
        normalized,
        count: bucket.count,
        sum: bucket.sum.toFixed(2),
        match,
        defaultDecision,
      };
    })
    .sort((a, b) => compareGerman(a.sourceName, b.sourceName));
}
