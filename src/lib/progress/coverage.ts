import { EUR, Money, MoneyDecimal, sumMoney, type DecimalInstance } from "@/lib/money";

/** Alle wie viele Monate eine Position fällig wird (seit 2.34.0). */
export type FixedCostInterval = 1 | 3 | 6 | 12;

export const FIXED_COST_INTERVALS: readonly FixedCostInterval[] = [1, 3, 6, 12];

/** Eine Fixkostenposition (profiles.fixed_costs). */
export interface FixedCost {
  /** Kennung für Detailseite und Liste; kurz, weil die Liste 4 KB nicht überschreiten darf. */
  id: string;
  name: string;
  /** Betrag je Fälligkeit, > 0. */
  payment: Money;
  interval: FixedCostInterval;
  /** Auf den Monat umgerechnet (`payment ÷ interval`); damit rechnet die Deckung. */
  amount: Money;
}

/** Eine Position aus Betrag je Fälligkeit und Rhythmus (CALCULATION_RULES.md §15.1). */
export function fixedCost(
  id: string,
  name: string,
  payment: Money,
  interval: FixedCostInterval = 1,
): FixedCost {
  return {
    id,
    name,
    payment,
    interval,
    amount:
      interval === 1
        ? payment
        : Money.fromDecimal(payment.toDecimal().div(interval), payment.currency),
  };
}

/** Im Jahr: aus dem Betrag je Fälligkeit, nicht aus dem gerundeten Monatsbetrag. */
export function yearlyCost(cost: FixedCost): Money {
  return Money.fromDecimal(
    cost.payment.toDecimal().times(12 / cost.interval),
    cost.payment.currency,
  );
}

export type CoverageStatus = "covered" | "next" | "open";

export interface CostCoverage {
  cost: FixedCost;
  status: CoverageStatus;
  /** Gedeckter Anteil 0–100; gedeckt 100, offen 0. */
  percent: DecimalInstance;
  /** Was im Monat noch fehlt; gedeckt 0. */
  missing: Money;
}

export interface CoverageResult {
  items: CostCoverage[];
  covered: number;
  total: Money;
  /** Gedeckter Anteil aller Fixkosten 0–100; `null` ohne Fixkosten. */
  share: DecimalInstance | null;
  next: CostCoverage | null;
}

const HUNDRED = new MoneyDecimal(100);

/**
 * Welche Fixkosten die Dividende eines Monats bezahlt (CALCULATION_RULES.md
 * §15.1). Die günstigste Position zuerst: So ist jede gedeckte Position ein
 * Schritt, und die nächste ist immer die, die am wenigsten fehlt. Was nach
 * den gedeckten Positionen übrig bleibt, zählt anteilig für die nächste.
 */
export function coverFixedCosts(
  costs: readonly FixedCost[],
  monthly: Money,
): CoverageResult {
  const sorted = [...costs].sort(
    (a, b) => a.amount.compareTo(b.amount) || a.name.localeCompare(b.name, "de"),
  );
  const total = sumMoney(
    sorted.map((cost) => cost.amount),
    EUR,
  );
  let rest = monthly.isNegative() ? Money.zero(EUR) : monthly;
  let next: CostCoverage | null = null;
  const items = sorted.map((cost): CostCoverage => {
    if (next === null && rest.compareTo(cost.amount) >= 0) {
      rest = rest.subtract(cost.amount);
      return { cost, status: "covered", percent: HUNDRED, missing: Money.zero(EUR) };
    }
    if (next === null) {
      next = {
        cost,
        status: "next",
        percent: rest.toDecimal().div(cost.amount.toDecimal()).times(HUNDRED),
        missing: cost.amount.subtract(rest),
      };
      return next;
    }
    return { cost, status: "open", percent: new MoneyDecimal(0), missing: cost.amount };
  });

  const covered = items.filter((item) => item.status === "covered").length;
  // Der Anteil endet bei 100 %: Mehr als alle Fixkosten deckt nichts zusätzlich.
  const paid = MoneyDecimal.min(
    total.toDecimal(),
    MoneyDecimal.max(0, monthly.toDecimal()),
  );
  return {
    items,
    covered,
    total,
    share: total.isPositive() ? paid.div(total.toDecimal()).times(HUNDRED) : null,
    next,
  };
}
