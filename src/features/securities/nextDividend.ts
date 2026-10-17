import { sumMoney, type Money } from "@/lib/money";
import { isCounted } from "@/lib/calendar/summary";
import type { CalendarEvent } from "@/lib/calendar/types";
import { monthOf, yearOf, type AnalyticsPayment, type RefDate } from "@/lib/statistics";

/**
 * Die naechste Dividende eines Assets — entweder **angekuendigt** (Zahltag im
 * Dividendenkalender, mit genauem Datum und dem Betrag der Quelle) oder
 * **vermutet** (naechster Monat des Ausschuettungsplans, Betrag aus der
 * Historie). Die Herkunft steht dabei, weil beides verschieden belastbar ist.
 */
export type NextDividend =
  | { source: "calendar"; date: string; amount: Money | null }
  | { source: "estimate"; year: number; month: number; amount: Money | null };

/**
 * Naechster Monat des Plans nach der letzten Dividende, fruehestens der
 * laufende Monat — eine ausgebliebene Zahlung schiebt die Angabe nicht in die
 * Vergangenheit.
 */
function nextPlannedMonth(
  lastPayDate: string,
  payoutMonths: readonly number[],
  today: RefDate,
): { year: number; month: number } | null {
  const start = Math.max(
    yearOf(lastPayDate) * 12 + monthOf(lastPayDate) - 1,
    today.year * 12 + today.month - 2,
  );
  for (let step = 1; step <= 12; step += 1) {
    const index = start + step;
    const month = (index % 12) + 1;
    if (payoutMonths.includes(month)) return { year: Math.floor(index / 12), month };
  }
  return null;
}

/**
 * Vermuteter Betrag: Bei monatlichen Zahlern die letzte Dividende (Zukaeufe
 * und Erhoehungen wirken sofort), sonst die Dividenden desselben Monats ein
 * Jahr zuvor (Sonderausschuettungen kehren meist im selben Monat wieder); gibt
 * es die nicht, wieder die letzte.
 */
function estimateAmount(
  own: readonly AnalyticsPayment[],
  last: AnalyticsPayment,
  target: { year: number; month: number },
  monthly: boolean,
): Money {
  if (monthly) return last.netAmount;
  const sameMonth = own.filter(
    (payment) =>
      yearOf(payment.payDate) === target.year - 1 &&
      monthOf(payment.payDate) === target.month,
  );
  return sameMonth.length > 0
    ? sumMoney(
        sameMonth.map((payment) => payment.netAmount),
        last.netAmount.currency,
      )
    : last.netAmount;
}

export function nextDividend({
  securityName,
  events,
  own,
  payoutMonths,
  today,
  todayIso,
}: {
  securityName: string;
  /** Termine mit angeglichenen Namen (`useResolvedCalendarEvents`). */
  events: readonly CalendarEvent[];
  /** Aktive Dividenden dieses Assets mit effektivem Datum. */
  own: readonly AnalyticsPayment[];
  payoutMonths: readonly number[];
  today: RefDate;
  todayIso: string;
}): NextDividend | null {
  const announced = events
    .filter(
      (event) =>
        event.eventType === "payment" &&
        isCounted(event) &&
        event.date >= todayIso &&
        // Bei exakt gleicher Schreibweise bleibt `matchedCompanyName` leer
        // (resolveCompanyNames), dann zaehlt der Name der Quelle.
        (event.matchedCompanyName ?? event.companyName) === securityName,
    )
    .reduce<CalendarEvent | null>(
      (first, event) => (first === null || event.date < first.date ? event : first),
      null,
    );
  if (announced) {
    return { source: "calendar", date: announced.date, amount: announced.expectedAmount };
  }

  const last = own.reduce<AnalyticsPayment | null>(
    (latest, payment) =>
      latest === null || payment.payDate > latest.payDate ? payment : latest,
    null,
  );
  if (last === null || payoutMonths.length === 0) return null;
  const target = nextPlannedMonth(last.payDate, payoutMonths, today);
  if (target === null) return null;
  return {
    source: "estimate",
    ...target,
    amount: estimateAmount(own, last, target, payoutMonths.length === 12),
  };
}
