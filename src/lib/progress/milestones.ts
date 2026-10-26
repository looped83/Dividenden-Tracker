import { MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";

/**
 * Meilensteine (CALCULATION_RULES.md §15.2): Schwellen, die die eigene
 * Historie überschritten hat, mit dem Tag, an dem es geschah — und je Art die
 * nächste Schwelle. Abgeleitet aus den erhaltenen Dividenden, nie gespeichert.
 */
export type MilestoneKind = "first" | "total" | "year" | "month" | "streak";

export interface Milestone {
  kind: MilestoneKind;
  /** Betrag in € bzw. Anzahl; bei `first` 0. */
  threshold: number;
  /** Effektives Zahlungsdatum, an dem die Schwelle fiel. */
  reachedOn: string;
}

export interface NextMilestone {
  kind: Exclude<MilestoneKind, "first">;
  /** Heutiger Stand in € bzw. Anzahl. */
  current: DecimalInstance;
  threshold: number;
  /** 0–100. */
  percent: DecimalInstance;
}

export interface MilestoneOverview {
  /** Neueste zuerst. */
  reached: Milestone[];
  next: NextMilestone[];
}

/**
 * Schwellen je Art. Geldbeträge in Stufen 1 – 1,5 – 2 – 3 – 4 – 5 – 7,5 je
 * Zehnerpotenz: dicht genug, dass die nächste Stufe in Reichweite liegt, und
 * runde Zahlen, die man sich merkt. Die Untergrenzen halten frühe Kleinstbeträge
 * aus der Liste.
 */
const STEPS_X10 = [10, 15, 20, 30, 40, 50, 75] as const;
const MONEY_FROM: Record<"total" | "year" | "month", number> = {
  total: 1000,
  year: 500,
  month: 100,
};
const STREAK = [3, 6, 12, 24, 36, 48, 60] as const;

/** `index`-te Stufe der Geldleiter ab 1 € — ganzzahlig gerechnet, ohne Rundungsrest. */
function moneyStep(index: number): number {
  return (
    (STEPS_X10[index % STEPS_X10.length] * 10 ** Math.floor(index / STEPS_X10.length)) /
    10
  );
}

/** Erste Stufe der Geldleiter, die die Untergrenze erreicht. */
function moneyOffset(from: number): number {
  let index = 0;
  while (moneyStep(index) < from) index += 1;
  return index;
}

const MONEY_OFFSET = {
  total: moneyOffset(MONEY_FROM.total),
  year: moneyOffset(MONEY_FROM.year),
  month: moneyOffset(MONEY_FROM.month),
};

/** Die `index`-te Schwelle einer Leiter (0-basiert), unbegrenzt fortgesetzt. */
function threshold(kind: Exclude<MilestoneKind, "first">, index: number): number {
  if (kind === "streak") {
    // Nach fünf Jahren jedes weitere Jahr.
    return index < STREAK.length ? STREAK[index] : 60 + 12 * (index - STREAK.length + 1);
  }
  return moneyStep(MONEY_OFFSET[kind] + index);
}

/** Kalendermonat als fortlaufende Zahl, damit „direkt danach" ein `+ 1` ist. */
function monthIndex(iso: string): number {
  return (
    Number.parseInt(iso.slice(0, 4), 10) * 12 + Number.parseInt(iso.slice(5, 7), 10) - 1
  );
}

/** Zähler einer Leiter: meldet jede Schwelle, die ein neuer Stand überschreitet. */
class Ladder {
  private index = 0;
  private readonly kind: Exclude<MilestoneKind, "first">;

  constructor(kind: Exclude<MilestoneKind, "first">) {
    this.kind = kind;
  }

  /** Schwellen, die `value` erstmals erreicht. */
  reach(value: DecimalInstance, on: string, into: Milestone[]): void {
    while (value.gte(threshold(this.kind, this.index))) {
      into.push({
        kind: this.kind,
        threshold: threshold(this.kind, this.index),
        reachedOn: on,
      });
      this.index += 1;
    }
  }

  next(current: DecimalInstance): NextMilestone {
    const target = threshold(this.kind, this.index);
    const percent = MoneyDecimal.min(
      100,
      MoneyDecimal.max(0, current.div(target).times(100)),
    );
    return { kind: this.kind, current, threshold: target, percent };
  }
}

export function milestoneOverview(
  payments: readonly AnalyticsPayment[],
  today: RefDate,
): MilestoneOverview {
  const sorted = [...payments].sort(
    (a, b) =>
      a.payDate.localeCompare(b.payDate) || a.createdAt.localeCompare(b.createdAt),
  );
  const reached: Milestone[] = [];
  const first = sorted.at(0);
  if (first) reached.push({ kind: "first", threshold: 0, reachedOn: first.payDate });

  const ladders = {
    total: new Ladder("total"),
    year: new Ladder("year"),
    month: new Ladder("month"),
    streak: new Ladder("streak"),
  };
  let total = new MoneyDecimal(0);
  const perYear = new Map<string, DecimalInstance>();
  const perMonth = new Map<string, DecimalInstance>();
  let bestYear = new MoneyDecimal(0);
  let bestMonth = new MoneyDecimal(0);
  let lastMonth: number | null = null;
  let streak = 0;

  for (const payment of sorted) {
    const on = payment.payDate;
    const net = payment.netAmount.toDecimal();

    total = total.plus(net);
    ladders.total.reach(total, on, reached);

    const yearKey = on.slice(0, 4);
    const year = (perYear.get(yearKey) ?? new MoneyDecimal(0)).plus(net);
    perYear.set(yearKey, year);
    bestYear = MoneyDecimal.max(bestYear, year);
    ladders.year.reach(year, on, reached);

    const monthKey = on.slice(0, 7);
    const month = (perMonth.get(monthKey) ?? new MoneyDecimal(0)).plus(net);
    perMonth.set(monthKey, month);
    bestMonth = MoneyDecimal.max(bestMonth, month);
    ladders.month.reach(month, on, reached);

    const index = monthIndex(on);
    if (index !== lastMonth) {
      streak = lastMonth !== null && index === lastMonth + 1 ? streak + 1 : 1;
      lastMonth = index;
      ladders.streak.reach(new MoneyDecimal(streak), on, reached);
    }
  }

  // Die Serie läuft weiter, solange der Vormonat bezahlt hat: Der laufende
  // Monat ist noch nicht vorbei.
  const currentMonth = today.year * 12 + today.month - 1;
  const running =
    lastMonth !== null && lastMonth >= currentMonth - 1 && lastMonth <= currentMonth
      ? streak
      : 0;

  return {
    reached: reached.reverse(),
    next: [
      ladders.total.next(total),
      ladders.year.next(bestYear),
      ladders.month.next(bestMonth),
      ladders.streak.next(new MoneyDecimal(running)),
    ],
  };
}

export interface YearMilestones {
  /** In diesem Jahr erreicht, älteste zuerst. */
  reached: Milestone[];
  /** Nächste Stufe der Summe seit Beginn, gemessen am Ende des Jahres. */
  nextTotal: NextMilestone;
}

/**
 * Meilensteine eines Jahres für den Jahresrückblick: dieselben Leitern wie
 * im Fortschritt, nur aus den Zahlungen bis einschließlich `year` — ein
 * späteres Jahr ändert den Rückblick nicht.
 */
export function yearMilestones(
  payments: readonly AnalyticsPayment[],
  year: number,
  today: RefDate,
): YearMilestones {
  const prefix = String(year);
  const overview = milestoneOverview(
    payments.filter((payment) => payment.payDate.slice(0, 4) <= prefix),
    today,
  );
  return {
    reached: overview.reached
      .filter((milestone) => milestone.reachedOn.startsWith(prefix))
      .reverse(),
    nextTotal: overview.next[0],
  };
}
