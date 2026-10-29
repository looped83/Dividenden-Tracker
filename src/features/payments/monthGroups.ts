import { sumMoney, type DecimalInstance, type Money } from "@/lib/money";

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

export interface MonthChange {
  direction: "up" | "down" | "same";
  /** Prozentpunkte, noch ungerundet. */
  percent: DecimalInstance;
  /** Summe desselben Monats im Vorjahr (im laufenden Monat bis `cutoffDay`). */
  reference: Money;
  /** Tag, an dem beide Monate gekappt sind — nur im laufenden Monat. */
  cutoffDay: number | null;
}

/**
 * Monatssumme gegenueber demselben Monat im Vorjahr (seit 2.53.0), je
 * `YYYY-MM`.
 *
 * Der laufende Monat wird wie im Statistik-Vergleich (`compareMonths`) an
 * heute gekappt — beide Seiten: Der halbe Oktober gegen den ganzen Oktober des
 * Vorjahres zeigte sonst bis Monatsende ein Minus.
 *
 * Kein Eintrag entsteht ohne Vorjahressumme > 0 (R-6.6: nie unendlich) oder
 * bei gemischten Waehrungen (`totalOrNull`).
 */
export function monthChanges<T>(
  rows: readonly T[],
  dateOf: (row: T) => string,
  amountOf: (row: T) => Money,
  today: { year: number; month: number; day: number },
): Map<string, MonthChange> {
  const currentKey = `${String(today.year)}-${String(today.month).padStart(2, "0")}`;
  const byMonth = new Map<string, { day: number; amount: Money }[]>();
  for (const row of rows) {
    const date = dateOf(row);
    const key = date.slice(0, 7);
    const item = { day: Number.parseInt(date.slice(8, 10), 10), amount: amountOf(row) };
    const list = byMonth.get(key);
    if (list) list.push(item);
    else byMonth.set(key, [item]);
  }

  const result = new Map<string, MonthChange>();
  for (const [key, items] of byMonth) {
    const year = Number.parseInt(key.slice(0, 4), 10);
    const previous = byMonth.get(`${String(year - 1)}${key.slice(4)}`);
    if (!previous) continue;
    const cutoffDay = key === currentKey ? today.day : null;
    const sum = (list: readonly { day: number; amount: Money }[]) =>
      totalOrNull(
        list
          .filter((item) => cutoffDay === null || item.day <= cutoffDay)
          .map((item) => item.amount),
      );
    const current = sum(items);
    const reference = sum(previous);
    if (!current || !reference?.isPositive()) continue;
    if (current.currency !== reference.currency) continue;
    const comparison = current.compareTo(reference);
    result.set(key, {
      direction: comparison > 0 ? "up" : comparison < 0 ? "down" : "same",
      percent: current
        .toDecimal()
        .minus(reference.toDecimal())
        .div(reference.toDecimal())
        .times(100),
      reference,
      cutoffDay,
    });
  }
  return result;
}
