import { MoneyDecimal, type DecimalInstance } from "@/lib/money";

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
