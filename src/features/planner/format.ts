import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import { monthNameDeShort } from "@/lib/statistics/dates";
import type { PlanFocus } from "./purchase";

/** Ausschuettungsrhythmus in Worten („quartalsweise", „3× im Jahr"). */
const RHYTHM: Record<number, string> = {
  1: "jährlich",
  2: "halbjährlich",
  4: "quartalsweise",
  12: "monatlich",
};

export function rhythm(payouts: number): string {
  return RHYTHM[payouts] ?? `${String(payouts)}× im Jahr`;
}

const inputNumberFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

/** Anzeige im Feld: „1.500", „2,5" — liest sich zurueck (parseGermanNumber). */
export function formatDecimal(value: DecimalInstance | number): string {
  const decimal = typeof value === "number" ? new MoneyDecimal(value) : value;
  return inputNumberFormat.format(decimal.toDecimalPlaces(2).toNumber());
}

/** Ø je Monat über zwölf Monatswerte (Nachkauf, Tausch). */
export function monthlyAverage(values: readonly Money[]): Money {
  return Money.fromDecimal(
    values
      .reduce((sum, value) => sum.add(value))
      .toDecimal()
      .dividedBy(12),
    EUR,
  );
}

/** Kleinster der zwölf Monatswerte. */
export function weakestMonth(values: readonly Money[]): Money {
  return values.reduce((low, value) => (value.compareTo(low) < 0 ? value : low));
}

/** „monatlich" oder „quartalsweise · Mär, Jun, Sep, Dez". */
export function payoutText(months: readonly number[]): {
  rhythm: string;
  months: string | null;
} {
  return {
    rhythm: rhythm(months.length),
    // Ein Monatszahler braucht keine Monatsliste: „monatlich" sagt alles.
    months: months.length === 12 ? null : months.map(monthNameDeShort).join(", "),
  };
}

/** Schwerpunkte von Nachkauf und Tausch. */
export const FOCUS_LABEL: Record<PlanFocus, string> = {
  dividende: "Mehr Dividende",
  monate: "Monate glätten",
  wachstum: "Dividendenwachstum",
};
