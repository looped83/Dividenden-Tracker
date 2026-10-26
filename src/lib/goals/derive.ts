import { EUR, Money, MoneyDecimal, sumMoney, type DecimalInstance } from "@/lib/money";
import type { RefDate } from "@/lib/statistics";
import type { Goal } from "./types";

export interface DerivedMonthlyGoal {
  month: number;
  /** Volle Euro, > 0. */
  amount: Money;
}

/**
 * Monatsziele aus einem Jahresziel (CALCULATION_RULES.md §13.2, seit 2.34.0):
 * Was zum Jahresziel noch fehlt, verteilt nach dem Muster des Jahres auf die
 * Monate ohne eigenes Ziel. Im laufenden Jahr ab dem laufenden Monat; was
 * davor eingegangen ist und was vorhandene Monatsziele schon vorsehen, ist
 * abgezogen. Treffen alle Monate ihr Ziel, ist das Jahresziel erreicht.
 *
 * - `pattern`: erwartete Nettodividende je Monat (Index 0 = Januar) — im
 *   laufenden Jahr erhalten plus noch erwartet (§9.7). Für ein späteres Jahr
 *   gilt dasselbe Muster. Monate ohne Erwartung bekommen kein Ziel; erwartet
 *   kein Monat etwas, wird gleichmäßig verteilt.
 * - `received`: erhalten je Monat des laufenden Jahres.
 *
 * Leer, wenn nichts mehr fehlt, alle Monate ein Ziel haben oder das Jahr
 * vorbei ist.
 */
export function deriveMonthlyGoals({
  annual,
  goals,
  pattern,
  received,
  ref,
}: {
  annual: Goal;
  goals: readonly Goal[];
  pattern: readonly Money[];
  received: readonly Money[];
  ref: RefDate;
}): DerivedMonthlyGoal[] {
  if (annual.goalType !== "annual" || annual.year < ref.year) return [];
  const firstMonth = annual.year === ref.year ? ref.month : 1;
  const months = Array.from(
    { length: 13 - firstMonth },
    (_, index) => firstMonth + index,
  );
  const existing = new Map(
    goals
      .filter((goal) => goal.goalType === "monthly" && goal.year === annual.year)
      .map((goal) => [goal.month, goal.targetAmount]),
  );
  const open = months.filter((month) => !existing.has(month));
  if (open.length === 0) return [];

  const before =
    annual.year === ref.year
      ? sumMoney(received.slice(0, firstMonth - 1), EUR)
      : Money.zero(EUR);
  const planned = sumMoney(
    months.flatMap((month) => {
      const target = existing.get(month);
      return target ? [target] : [];
    }),
    EUR,
  );
  const missing = annual.targetAmount
    .subtract(before)
    .subtract(planned)
    .toDecimal()
    .ceil();
  if (missing.lte(0)) return [];

  const weighted = open.map((month) => ({
    month,
    weight: MoneyDecimal.max(0, pattern[month - 1].toDecimal()),
  }));
  const total = weighted.reduce(
    (sum, item) => sum.plus(item.weight),
    new MoneyDecimal(0),
  );
  const shares = total.gt(0)
    ? weighted.filter((item) => item.weight.gt(0))
    : weighted.map((item) => ({ ...item, weight: new MoneyDecimal(1) }));
  const weightSum = total.gt(0) ? total : new MoneyDecimal(shares.length);

  return largestRemainder(missing, shares, weightSum)
    .filter((item) => item.amount.gt(0))
    .map((item) => ({ month: item.month, amount: Money.fromDecimal(item.amount, EUR) }));
}

/**
 * Volle Euro, die zusammen genau `total` ergeben: abgerundet, die übrigen
 * Euro an die Monate mit dem größten Rest.
 */
function largestRemainder(
  total: DecimalInstance,
  shares: readonly { month: number; weight: DecimalInstance }[],
  weightSum: DecimalInstance,
): { month: number; amount: DecimalInstance }[] {
  const raw = shares.map((share) => {
    const exact = total.times(share.weight).div(weightSum);
    return {
      month: share.month,
      amount: exact.floor(),
      rest: exact.minus(exact.floor()),
    };
  });
  let left = total.minus(
    raw.reduce((sum, item) => sum.plus(item.amount), new MoneyDecimal(0)),
  );
  const order = raw
    .map((item, index) => ({ index, rest: item.rest }))
    .sort((a, b) => b.rest.comparedTo(a.rest) || a.index - b.index);
  for (const { index } of order) {
    if (left.lte(0)) break;
    raw[index].amount = raw[index].amount.plus(1);
    left = left.minus(1);
  }
  return raw.map(({ month, amount }) => ({ month, amount }));
}
