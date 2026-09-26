import { sumMoney, type Money } from "@/lib/money";

export interface MonthGroup<T> {
  /** `YYYY-MM` */
  key: string;
  year: number;
  month: number;
  rows: T[];
}

/**
 * Teilt bereits nach Datum sortierte Zeilen in Monate — in der Reihenfolge,
 * in der sie kommen (neueste oder aelteste zuerst). Aufeinanderfolgende Zeilen
 * desselben Monats bilden eine Gruppe; die Sortierung bleibt unangetastet.
 */
export function groupByMonth<T>(
  rows: readonly T[],
  dateOf: (row: T) => string,
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const row of rows) {
    const key = dateOf(row).slice(0, 7);
    const last = groups.at(-1);
    if (last?.key === key) {
      last.rows.push(row);
    } else {
      groups.push({
        key,
        year: Number.parseInt(key.slice(0, 4), 10),
        month: Number.parseInt(key.slice(5, 7), 10),
        rows: [row],
      });
    }
  }
  return groups;
}

/**
 * Summe mehrerer Betraege — oder `null`, wenn sie in verschiedenen Waehrungen
 * vorliegen. Addiert wird nie ueber Waehrungen hinweg; das waere eine
 * Umrechnung zu einem erfundenen Kurs (CALCULATION_RULES.md).
 */
export function totalOrNull(amounts: readonly Money[]): Money | null {
  const currency = amounts.at(0)?.currency;
  if (currency === undefined) return null;
  if (amounts.some((amount) => amount.currency !== currency)) return null;
  return sumMoney(amounts, currency);
}

/** Summe je Monat (`YYYY-MM`) ueber alle Zeilen, nicht nur die geladenen. */
export function monthTotals<T>(
  rows: readonly T[],
  dateOf: (row: T) => string,
  amountOf: (row: T) => Money,
): Map<string, Money | null> {
  const byMonth = new Map<string, Money[]>();
  for (const row of rows) {
    const key = dateOf(row).slice(0, 7);
    const list = byMonth.get(key);
    if (list) list.push(amountOf(row));
    else byMonth.set(key, [amountOf(row)]);
  }
  return new Map([...byMonth].map(([key, amounts]) => [key, totalOrNull(amounts)]));
}
