import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import type { TwelveMonthForecast } from "@/features/securities/forecast";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";

/**
 * Nachkauf-Planer (CALCULATION_RULES.md §16): verteilt einen Betrag auf
 * Positionen des eigenen Bestands und rechnet aus, was er an Nettodividende
 * bringt. Eine Rechnung beim Anzeigen, keine Empfehlung; gespeichert wird
 * nichts.
 */

export type PlanMode = "einmal" | "sparplan";
export type PlanFocus = "dividende" | "monate" | "wachstum";

/** Grenzen je Modus: Schrittweite, Mindestbetrag je Kauf, Auswahl der Anzahl. */
export const MODE_RULES: Record<
  PlanMode,
  {
    step: number;
    minimum: number;
    maxBuys: number;
    defaultBuys: number;
    /** Vorbelegter Betrag (beim Sparplan je Monat). */
    defaultAmount: number;
  }
> = {
  einmal: { step: 50, minimum: 100, maxBuys: 5, defaultBuys: 3, defaultAmount: 3000 },
  sparplan: { step: 25, minimum: 25, maxBuys: 10, defaultBuys: 5, defaultAmount: 1000 },
};

/** Eine Position, die nachgekauft werden kann. */
export interface PurchaseCandidate {
  securityId: string;
  name: string;
  /** Netto je Zahlung und Euro Marktwert. */
  perPayoutPerEuro: DecimalInstance;
  /** Zahlmonate (1–12) wie in der Prognose. */
  months: readonly number[];
  /** Kurs laut Depotstand; `null`, wenn die Quelle keinen nennt. */
  price: DecimalInstance | null;
  /** Dividenden-CAGR als Anteil (0,07 = 7 %); `null` ohne Angabe. */
  cagr: DecimalInstance | null;
}

const ZERO = new MoneyDecimal(0);
const ONE = new MoneyDecimal(1);
const CAGR_MAX = new MoneyDecimal("0.15");
const GROWTH_YEARS = 5;

/**
 * Kandidaten aus der Prognose: jede Position mit Marktwert > 0 und
 * Ausschuettung, die nicht ausgeschlossen ist. Ertrag und Zahlmonate stammen
 * aus der Prognose (§14.1), damit Planer und Prognose dieselben Zahlen nennen.
 */
export function purchaseCandidates(
  forecast: TwelveMonthForecast,
  snapshots: readonly SecuritySnapshot[],
  excluded: ReadonlySet<string>,
): PurchaseCandidate[] {
  const rows = new Map(
    snapshotsAt(snapshots, latestAsOf(snapshots)).map((row) => [row.security_id, row]),
  );
  const byId = new Map<string, PurchaseCandidate & { months: number[] }>();
  for (const month of forecast.months) {
    for (const item of month.contributions) {
      if (excluded.has(item.securityId)) continue;
      const known = byId.get(item.securityId);
      if (known) {
        known.months.push(month.month);
        continue;
      }
      if (!item.marketValue?.isPositive()) continue;
      if (!item.amount.isPositive()) continue;
      const row = rows.get(item.securityId);
      const price = row?.price ? new MoneyDecimal(row.price) : null;
      byId.set(item.securityId, {
        securityId: item.securityId,
        name: item.name,
        perPayoutPerEuro: item.amount.toDecimal().dividedBy(item.marketValue.toDecimal()),
        months: [month.month],
        price: price?.greaterThan(0) ? price : null,
        cagr: row?.dividend_cagr ? new MoneyDecimal(row.dividend_cagr) : null,
      });
    }
  }
  return [...byId.values()].map((candidate) => ({
    ...candidate,
    months: [...candidate.months].sort((a, b) => a - b),
  }));
}

/** Netto im Jahr je investiertem Euro. */
function annualPerEuro(candidate: PurchaseCandidate): DecimalInstance {
  return candidate.perPayoutPerEuro.times(candidate.months.length);
}

/** Dividende in fuenf Jahren je Euro: Ertrag × (1 + CAGR)^5, CAGR auf 0–15 % begrenzt. */
function growthScore(candidate: PurchaseCandidate): DecimalInstance {
  const cagr = MoneyDecimal.min(MoneyDecimal.max(candidate.cagr ?? ZERO, ZERO), CAGR_MAX);
  return annualPerEuro(candidate).times(ONE.plus(cagr).pow(GROWTH_YEARS));
}

function byScore(
  score: (candidate: PurchaseCandidate) => DecimalInstance,
): (a: PurchaseCandidate, b: PurchaseCandidate) => number {
  return (a, b) =>
    score(b).comparedTo(score(a)) ||
    annualPerEuro(b).comparedTo(annualPerEuro(a)) ||
    a.name.localeCompare(b.name, "de");
}

/** Summe der Abstaende aller Monate unter ihrem Ø. */
function shortfall(months: readonly number[]): number {
  const average = months.reduce((sum, value) => sum + value, 0) / months.length;
  return months.reduce(
    (sum, value) => (value < average ? sum + average - value : sum),
    0,
  );
}

/** Hoechstens so viele Schritte; groessere Betraege verteilen in groesseren. */
const MAX_STEPS = 200;

export interface PlannedBuy {
  securityId: string;
  name: string;
  /** Betrag je Kauf (beim Sparplan je Monat). */
  invest: Money;
  /** Ungefaehre Stueckzahl zum letzten Kurs; `null` ohne Kurs. */
  shares: DecimalInstance | null;
  /** Mehr netto im Jahr (beim Sparplan nach zwoelf Monaten). */
  annual: Money;
  months: readonly number[];
}

export interface PurchasePlan {
  buys: PlannedBuy[];
  /** Investiert insgesamt (beim Sparplan zwoelf Raten). */
  invested: Money;
  annual: Money;
  /** Ertrag des Plans: annual ÷ invested × 100. */
  yieldPercent: DecimalInstance;
  /** Zwoelf Monate der Prognose vorher und mit dem Plan, gleiche Reihenfolge. */
  before: Money[];
  after: Money[];
}

/**
 * Verteilt `amount` in Schritten der Schrittweite (Rest geht an den
 * groessten Kauf):
 *
 * - **Mehr Dividende / Dividendenwachstum:** die besten `buys` Positionen nach
 *   Ertrag je Euro bzw. Dividende in fuenf Jahren, zu gleichen Teilen.
 * - **Monate glaetten:** Schritt fuer Schritt an die Position, die die Summe
 *   der Abstaende unter dem Ø am staerksten verringert (bei Gleichstand der
 *   hoehere Ertrag); sind `buys` Positionen gewaehlt, nur noch an diese.
 *
 * Weniger als der Mindestbetrag je Kauf wird auf die verbleibenden Kaeufe
 * umgelegt. Beim Sparplan ist `amount` die Monatsrate; die Wirkung zaehlt
 * zwoelf Raten.
 */
export function planPurchase({
  forecast,
  candidates,
  amount,
  focus,
  mode,
  buys,
}: {
  forecast: TwelveMonthForecast;
  candidates: readonly PurchaseCandidate[];
  amount: number;
  focus: PlanFocus;
  mode: PlanMode;
  buys: number;
}): PurchasePlan | null {
  const { step, minimum } = MODE_RULES[mode];
  // Schrittweite: die des Modus oder ein Vielfaches davon (MAX_STEPS).
  const unit = step * Math.max(1, Math.ceil(amount / step / MAX_STEPS));
  const steps = Math.floor(amount / unit);
  const maxBuys = Math.max(1, Math.min(buys, Math.floor(amount / minimum)));
  if (candidates.length === 0 || steps === 0 || amount < minimum) return null;

  const before = forecast.months.map((month) => month.total.toDecimal());
  const allocation = new Map<PurchaseCandidate, number>();

  if (focus === "monate") {
    // Nur zum Abwaegen in Gleitkomma: Die Reihenfolge haengt nicht an Cents,
    // und so bleibt die Rechnung auch bei vielen Schritten schnell. Betraege
    // rechnet unten wieder Decimal.
    const current = before.map((value) => value.toNumber());
    const ordered = [...candidates].sort(byScore(annualPerEuro));
    const perStep = new Map(
      ordered.map((candidate) => [
        candidate,
        candidate.perPayoutPerEuro.toNumber() * unit,
      ]),
    );
    const pays = forecast.months.map((month) => month.month);
    for (let index = 0; index < steps; index += 1) {
      const pool = allocation.size < maxBuys ? ordered : [...allocation.keys()];
      const base = shortfall(current);
      let best = pool[0];
      let bestGain = -Infinity;
      for (const candidate of pool) {
        const added = perStep.get(candidate) ?? 0;
        const next = current.map((value, position) =>
          candidate.months.includes(pays[position]) ? value + added : value,
        );
        const gain = base - shortfall(next);
        // Mehr als Rundungsrauschen, sonst gilt der hoehere Ertrag (Reihenfolge).
        if (gain > bestGain + 1e-9) {
          best = candidate;
          bestGain = gain;
        }
      }
      allocation.set(best, (allocation.get(best) ?? 0) + 1);
      const added = perStep.get(best) ?? 0;
      pays.forEach((month, position) => {
        if (best.months.includes(month)) current[position] += added;
      });
    }
    // Unter dem Mindestbetrag: auf die groessten Kaeufe umlegen.
    const minSteps = Math.ceil(minimum / unit);
    for (const [candidate, count] of [...allocation].sort((a, b) => a[1] - b[1])) {
      if (count >= minSteps || allocation.size === 1) continue;
      allocation.delete(candidate);
      const largest = [...allocation].sort((a, b) => b[1] - a[1])[0][0];
      allocation.set(largest, (allocation.get(largest) ?? 0) + count);
    }
  } else {
    const score = focus === "wachstum" ? growthScore : annualPerEuro;
    const chosen = [...candidates].sort(byScore(score)).slice(0, maxBuys);
    chosen.forEach((candidate, index) => {
      const share =
        Math.floor(steps / chosen.length) + (index < steps % chosen.length ? 1 : 0);
      if (share > 0) allocation.set(candidate, share);
    });
  }

  const factor = mode === "sparplan" ? 12 : 1;
  const remainder = amount - steps * unit;
  const sorted = [...allocation].sort(
    (a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name, "de"),
  );
  const after = [...before];
  let annual = ZERO;
  const planned = sorted.map(([candidate, count], index): PlannedBuy => {
    const invest = new MoneyDecimal(count * unit + (index === 0 ? remainder : 0));
    const total = invest.times(factor);
    const perPayout = candidate.perPayoutPerEuro.times(total);
    forecast.months.forEach((month, position) => {
      if (candidate.months.includes(month.month))
        after[position] = after[position].plus(perPayout);
    });
    const yearly = perPayout.times(candidate.months.length);
    annual = annual.plus(yearly);
    return {
      securityId: candidate.securityId,
      name: candidate.name,
      invest: Money.fromDecimal(invest, EUR),
      shares: candidate.price ? invest.dividedBy(candidate.price) : null,
      annual: Money.fromDecimal(yearly, EUR),
      months: candidate.months,
    };
  });

  const invested = new MoneyDecimal(amount).times(factor);
  return {
    buys: planned,
    invested: Money.fromDecimal(invested, EUR),
    annual: Money.fromDecimal(annual, EUR),
    yieldPercent: annual.dividedBy(invested).times(100),
    before: before.map((value) => Money.fromDecimal(value, EUR)),
    after: after.map((value) => Money.fromDecimal(value, EUR)),
  };
}
