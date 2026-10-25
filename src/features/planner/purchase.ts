import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import type { ForecastFacets, TwelveMonthForecast } from "@/features/securities/forecast";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import { countryLabel } from "@/lib/utils/countryLabel";

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
  /** Marktwert laut Depotstand (> 0). */
  marketValue: DecimalInstance;
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
        marketValue: item.marketValue.toDecimal(),
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

const NO_CAPS: ReadonlyMap<string, number> = new Map();

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
  /**
   * Zwoelf Monate der Prognose vorher und mit dem Plan, gleiche Reihenfolge.
   * Beim Sparplan im Hochlauf: Im k-ten Monat zaehlen k Raten.
   */
  before: Money[];
  after: Money[];
  /** Was unter der Positionsgrenze keinen Platz fand (beim Sparplan je Monat). */
  unplaced: Money;
}

/**
 * Verteilt `amount` in Schritten der Schrittweite (Rest geht an den
 * groessten Kauf):
 *
 * - **Mehr Dividende / Dividendenwachstum:** die besten `buys` Positionen nach
 *   Ertrag je Euro bzw. Dividende in fuenf Jahren, reihum zu gleichen Teilen.
 * - **Monate glaetten:** Schritt fuer Schritt an die Position, die die Summe
 *   der Abstaende unter dem Ø am staerksten verringert (bei Gleichstand der
 *   hoehere Ertrag); sind `buys` Positionen gewaehlt, nur noch an diese.
 *
 * **Positionsgrenze** (`capPercent`, seit 2.22.0): Keine Position waechst
 * ueber diesen Anteil am Depot nach dem Kauf. Positionen ohne Platz fuer den
 * Mindestbetrag fallen weg; ist eine gewaehlte voll, bekommen die uebrigen
 * mehr. Die Zahl der Kaeufe bleibt `buys`: Was darin keinen Platz findet,
 * bleibt `unplaced` (statt Kleinstkaeufe ueber die gewaehlte Zahl hinaus).
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
  capPercent = null,
  caps = NO_CAPS,
}: {
  forecast: TwelveMonthForecast;
  candidates: readonly PurchaseCandidate[];
  amount: number;
  focus: PlanFocus;
  mode: PlanMode;
  buys: number;
  /** Hoechstens so viel Prozent des Depots je Position; `null` ohne Grenze. */
  capPercent?: number | null;
  /** Eigene Grenzen je Asset (Prozent), sie gehen dem Standard vor. */
  caps?: ReadonlyMap<string, number>;
}): PurchasePlan | null {
  const { step, minimum } = MODE_RULES[mode];
  // Schrittweite: die des Modus oder ein Vielfaches davon (MAX_STEPS).
  const unit = step * Math.max(1, Math.ceil(amount / step / MAX_STEPS));
  const steps = Math.floor(amount / unit);
  const maxBuys = Math.max(1, Math.min(buys, Math.floor(amount / minimum)));
  const factor = mode === "sparplan" ? 12 : 1;
  const minSteps = Math.ceil(minimum / unit);

  // Platz je Position in Schritten: Grenze × Depot nach dem Kauf − Marktwert.
  const room = new Map<PurchaseCandidate, number>();
  for (const candidate of candidates) {
    const cap = caps.get(candidate.securityId) ?? capPercent;
    if (cap === null) {
      room.set(candidate, Number.POSITIVE_INFINITY);
      continue;
    }
    const limit = forecast.depotValue
      .toDecimal()
      .plus(amount * factor)
      .times(cap)
      .dividedBy(100);
    const free = limit.minus(candidate.marketValue).dividedBy(unit * factor);
    room.set(candidate, Math.max(0, Math.floor(free.toNumber())));
  }
  const eligible = candidates.filter(
    (candidate) => (room.get(candidate) ?? 0) >= Math.min(minSteps, steps),
  );
  if (eligible.length === 0 || steps === 0 || amount < minimum) {
    return candidates.length === 0 || steps === 0 || amount < minimum
      ? null
      : emptyPlan(forecast, amount);
  }

  const before = forecast.months.map((month) => month.total.toDecimal());
  const allocation = new Map<PurchaseCandidate, number>();
  const hasRoom = (candidate: PurchaseCandidate) =>
    (allocation.get(candidate) ?? 0) < (room.get(candidate) ?? 0);
  let placed = 0;

  if (focus === "monate") {
    // Nur zum Abwaegen in Gleitkomma: Die Reihenfolge haengt nicht an Cents,
    // und so bleibt die Rechnung auch bei vielen Schritten schnell. Betraege
    // rechnet unten wieder Decimal.
    const current = before.map((value) => value.toNumber());
    const ordered = [...eligible].sort(byScore(annualPerEuro));
    const perStep = new Map(
      ordered.map((candidate) => [
        candidate,
        candidate.perPayoutPerEuro.toNumber() * unit,
      ]),
    );
    const pays = forecast.months.map((month) => month.month);
    for (let index = 0; index < steps; index += 1) {
      const pool = (allocation.size < maxBuys ? ordered : [...allocation.keys()]).filter(
        hasRoom,
      );
      if (pool.length === 0) break;
      let best = pool[0];
      let bestGain = -Infinity;
      const base = shortfall(current);
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
      placed += 1;
      const added = perStep.get(best) ?? 0;
      pays.forEach((month, position) => {
        if (best.months.includes(month)) current[position] += added;
      });
    }
  } else {
    const score = focus === "wachstum" ? growthScore : annualPerEuro;
    const ordered = [...eligible].sort(byScore(score));
    const active = ordered.slice(0, maxBuys);
    for (let index = 0; index < steps; index += 1) {
      // Reihum: die Position mit den wenigsten Schritten, die noch Platz hat.
      let pick: PurchaseCandidate | undefined;
      for (const candidate of active) {
        if (!hasRoom(candidate)) continue;
        if (
          pick === undefined ||
          (allocation.get(candidate) ?? 0) < (allocation.get(pick) ?? 0)
        )
          pick = candidate;
      }
      if (pick === undefined) break;
      allocation.set(pick, (allocation.get(pick) ?? 0) + 1);
      placed += 1;
    }
  }

  // Unter dem Mindestbetrag: auf die groessten Kaeufe mit Platz umlegen.
  for (const [candidate, count] of [...allocation].sort((a, b) => a[1] - b[1])) {
    if (count >= minSteps || allocation.size === 1) continue;
    const target = [...allocation]
      .filter(
        ([other, taken]) =>
          other !== candidate && taken + count <= (room.get(other) ?? 0),
      )
      .sort((a, b) => b[1] - a[1])
      .at(0);
    if (target === undefined) continue;
    allocation.delete(candidate);
    allocation.set(target[0], target[1] + count);
  }

  const unplacedSteps = steps - placed;
  // Der Rest unter einem Schritt geht an den groessten Kauf, wenn alles Platz fand.
  const remainder = unplacedSteps === 0 ? amount - steps * unit : 0;
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
      if (!candidate.months.includes(month.month)) return;
      // Sparplan im Hochlauf: Im k-ten Monat sind erst k von zwoelf Raten angelegt.
      const share =
        mode === "sparplan" ? perPayout.times(position + 1).dividedBy(12) : perPayout;
      after[position] = after[position].plus(share);
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

  const unplaced = new MoneyDecimal(
    unplacedSteps * unit + (unplacedSteps > 0 ? amount - steps * unit : 0),
  );
  const invested = new MoneyDecimal(amount).minus(unplaced).times(factor);
  return {
    buys: planned,
    invested: Money.fromDecimal(invested, EUR),
    annual: Money.fromDecimal(annual, EUR),
    yieldPercent: invested.greaterThan(0) ? annual.dividedBy(invested).times(100) : ZERO,
    before: before.map((value) => Money.fromDecimal(value, EUR)),
    after: after.map((value) => Money.fromDecimal(value, EUR)),
    unplaced: Money.fromDecimal(unplaced, EUR),
  };
}

/** Kein Kandidat hat Platz unter der Grenze: nichts angelegt, alles uebrig. */
function emptyPlan(forecast: TwelveMonthForecast, amount: number): PurchasePlan {
  const months = forecast.months.map((month) => month.total);
  return {
    buys: [],
    invested: Money.zero(EUR),
    annual: Money.zero(EUR),
    yieldPercent: ZERO,
    before: months,
    after: months,
    unplaced: Money.fromDecimal(new MoneyDecimal(amount), EUR),
  };
}

export interface Concentration {
  /** Asset-Kennung (bei der Position) bzw. Branche oder Land. */
  key: string;
  name: string;
  /** Anteil am Depot in Prozent. */
  percent: DecimalInstance;
}

/**
 * Streuung nach dem Kauf (seit 2.22.0): groesste Position, Branche und Land
 * gemessen am Marktwert des Depotstands plus der Kaeufe (beim Sparplan zwoelf
 * Raten). Positionen ohne Branche oder Land zaehlen dort nicht als Gruppe.
 */
export function concentrationAfter({
  snapshots,
  facets,
  names,
  plan,
  mode,
}: {
  snapshots: readonly SecuritySnapshot[];
  facets: ReadonlyMap<string, ForecastFacets>;
  names: ReadonlyMap<string, string>;
  plan: PurchasePlan;
  mode: PlanMode;
}): {
  position: Concentration;
  sector: Concentration | null;
  country: Concentration | null;
} | null {
  const factor = mode === "sparplan" ? 12 : 1;
  const values = new Map<string, DecimalInstance>();
  for (const row of snapshotsAt(snapshots, latestAsOf(snapshots))) {
    if (row.market_value === null) continue;
    values.set(row.security_id, new MoneyDecimal(row.market_value));
  }
  for (const buy of plan.buys) {
    values.set(
      buy.securityId,
      (values.get(buy.securityId) ?? ZERO).plus(buy.invest.toDecimal().times(factor)),
    );
  }
  const total = [...values.values()].reduce((sum, value) => sum.plus(value), ZERO);
  if (!total.greaterThan(0)) return null;

  const top = (groups: Map<string, DecimalInstance>): Concentration | null => {
    let best: [string, DecimalInstance] | null = null;
    for (const entry of groups)
      if (best === null || entry[1].greaterThan(best[1])) best = entry;
    return best
      ? { key: best[0], name: best[0], percent: best[1].dividedBy(total).times(100) }
      : null;
  };
  const grouped = (key: "sector" | "country") => {
    const groups = new Map<string, DecimalInstance>();
    for (const [id, value] of values) {
      // Wie Bestand › Analyse: „us " und „US" sind dasselbe Land.
      const raw = facets.get(id)?.[key]?.trim();
      if (!raw) continue;
      const group = key === "country" ? raw.toUpperCase() : raw;
      groups.set(group, (groups.get(group) ?? ZERO).plus(value));
    }
    return top(groups);
  };
  const largest = top(values);
  const position = largest && {
    ...largest,
    name: names.get(largest.name) ?? "Unbekanntes Asset",
  };
  const country = grouped("country");
  return (
    position && {
      position,
      sector: grouped("sector"),
      country: country && { ...country, name: countryLabel(country.key) },
    }
  );
}
