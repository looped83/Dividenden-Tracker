import { MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";
import type { CoverageResult } from "./coverage";
import type { NextMilestone } from "./milestones";

/** Ein Kalendermonat. */
export interface MonthRef {
  year: number;
  /** 1–12. */
  month: number;
}

export interface ProgressEtas {
  /** Je Art der Monat, in dem der nächste Meilenstein voraussichtlich fällt. */
  milestones: ReadonlyMap<NextMilestone["kind"], MonthRef>;
  /** Je noch nicht gedeckter Fixkostenposition (Kennung) der Monat, ab dem sie gedeckt ist. */
  costs: ReadonlyMap<string, MonthRef>;
}

export const NO_ETAS: ProgressEtas = { milestones: new Map(), costs: new Map() };

const ZERO = new MoneyDecimal(0);
const TWELVE = new MoneyDecimal(12);

/** Kalendermonat als fortlaufende Zahl, damit „nächster Monat" ein `+ 1` ist. */
function indexOf(year: number, month: number): number {
  return year * 12 + month - 1;
}

function refOf(index: number): MonthRef {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Wann fallen die nächsten Meilensteine, ab wann sind die offenen Fixkosten
 * gedeckt (CALCULATION_RULES.md §15.4, seit 2.34.0)?
 *
 * Ein künftiger Monat bringt, was derselbe Kalendermonat in den zwölf vollen
 * Monaten vor dem laufenden brachte, gewachsen wie der Schneeball (`growth`,
 * Faktor gegenüber heute, Index 0 = nächster Monat). So fällt „Bester Monat"
 * in einen starken Monat, und ein Monat ohne Zahlung bricht die Serie. Ohne
 * Zahlungen in diesen zwölf Monaten gibt es keine Termine.
 */
export function progressEtas({
  payments,
  today,
  growth,
  milestones,
  coverage,
}: {
  payments: readonly AnalyticsPayment[];
  today: RefDate;
  growth: readonly DecimalInstance[];
  milestones: readonly NextMilestone[];
  coverage: CoverageResult;
}): ProgressEtas {
  const current = indexOf(today.year, today.month);
  const actual = new Map<number, DecimalInstance>();
  for (const payment of payments) {
    const index = indexOf(
      Number.parseInt(payment.payDate.slice(0, 4), 10),
      Number.parseInt(payment.payDate.slice(5, 7), 10),
    );
    if (index > current) continue;
    actual.set(index, (actual.get(index) ?? ZERO).plus(payment.netAmount.toDecimal()));
  }
  const actualAt = (index: number) => actual.get(index) ?? ZERO;

  // Basis je Kalendermonat: die zwölf vollen Monate vor dem laufenden.
  let lastYear = ZERO;
  const base: DecimalInstance[] = [];
  for (let index = current - 12; index < current; index += 1) {
    base[index % 12] = actualAt(index);
    lastYear = lastYear.plus(actualAt(index));
  }
  if (!lastYear.greaterThan(0)) return NO_ETAS;
  /** Erwartet im Monat `current + k` (k ≥ 1). */
  const projected = growth.map((factor, offset) =>
    factor.times(base[(current + offset + 1) % 12]),
  );
  const valueAt = (index: number) =>
    index <= current ? actualAt(index) : (projected[index - current - 1] ?? ZERO);

  const etas = new Map<NextMilestone["kind"], MonthRef>();
  for (const milestone of milestones) {
    const found = milestoneEta(milestone, {
      current,
      projected,
      seasonNow: base[current % 12],
      paidNow: actualAt(current).greaterThan(0),
      yearToDate: Array.from({ length: today.month }, (_, offset) =>
        actualAt(current - today.month + 1 + offset),
      ).reduce((sum, value) => sum.plus(value), ZERO),
    });
    if (found !== null) etas.set(milestone.kind, refOf(found));
  }

  return { milestones: etas, costs: costEtas(coverage, current, projected, valueAt) };
}

function milestoneEta(
  milestone: NextMilestone,
  {
    current,
    projected,
    seasonNow,
    paidNow,
    yearToDate,
  }: {
    current: number;
    projected: readonly DecimalInstance[];
    seasonNow: DecimalInstance;
    paidNow: boolean;
    yearToDate: DecimalInstance;
  },
): number | null {
  const target = new MoneyDecimal(milestone.threshold);
  switch (milestone.kind) {
    case "total": {
      let sum = milestone.current;
      for (const [offset, value] of projected.entries()) {
        sum = sum.plus(value);
        if (sum.gte(target)) return current + offset + 1;
      }
      return null;
    }
    case "year": {
      let sum = yearToDate;
      for (const [offset, value] of projected.entries()) {
        const index = current + offset + 1;
        if (index % 12 === 0) sum = ZERO;
        sum = sum.plus(value);
        if (sum.gte(target)) return index;
      }
      return null;
    }
    case "month": {
      const offset = projected.findIndex((value) => value.gte(target));
      return offset === -1 ? null : current + offset + 1;
    }
    case "streak": {
      // Die laufende Serie zählt den laufenden Monat erst mit seiner Zahlung;
      // zahlt er im Muster, kommt sie noch.
      let streak = milestone.current.toNumber();
      if (!paidNow && seasonNow.greaterThan(0)) streak += 1;
      if (streak >= milestone.threshold) return current;
      for (const [offset, value] of projected.entries()) {
        streak = value.greaterThan(0) ? streak + 1 : 0;
        if (streak >= milestone.threshold) return current + offset + 1;
      }
      return null;
    }
  }
}

/**
 * Eine Position ist gedeckt, sobald der Ø der zwölf Monate bis dahin alle
 * günstigeren Positionen und sie selbst trägt — dieselbe Leiter wie §15.1.
 */
function costEtas(
  coverage: CoverageResult,
  current: number,
  projected: readonly DecimalInstance[],
  valueAt: (index: number) => DecimalInstance,
): Map<string, MonthRef> {
  const result = new Map<string, MonthRef>();
  const pending: { id: string; needed: DecimalInstance }[] = [];
  let ladder = ZERO;
  for (const item of coverage.items) {
    ladder = ladder.plus(item.cost.amount.toDecimal());
    if (item.status !== "covered") pending.push({ id: item.cost.id, needed: ladder });
  }
  if (pending.length === 0) return result;

  let window = ZERO;
  for (let index = current - 11; index <= current; index += 1) {
    window = window.plus(valueAt(index));
  }
  let next = 0;
  for (let offset = 0; offset < projected.length && next < pending.length; offset += 1) {
    const index = current + offset + 1;
    window = window.plus(valueAt(index)).minus(valueAt(index - 12));
    const monthly = window.dividedBy(TWELVE);
    while (next < pending.length && monthly.gte(pending[next].needed)) {
      result.set(pending[next].id, refOf(index));
      next += 1;
    }
  }
  return result;
}
