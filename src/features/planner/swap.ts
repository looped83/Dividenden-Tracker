import { EUR, Money, MoneyDecimal, type DecimalInstance } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import type { TwelveMonthForecast } from "@/features/securities/forecast";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import { purchaseCandidates } from "./purchase";

/**
 * Tausch-Simulator (CALCULATION_RULES.md §16.1, seit 2.60.0): Was ändert
 * sich, wenn du einen Teil von A verkaufst und den Erlös in B steckst? Eine
 * Rechnung beim Anzeigen wie der Nachkauf, keine Empfehlung; gespeichert wird
 * nichts.
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
  /** Kurs laut Depotstand; `null`, wenn die Quelle keinen nennt. */
  price: DecimalInstance | null;
  /** Dividenden-CAGR als Anteil; `null` ohne Angabe. */
  cagr: DecimalInstance | null;
}

const ZERO = new MoneyDecimal(0);
const ONE = new MoneyDecimal(1);
const HUNDRED = new MoneyDecimal(100);
const CAGR_MAX = new MoneyDecimal("0.15");
const GROWTH_YEARS = 5;

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
    const price = row.price ? new MoneyDecimal(row.price) : null;
    positions.push({
      securityId: row.security_id,
      name: names.get(row.security_id) ?? "Unbekanntes Asset",
      marketValue: value,
      perPayoutPerEuro: ZERO,
      months: [],
      price: price?.greaterThan(0) ? price : null,
      cagr: row.dividend_cagr ? new MoneyDecimal(row.dividend_cagr) : null,
    });
  }
  return positions.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Netto im Jahr je Euro. */
function annualPerEuro(position: SwapPosition): DecimalInstance {
  return position.perPayoutPerEuro.times(position.months.length);
}

/** Wachstumsfaktor über fünf Jahre, CAGR auf 0–15 % begrenzt (wie §16). */
function growth(cagr: DecimalInstance): DecimalInstance {
  return ONE.plus(MoneyDecimal.min(MoneyDecimal.max(cagr, ZERO), CAGR_MAX)).pow(
    GROWTH_YEARS,
  );
}

export interface SwapLeg {
  position: SwapPosition;
  /** Netto im Jahr, das dieser Teil bringt (verkauft: fällt weg). */
  annual: Money;
  /** Rendite netto in Prozent. */
  yieldPercent: DecimalInstance;
  /** Ungefähre Stückzahl zum letzten Kurs; `null` ohne Kurs. */
  shares: DecimalInstance | null;
  /** Anteil am Depot vorher und nachher in Prozent. */
  shareBefore: DecimalInstance;
  shareAfter: DecimalInstance;
}

export interface SwapPlan {
  amount: Money;
  sell: SwapLeg;
  buy: SwapLeg;
  /** Mehr (positiv) oder weniger netto im Jahr. */
  change: Money;
  /** Zwölf Monate der Prognose vorher und nach dem Tausch, gleiche Reihenfolge. */
  before: Money[];
  after: Money[];
  /** Je Monat: was durch den Verkauf wegfällt und durch den Kauf dazukommt. */
  lost: Money[];
  gained: Money[];
  /**
   * Veränderung in fünf Jahren mit dem Dividendenwachstum beider Seiten;
   * `null`, wenn einer ausschüttenden Seite der CAGR fehlt.
   */
  changeInFiveYears: Money | null;
}

/**
 * Rechnet den Tausch durch: `amount` Euro von `sell` (höchstens sein
 * Marktwert) wandern zu `buy`. Je Monat fällt der Anteil der Zahlung von
 * `sell` weg und kommt der Ertrag von `buy` je Euro dazu; der Depotwert
 * bleibt gleich. `null` ohne Betrag oder bei gleicher Position.
 */
export function planSwap({
  forecast,
  sell,
  buy,
  amount,
}: {
  forecast: TwelveMonthForecast;
  sell: SwapPosition;
  buy: SwapPosition;
  amount: number;
}): SwapPlan | null {
  if (sell.securityId === buy.securityId || !(amount > 0)) return null;
  const invest = MoneyDecimal.min(new MoneyDecimal(amount), sell.marketValue);
  const toMoney = (value: DecimalInstance) => Money.fromDecimal(value, EUR);

  const lostPerPayout = sell.perPayoutPerEuro.times(invest);
  const gainedPerPayout = buy.perPayoutPerEuro.times(invest);
  const before: Money[] = [];
  const after: Money[] = [];
  const lost: Money[] = [];
  const gained: Money[] = [];
  for (const month of forecast.months) {
    const out = sell.months.includes(month.month) ? toMoney(lostPerPayout) : toMoney(ZERO);
    const add = buy.months.includes(month.month) ? toMoney(gainedPerPayout) : toMoney(ZERO);
    before.push(month.total);
    lost.push(out);
    gained.push(add);
    after.push(month.total.subtract(out).add(add));
  }
  const sum = (values: Money[]) => values.reduce((total, value) => total.add(value));
  const lostAnnual = sum(lost);
  const gainedAnnual = sum(gained);

  const depot = forecast.depotValue.toDecimal();
  const share = (value: DecimalInstance) =>
    depot.greaterThan(0) ? value.dividedBy(depot).times(HUNDRED) : ZERO;
  const leg = (
    position: SwapPosition,
    annual: Money,
    valueAfter: DecimalInstance,
  ): SwapLeg => ({
    position,
    annual,
    yieldPercent: annualPerEuro(position).times(HUNDRED),
    shares: position.price ? invest.dividedBy(position.price) : null,
    shareBefore: share(position.marketValue),
    shareAfter: share(valueAfter),
  });

  const grows = (position: SwapPosition) =>
    position.months.length === 0 ? ONE : position.cagr ? growth(position.cagr) : null;
  const sellGrowth = grows(sell);
  const buyGrowth = grows(buy);

  return {
    amount: toMoney(invest),
    sell: leg(sell, lostAnnual, sell.marketValue.minus(invest)),
    buy: leg(buy, gainedAnnual, buy.marketValue.plus(invest)),
    change: gainedAnnual.subtract(lostAnnual),
    before,
    after,
    lost,
    gained,
    changeInFiveYears:
      sellGrowth && buyGrowth
        ? toMoney(
            gainedAnnual
              .toDecimal()
              .times(buyGrowth)
              .minus(lostAnnual.toDecimal().times(sellGrowth)),
          )
        : null,
  };
}

/**
 * Andere Kaufziele für denselben Verkauf: die ausschüttenden Positionen mit
 * dem höchsten Ertrag je Euro, ohne verkaufte und gewählte. Was jede im Jahr
 * gegenüber dem Behalten ändert, rechnet die Oberfläche mit {@link planSwap}.
 */
export function swapAlternatives(
  positions: readonly SwapPosition[],
  exclude: readonly string[],
  limit: number,
): SwapPosition[] {
  return positions
    .filter(
      (position) =>
        position.months.length > 0 && !exclude.includes(position.securityId),
    )
    .sort(
      (a, b) =>
        annualPerEuro(b).comparedTo(annualPerEuro(a)) || a.name.localeCompare(b.name, "de"),
    )
    .slice(0, limit);
}
