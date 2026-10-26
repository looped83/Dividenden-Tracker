import { EUR, Money, MoneyDecimal, formatMoney, formatMoneyWhole } from "@/lib/money";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import type { FixedCost, FixedCostInterval, Milestone, MonthRef } from "@/lib/progress";
import { monthNameDe } from "@/lib/statistics";

const INTERVAL_LABEL: Record<FixedCostInterval, string> = {
  1: "Monatlich",
  3: "Vierteljährlich",
  6: "Halbjährlich",
  12: "Jährlich",
};

export function intervalLabel(interval: FixedCostInterval): string {
  return INTERVAL_LABEL[interval];
}

/**
 * „120,00 € jährlich" für Positionen, die nicht monatlich fällig werden;
 * `null` bei monatlichen, deren Betrag schon der Monatsbetrag ist.
 */
export function paymentText(cost: FixedCost): string | null {
  return cost.interval === 1
    ? null
    : `${formatMoney(cost.payment)} ${INTERVAL_LABEL[cost.interval].toLowerCase()}`;
}

/** „Mai 2027". */
export function monthLabel(ref: MonthRef): string {
  return `${monthNameDe(ref.month)} ${String(ref.year)}`;
}

const euro = (value: number) =>
  formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(value), EUR));

/** „Erstmals 1.000 € in einem Monat" — im Fortschritt und auf der Übersicht. */
export function reachedText(milestone: Milestone): string {
  const n = formatCountNumber(milestone.threshold);
  switch (milestone.kind) {
    case "first":
      return "Erste Dividende";
    case "total":
      return `${euro(milestone.threshold)} insgesamt erhalten`;
    case "year":
      return `Erstmals ${euro(milestone.threshold)} in einem Jahr`;
    case "month":
      return `Erstmals ${euro(milestone.threshold)} in einem Monat`;
    case "streak":
      return `${n} Monate in Folge mit Dividende`;
  }
}
