/**
 * Prognose der naechsten zwoelf Monate (Bestand › Prognose).
 *
 * Reine Funktionen wie `analysis.ts`: ohne Oberflaeche, ohne Datenbank. Das
 * Ergebnis ist eine **Schaetzung** und wird nirgends gespeichert; es fliesst
 * weder in Statistik noch in Ziele (PRODUCT_SPEC.md Grundsatz 8,
 * CALCULATION_RULES.md §14).
 *
 * Zwei Quellen, in dieser Rangfolge:
 *
 * 1. **Angekuendigt** — Zahltage des Dividendenkalenders mit Betrag in Euro.
 *    Die Betraege der Quelle sind Nettobetraege (§9.7) und gelten unveraendert.
 * 2. **Geschaetzt** — die erwartete Jahresdividende des juengsten Depotstands,
 *    verteilt auf die Ausschuettungsmonate der Position und mit der eigenen
 *    Netto-Quote auf netto gerechnet. Die Jahresdividende des Exports ist
 *    brutto (Dividendenrate × Stueck).
 *
 * Eine Ankuendigung ersetzt die Schaetzung derselben Position im selben Monat
 * — oder im Nachbarmonat, wenn die Zahlung gegenueber dem Plan verrutscht ist.
 * Sonst stuende dieselbe Dividende zweimal in der Summe.
 */
import {
  EUR,
  Money,
  MoneyDecimal,
  toCurrencyCode,
  type CurrencyCode,
  type DecimalInstance,
} from "@/lib/money";
import type { CalendarEvent } from "@/lib/calendar/types";
import { isCounted } from "@/lib/calendar/summary";
import {
  isInRange,
  isoDate,
  lastDayOfMonth,
  monthOf,
  trailingYearRange,
  yearOf,
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
  /** `null` fuer eine Ankuendigung ohne zugeordnetes Asset. */
  securityId: string | null;
  name: string;
  amount: Money;
  announced: boolean;
}

export interface ForecastMonth {
  year: number;
  /** 1–12 */
  month: number;
  announced: Money;
  estimated: Money;
  total: Money;
  /** Groesster Beitrag zuerst. */
  contributions: ForecastContribution[];
}

export interface TwelveMonthForecast {
  asOf: string;
  months: ForecastMonth[];
  total: Money;
  announced: Money;
  estimated: Money;
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

function monthKey(year: number, month: number): string {
  return `${String(year)}-${String(month).padStart(2, "0")}`;
}

interface Bucket {
  year: number;
  month: number;
  /** Schaetzung je Position. */
  estimates: Map<string, Money>;
  announced: ForecastContribution[];
}

/**
 * Prognose fuer die zwoelf vollen Monate nach dem laufenden.
 *
 * @param securityIdByName Asset-Kennung je Name — fuer Kalendertermine, deren
 *   Name auf ein angelegtes Asset passt (`matchedCompanyName`).
 */
export function forecastTwelveMonths({
  snapshots,
  facets,
  payments,
  events,
  securityIdByName,
  today,
}: {
  snapshots: readonly SecuritySnapshot[];
  facets: ReadonlyMap<string, ForecastFacets>;
  payments: readonly AnalyticsPayment[];
  events: readonly CalendarEvent[];
  securityIdByName: ReadonlyMap<string, string>;
  today: RefDate;
}): ForecastResult {
  const asOf = latestAsOf(snapshots);
  const rows = snapshotsAt(snapshots, asOf);
  if (asOf === null || rows.length === 0) return { kind: "empty" };
  if (new Set(rows.map((row) => row.currency)).size > 1) return { kind: "mixedCurrency" };
  const currency: CurrencyCode = toCurrencyCode(rows[0].currency);
  // Kalenderbetraege und Zahlungen stehen in Euro; ein Stand in anderer
  // Waehrung liesse sich mit ihnen nicht ehrlich zusammenrechnen.
  if (currency !== EUR) return { kind: "mixedCurrency" };

  const todayIso = isoDate(today.year, today.month, today.day);
  const ratio = netRatio(payments, todayIso);
  const factor = ratio ?? ONE;

  const window = forecastWindow(today);
  const buckets = new Map<string, Bucket>();
  for (const { year, month } of window) {
    buckets.set(monthKey(year, month), {
      year,
      month,
      estimates: new Map(),
      announced: [],
    });
  }

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

  let withoutAmount = 0;
  for (const row of rows) {
    if (row.annual_dividend_total === null) {
      withoutAmount += 1;
      continue;
    }
    if (row.dividend_frequency === "none") continue;
    const annual = new MoneyDecimal(row.annual_dividend_total);
    if (!annual.greaterThan(0)) continue;

    const months = new Set(
      payoutMonthsOf(
        facets.get(row.security_id),
        recentMonthsBySecurity.get(row.security_id),
        row,
      ),
    );
    const perPayment = Money.fromDecimal(
      annual.times(factor).dividedBy(months.size),
      currency,
    );
    for (const bucket of buckets.values()) {
      if (months.has(bucket.month)) bucket.estimates.set(row.security_id, perPayment);
    }
  }

  const windowStart = isoDate(window[0].year, window[0].month, 1);
  const last = window[window.length - 1];
  const windowEnd = isoDate(last.year, last.month, lastDayOfMonth(last.year, last.month));
  const nameOf = (securityId: string) => facets.get(securityId)?.name ?? "Unbekannt";

  for (const event of events) {
    if (event.eventType !== "payment" || !isCounted(event)) continue;
    if (event.date < windowStart || event.date > windowEnd) continue;
    if (event.expectedAmount?.currency !== EUR) continue;

    const bucket = buckets.get(monthKey(yearOf(event.date), monthOf(event.date)));
    if (!bucket) continue;
    const feedName = event.matchedCompanyName ?? event.companyName;
    const securityId =
      feedName === null ? null : (securityIdByName.get(feedName) ?? null);

    if (securityId !== null) {
      // Die Schaetzung dieses Monats weicht der Ankuendigung — sonst die eines
      // Nachbarmonats, falls die Zahlung gegenueber dem Plan verrutscht ist.
      if (!bucket.estimates.delete(securityId)) {
        for (const shift of [-1, 1]) {
          const neighbour = shiftMonth(bucket.year, bucket.month, shift);
          if (
            buckets
              .get(monthKey(neighbour.year, neighbour.month))
              ?.estimates.delete(securityId)
          )
            break;
        }
      }
    }
    bucket.announced.push({
      securityId,
      name:
        securityId === null
          ? (feedName ?? event.title ?? "Unbekannt")
          : nameOf(securityId),
      amount: event.expectedAmount,
      announced: true,
    });
  }

  const months: ForecastMonth[] = [];
  let total = Money.zero(currency);
  let announcedTotal = Money.zero(currency);
  let estimatedTotal = Money.zero(currency);
  for (const bucket of buckets.values()) {
    const contributions: ForecastContribution[] = [
      ...mergeAnnounced(bucket.announced),
      ...[...bucket.estimates].map(([securityId, amount]) => ({
        securityId,
        name: nameOf(securityId),
        amount,
        announced: false,
      })),
    ].sort((a, b) => b.amount.compareTo(a.amount));

    const announced = sum(
      contributions.filter((c) => c.announced),
      currency,
    );
    const estimated = sum(
      contributions.filter((c) => !c.announced),
      currency,
    );
    const monthTotal = announced.add(estimated);
    months.push({
      year: bucket.year,
      month: bucket.month,
      announced,
      estimated,
      total: monthTotal,
      contributions,
    });
    total = total.add(monthTotal);
    announcedTotal = announcedTotal.add(announced);
    estimatedTotal = estimatedTotal.add(estimated);
  }

  if (total.isZero() && receivedLast12.isZero()) return { kind: "empty" };

  return {
    kind: "ok",
    forecast: {
      asOf,
      months,
      total,
      announced: announcedTotal,
      estimated: estimatedTotal,
      receivedLast12,
      netRatio: ratio,
      withoutAmount,
    },
  };
}

function shiftMonth(
  year: number,
  month: number,
  by: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function sum(
  contributions: readonly ForecastContribution[],
  currency: CurrencyCode,
): Money {
  return contributions.reduce((total, c) => total.add(c.amount), Money.zero(currency));
}

/** Mehrere Termine derselben Position in einem Monat als ein Beitrag. */
function mergeAnnounced(list: readonly ForecastContribution[]): ForecastContribution[] {
  const byKey = new Map<string, ForecastContribution>();
  for (const item of list) {
    const key = item.securityId ?? `name:${item.name}`;
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing ? { ...existing, amount: existing.amount.add(item.amount) } : item,
    );
  }
  return [...byKey.values()];
}
