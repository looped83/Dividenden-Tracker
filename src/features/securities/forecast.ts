/**
 * Prognose der naechsten zwoelf Monate (Bestand › Prognose).
 *
 * Reine Funktionen wie `analysis.ts`: ohne Oberflaeche, ohne Datenbank. Das
 * Ergebnis ist eine **Schaetzung** und wird nirgends gespeichert; es fliesst
 * weder in Statistik noch in Ziele (PRODUCT_SPEC.md Grundsatz 8,
 * CALCULATION_RULES.md §14).
 *
 * Grundlage ist die erwartete Jahresdividende des juengsten Depotstands,
 * verteilt auf die Ausschuettungsmonate der Position und mit der eigenen
 * Netto-Quote auf netto gerechnet. Die Jahresdividende des Exports ist brutto
 * (Dividendenrate × Stueck). Angekuendigte Kalendertermine fliessen bewusst
 * nicht ein: Der Kalender reicht nur ein, zwei Monate voraus und wuerde die
 * Reihe nur am Anfang anders faerben.
 */
import {
  EUR,
  Money,
  MoneyDecimal,
  toCurrencyCode,
  type CurrencyCode,
  type DecimalInstance,
} from "@/lib/money";
import {
  isInRange,
  isoDate,
  monthOf,
  trailingYearRange,
  type RefDate,
} from "@/lib/statistics/dates";
import type { AnalyticsPayment } from "@/lib/statistics/types";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import type { DividendFrequency } from "@/lib/supabase/database.types";
import { effectiveFrequency } from "./analysis";
import { latestAsOf, snapshotsAt } from "./snapshots";

/** Stammdaten je Position, die der Depotstand nicht traegt. */
export interface ForecastFacets {
  name: string;
  /** Gepflegte Ausschuettungsmonate (1–12); leer, wenn nicht gepflegt. */
  payoutMonths: readonly number[];
}

/** Ein Beitrag zu einem Monat. */
export interface ForecastContribution {
  securityId: string;
  name: string;
  amount: Money;
  /** Zahlungen im Jahr (Zahl der Ausschuettungsmonate). */
  payouts: number;
  /** Marktwert laut Depotstand; `null`, wenn die Quelle keinen nennt. */
  marketValue: Money | null;
}

export interface ForecastMonth {
  year: number;
  /** 1–12 */
  month: number;
  total: Money;
  /** Groesster Beitrag zuerst. */
  contributions: ForecastContribution[];
}

export interface TwelveMonthForecast {
  asOf: string;
  months: ForecastMonth[];
  total: Money;
  /** Erhalten in den zwoelf Monaten, die heute enden (netto). */
  receivedLast12: Money;
  /** Netto ÷ brutto der letzten zwoelf Monate; `null` ohne Bruttobetraege. */
  netRatio: DecimalInstance | null;
  /** Gehaltene Positionen, fuer die die Quelle keine Jahresdividende nennt. */
  withoutAmount: number;
}

export type ForecastResult =
  | { kind: "ok"; forecast: TwelveMonthForecast }
  | { kind: "empty" }
  | { kind: "mixedCurrency" };

const ONE = new MoneyDecimal(1);
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const STEP_BY_FREQUENCY: Partial<Record<DividendFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  biannually: 6,
  annually: 12,
};

/**
 * Anteil, der von brutto netto ankommt, ueber die zwoelf Monate bis heute.
 *
 * Bewusst die eigene Quote statt eines Steuersatzes: Sie enthaelt
 * Quellensteuer, Abgeltungsteuer und Freistellungsauftrag so, wie sie
 * tatsaechlich gewirkt haben, ohne dass die App Steuerregeln kennen muss.
 * Begrenzt auf hoechstens 1 — Korrekturbuchungen koennen netto ueber brutto
 * heben, mehr als alles kommt aber nie an.
 */
export function netRatio(
  payments: readonly AnalyticsPayment[],
  todayIso: string,
): DecimalInstance | null {
  const range = trailingYearRange(todayIso);
  let net = new MoneyDecimal(0);
  let gross = new MoneyDecimal(0);
  for (const payment of payments) {
    if (!isInRange(payment.actualPayDate, range)) continue;
    if (payment.grossAmount.currency !== EUR || payment.netAmount.currency !== EUR)
      continue;
    net = net.plus(payment.netAmount.toDecimal());
    gross = gross.plus(payment.grossAmount.toDecimal());
  }
  if (!gross.greaterThan(0) || !net.greaterThan(0)) return null;
  return MoneyDecimal.min(net.dividedBy(gross), ONE);
}

/** Die zwoelf vollen Monate nach dem laufenden. */
export function forecastWindow(today: RefDate): { year: number; month: number }[] {
  return Array.from({ length: 12 }, (_, index) => {
    const offset = today.month + index; // 0-basiert ab Januar des Jahres
    return { year: today.year + Math.floor(offset / 12), month: (offset % 12) + 1 };
  });
}

/**
 * Monate, in denen eine Position zahlt — in dieser Rangfolge:
 * gepflegte Ausschuettungsmonate, die Monate ihrer Zahlungen der letzten zwoelf
 * Monate, der Rhythmus des Exports ab dem naechsten Zahltag. Ohne jede Angabe
 * verteilt sich die Jahresdividende gleichmaessig — als Schaetzung beschriftet,
 * wie alles hier.
 */
export function payoutMonthsOf(
  facets: ForecastFacets | undefined,
  recentMonths: ReadonlySet<number> | undefined,
  snapshot: SecuritySnapshot,
): readonly number[] {
  const maintained = facets?.payoutMonths ?? [];
  if (maintained.length > 0) return maintained;
  if (recentMonths && recentMonths.size > 0)
    return [...recentMonths].sort((a, b) => a - b);

  const frequency = effectiveFrequency(snapshot.dividend_frequency, maintained);
  const step = frequency ? STEP_BY_FREQUENCY[frequency] : undefined;
  if (step !== undefined && snapshot.next_pay_date !== null) {
    const anchor = monthOf(snapshot.next_pay_date);
    return ALL_MONTHS.filter((month) => (month - anchor + 12) % step === 0);
  }
  return ALL_MONTHS;
}

/**
 * Prognose fuer die zwoelf vollen Monate nach dem laufenden.
 */
export function forecastTwelveMonths({
  snapshots,
  facets,
  payments,
  today,
}: {
  snapshots: readonly SecuritySnapshot[];
  facets: ReadonlyMap<string, ForecastFacets>;
  payments: readonly AnalyticsPayment[];
  today: RefDate;
}): ForecastResult {
  const asOf = latestAsOf(snapshots);
  const rows = snapshotsAt(snapshots, asOf);
  if (asOf === null || rows.length === 0) return { kind: "empty" };
  if (new Set(rows.map((row) => row.currency)).size > 1) return { kind: "mixedCurrency" };
  const currency: CurrencyCode = toCurrencyCode(rows[0].currency);
  // Die Zahlungen stehen in Euro; ein Stand in anderer Waehrung liesse sich
  // mit ihrer Netto-Quote nicht ehrlich verrechnen.
  if (currency !== EUR) return { kind: "mixedCurrency" };

  const todayIso = isoDate(today.year, today.month, today.day);
  const ratio = netRatio(payments, todayIso);
  const factor = ratio ?? ONE;

  const recentRange = trailingYearRange(todayIso);
  const recentMonthsBySecurity = new Map<string, Set<number>>();
  let receivedLast12 = Money.zero(EUR);
  for (const payment of payments) {
    if (!isInRange(payment.actualPayDate, recentRange)) continue;
    if (payment.netAmount.currency === EUR)
      receivedLast12 = receivedLast12.add(payment.netAmount);
    const months = recentMonthsBySecurity.get(payment.securityId);
    if (months) months.add(monthOf(payment.payDate));
    else
      recentMonthsBySecurity.set(payment.securityId, new Set([monthOf(payment.payDate)]));
  }

  const months: ForecastMonth[] = forecastWindow(today).map(({ year, month }) => ({
    year,
    month,
    total: Money.zero(currency),
    contributions: [],
  }));

  let withoutAmount = 0;
  for (const row of rows) {
    if (row.annual_dividend_total === null) {
      withoutAmount += 1;
      continue;
    }
    if (row.dividend_frequency === "none") continue;
    const annual = new MoneyDecimal(row.annual_dividend_total);
    if (!annual.greaterThan(0)) continue;

    const payout = new Set(
      payoutMonthsOf(
        facets.get(row.security_id),
        recentMonthsBySecurity.get(row.security_id),
        row,
      ),
    );
    const amount = Money.fromDecimal(
      annual.times(factor).dividedBy(payout.size),
      currency,
    );
    const name = facets.get(row.security_id)?.name ?? "Unbekannt";
    const marketValue =
      row.market_value === null ? null : Money.fromString(row.market_value, currency);
    for (const month of months) {
      if (!payout.has(month.month)) continue;
      month.total = month.total.add(amount);
      month.contributions.push({
        securityId: row.security_id,
        name,
        amount,
        payouts: payout.size,
        marketValue,
      });
    }
  }

  let total = Money.zero(currency);
  for (const month of months) {
    month.contributions.sort((a, b) => b.amount.compareTo(a.amount));
    total = total.add(month.total);
  }

  if (total.isZero() && receivedLast12.isZero()) return { kind: "empty" };

  return {
    kind: "ok",
    forecast: { asOf, months, total, receivedLast12, netRatio: ratio, withoutAmount },
  };
}

/** Ein Monat unter dem Durchschnitt der Prognose. */
export interface MonthGap {
  year: number;
  month: number;
  total: Money;
  /** Abstand zum Ø-Monat. */
  gap: Money;
  /** Gehaltene Position, deren Zukauf die Luecke am guenstigsten schliesst. */
  filler: { securityId: string; name: string; payouts: number; invest: Money } | null;
}

const INVEST_STEP = new MoneyDecimal(100);

/**
 * Monatsluecken (CALCULATION_RULES.md §14.3): Monate der Prognose unter ihrem
 * Ø-Monat, je mit einem Fueller aus dem eigenen Bestand.
 *
 * Fueller ist eine Position, die in dem Monat zahlt, aber nicht monatlich —
 * ein Monatszahler hebt alle Monate gleich und schliesst keine Luecke. Unter
 * ihnen die mit der hoechsten Ausschuettung je Zahlung im Verhaeltnis zum
 * Marktwert: Sie braucht den kleinsten Zukauf. Der Zukauf ist
 * `Luecke × Marktwert ÷ Betrag je Zahlung`, auf volle 100 € aufgerundet.
 */
export function monthGaps(forecast: TwelveMonthForecast): {
  average: Money;
  gaps: MonthGap[];
} {
  const average = Money.fromDecimal(forecast.total.toDecimal().dividedBy(12), EUR);
  const gaps = forecast.months
    .filter((month) => month.total.compareTo(average) < 0)
    .map((month): MonthGap => {
      const gap = average.subtract(month.total);
      let filler: MonthGap["filler"] = null;
      for (const item of month.contributions) {
        if (item.payouts >= 12 || item.marketValue === null) continue;
        if (!item.marketValue.isPositive() || !item.amount.isPositive()) continue;
        const raw = gap
          .toDecimal()
          .times(item.marketValue.toDecimal())
          .dividedBy(item.amount.toDecimal());
        const invest = Money.fromDecimal(
          raw.dividedBy(INVEST_STEP).ceil().times(INVEST_STEP),
          EUR,
        );
        if (filler === null || invest.compareTo(filler.invest) < 0) {
          filler = {
            securityId: item.securityId,
            name: item.name,
            payouts: item.payouts,
            invest,
          };
        }
      }
      return { year: month.year, month: month.month, total: month.total, gap, filler };
    });
  return { average, gaps };
}
