import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import type { TwelveMonthForecast } from "@/features/securities/forecast";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import {
  PURCHASE_RULES,
  planPurchase,
  purchaseCandidates,
  type PlanFocus,
  type PurchasePlan,
} from "./purchase";

/**
 * Tausch (CALCULATION_RULES.md §16.1, seit 2.61.0): Was ändert sich, wenn
 * du ein Asset (ganz oder teilweise) verkaufst und den Erlös wieder anlegst?
 * Seit 2.62.0 verteilt der Nachkauf (§16) den Erlös auf mehrere Titel des
 * Bestands, statt ihn in einen einzigen zu stecken. Eine Rechnung beim
 * Anzeigen, keine Empfehlung; gespeichert wird nichts.
 */

/** Eine Position des jüngsten Depotstands, die verkauft oder gekauft werden kann. */
export interface SwapPosition {
  securityId: string;
  name: string;
  /** Marktwert laut Depotstand (> 0). */
  marketValue: DecimalInstance;
  /** Netto je Zahlung und Euro Marktwert; 0 ohne Ausschüttung. */
  perPayoutPerEuro: DecimalInstance;
  /** Zahlmonate (1–12) wie in der Prognose; leer ohne Ausschüttung. */
  months: readonly number[];
}

const ZERO = new MoneyDecimal(0);
const HUNDRED = new MoneyDecimal(100);

/**
 * Alle Positionen mit Marktwert > 0, nach Namen. Verkaufen lässt sich jede,
 * auch eine ohne Ausschüttung; Ertrag und Zahlmonate stammen aus der
 * Prognose (§14.1), damit Tausch, Nachkauf und Prognose dieselben Zahlen
 * nennen. Ausgeschlossene Assets (§16) zählen mit: Der Ausschluss betrifft
 * Vorschläge, hier wählst du selbst.
 */
export function swapPositions(
  forecast: TwelveMonthForecast,
  snapshots: readonly SecuritySnapshot[],
  names: ReadonlyMap<string, string>,
): SwapPosition[] {
  const payers = new Map(
    purchaseCandidates(forecast, snapshots, new Set()).map((candidate) => [
      candidate.securityId,
      candidate,
    ]),
  );
  const positions: SwapPosition[] = [];
  for (const row of snapshotsAt(snapshots, latestAsOf(snapshots))) {
    const payer = payers.get(row.security_id);
    if (payer) {
      positions.push(payer);
      continue;
    }
    const value = row.market_value === null ? ZERO : new MoneyDecimal(row.market_value);
    if (!value.greaterThan(0)) continue;
    positions.push({
      securityId: row.security_id,
      name: names.get(row.security_id) ?? "Unbekanntes Asset",
      marketValue: value,
      perPayoutPerEuro: ZERO,
      months: [],
    });
  }
  return positions.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Netto im Jahr je Euro. */
function annualPerEuro(position: SwapPosition): DecimalInstance {
  return position.perPayoutPerEuro.times(position.months.length);
}

export interface SwapPlan {
  /** Verkaufter Betrag (höchstens der Marktwert). */
  amount: Money;
  /** Netto im Jahr, das mit dem Verkauf wegfällt. */
  lost: Money;
  /** Rendite der verkauften Position netto in Prozent. */
  sellYieldPercent: DecimalInstance;
  /** Wiederanlage des Erlöses wie im Nachkauf (vorher = ohne den verkauften Teil). */
  purchase: PurchasePlan;
  /** Mehr (positiv) oder weniger netto im Jahr: Käufe minus Wegfall. */
  change: Money;
  /** Zwölf Monate der Prognose heute, ohne den Verkauf und nach dem Tausch. */
  before: Money[];
  withoutSale: Money[];
  after: Money[];
}

/**
 * Rechnet den Tausch durch: `amount` Euro von `sell` (höchstens sein
 * Marktwert) fallen in dessen Zahlmonaten aus der Prognose; der Erlös wird
 * mit {@link planPurchase} auf höchstens `buys` andere Positionen verteilt —
 * mit denselben Zielgewichtungen, Ausschlüssen und Schwerpunkten wie im
 * Nachkauf. Weil der Depotwert gleich bleibt, rechnet der Nachkauf mit dem
 * Depot ohne den verkauften Teil (er schlägt den Kauf wieder darauf).
 * `null` ohne Betrag.
 */
export function planSwap({
  forecast,
  snapshots,
  sell,
  amount,
  focus,
  buys,
  caps,
  excluded,
  capPercent,
}: {
  forecast: TwelveMonthForecast;
  snapshots: readonly SecuritySnapshot[];
  sell: SwapPosition;
  amount: number;
  focus: PlanFocus;
  buys: number;
  caps: ReadonlyMap<string, number>;
  excluded: ReadonlySet<string>;
  capPercent: number | null;
}): SwapPlan | null {
  if (!(amount > 0)) return null;
  const invest = MoneyDecimal.min(new MoneyDecimal(amount), sell.marketValue);
  const lostPerPayout = Money.fromDecimal(sell.perPayoutPerEuro.times(invest), EUR);
  const zero = Money.zero(EUR);

  const reduced: TwelveMonthForecast = {
    ...forecast,
    months: forecast.months.map((month) => ({
      ...month,
      total: month.total.subtract(
        sell.months.includes(month.month) ? lostPerPayout : zero,
      ),
    })),
    depotValue: forecast.depotValue.subtract(Money.fromDecimal(invest, EUR)),
  };
  const candidates = purchaseCandidates(
    forecast,
    snapshots,
    new Set([...excluded, sell.securityId]),
  );
  // Streuen statt ballen (seit 2.62.0): Jeder Kauf bekommt höchstens seinen
  // Teil des Erlöses (Erlös ÷ Käufe, auf die Schrittweite aufgerundet, damit
  // kein Rest liegen bleibt), auch wenn „Monate glätten" sonst alles
  // in den besten Lückenfüller steckte. Die eigene Zielgewichtung bleibt die
  // Obergrenze; wer keine hat, bleibt beim Standard.
  const step = PURCHASE_RULES.step;
  const share = invest.dividedBy(Math.max(1, buys)).dividedBy(step).ceil().times(step);
  const depotAfter = forecast.depotValue.toDecimal();
  const spreadCaps = new Map<string, number>();
  if (buys > 1 && depotAfter.greaterThan(0)) {
    for (const candidate of candidates) {
      const cap = caps.get(candidate.securityId) ?? capPercent;
      if (cap === 0) continue;
      // Ein Hauch über dem Teil, damit Rundung den letzten Schritt nicht frisst.
      const even =
        candidate.marketValue
          .plus(share)
          .dividedBy(depotAfter)
          .times(HUNDRED)
          .toNumber() + 1e-9;
      spreadCaps.set(candidate.securityId, cap === null ? even : Math.min(cap, even));
    }
  }
  const purchase = planPurchase({
    forecast: reduced,
    candidates,
    amount: invest.toNumber(),
    focus,
    buys,
    capPercent,
    caps: spreadCaps.size > 0 ? new Map([...caps, ...spreadCaps]) : caps,
  });
  if (purchase === null) return null;

  const lost = sell.months.reduce((sum) => sum.add(lostPerPayout), zero);
  return {
    amount: Money.fromDecimal(invest, EUR),
    lost,
    sellYieldPercent: annualPerEuro(sell).times(HUNDRED),
    purchase,
    change: purchase.annual.subtract(lost),
    before: forecast.months.map((month) => month.total),
    withoutSale: reduced.months.map((month) => month.total),
    after: purchase.after,
  };
}
