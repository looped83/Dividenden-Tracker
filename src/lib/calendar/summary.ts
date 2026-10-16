import { EUR, Money, sumMoney, type CurrencyCode } from "@/lib/money";
import type { AnnouncedPayment } from "@/lib/statistics";
import { addDays } from "./month";
import type { CalendarEvent } from "./types";

/**
 * Kennzahlen des Dividendenkalenders (Kachelzeile über der Liste).
 *
 * Gezeigt werden Anzahl Termine, Anzahl Unternehmen, Abstand in Tagen — und die
 * Summe der **erwarteten** Betraege, soweit die Quelle sie nennt. Geschaetzt
 * wird nichts: Fehlt ein Betrag im Feed, fehlt er auch in der Summe, und die
 * Kachel sagt, aus wie vielen Terminen sie stammt (PRODUCT_SPEC.md Grundsatz 8).
 *
 * Abgesagte Termine zaehlen nirgends mit: Sie sind gerade **keine**
 * angekuendigte Zahlung mehr. In der Liste bleiben sie sichtbar und sind dort
 * als abgesagt gekennzeichnet.
 */
export interface NextPayday {
  date: string;
  /** Kalendertage bis dahin; 0 = heute. */
  daysAway: number;
  /** Alle Termine dieses Tages, in der Reihenfolge der Liste. */
  events: CalendarEvent[];
}

/**
 * Summe erwarteter Betraege eines Zeitraums.
 *
 * `total` bleibt leer, wenn die Quelle fuer keinen Termin des Zeitraums einen
 * Betrag nennt — oder wenn die Betraege in **verschiedenen** Waehrungen stehen.
 * Verschiedene Waehrungen zu addieren waere eine stillschweigende Umrechnung zu
 * einem erfundenen Kurs; `mixedCurrencies` macht den Fall in der Oberflaeche
 * benennbar.
 */
export interface ExpectedTotal {
  total: Money | null;
  /** Zahltage des Zeitraums, die einen Betrag mitbringen. */
  withAmount: number;
  /** Zahltage des Zeitraums insgesamt (ohne Ex-Tage). */
  count: number;
  mixedCurrencies: boolean;
}

export interface CalendarSummary {
  next: NextPayday | null;
  /** Termine im laufenden Kalendermonat (ganzer Monat, nicht nur ab heute). */
  thisMonth: ExpectedTotal;
  /** Termine von heute bis einschliesslich in 30 Tagen. */
  next30Days: ExpectedTotal;
  /** Kommende Termine insgesamt. */
  upcoming: number;
}

/** Kalendertage zwischen zwei ISO-Daten (zeitzonenfrei, ganze Tage). */
export function daysBetween(from: string, to: string): number {
  const parse = (iso: string): number => {
    const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** Abgesagte Termine sind keine angekuendigte Zahlung mehr und zaehlen nirgends mit. */
export function isCounted(event: CalendarEvent): boolean {
  return event.eventState !== "cancelled";
}

/**
 * Bildet die Summe der erwarteten Betraege einer Terminmenge. Summiert wird
 * ausschliesslich ueber `lib/money` (Decimal) — nie mit `+` auf rohen Zahlen
 * (CALCULATION_RULES.md §8).
 *
 * Gezaehlt werden nur Zahltage: Zu einer Dividende gehoeren Ex-Tag **und**
 * Zahltag. Nennt der Feed den Betrag an beiden, stuende dieselbe Dividende
 * sonst zweimal in der Summe (wie in {@link announcedForForecast}).
 */
export function expectedTotalOf(events: readonly CalendarEvent[]): ExpectedTotal {
  const amounts: Money[] = [];
  let currency: CurrencyCode | null = null;
  let mixedCurrencies = false;
  const paydays = events.filter((event) => event.eventType === "payment");

  for (const event of paydays) {
    const amount = event.expectedAmount;
    if (!amount) continue;
    if (currency === null) currency = amount.currency;
    else if (currency !== amount.currency) mixedCurrencies = true;
    amounts.push(amount);
  }

  const total =
    currency !== null && !mixedCurrencies ? sumMoney(amounts, currency) : null;

  return { total, withAmount: amounts.length, count: paydays.length, mixedCurrencies };
}

export function buildCalendarSummary(
  events: readonly CalendarEvent[],
  today: string,
): CalendarSummary {
  const counted = events.filter(isCounted);
  const upcoming = counted
    .filter((event) => event.date >= today)
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  const nextDate = upcoming.length > 0 ? upcoming[0].date : null;
  const next: NextPayday | null =
    nextDate === null
      ? null
      : {
          date: nextDate,
          daysAway: daysBetween(today, nextDate),
          events: upcoming.filter((event) => event.date === nextDate),
        };

  const monthPrefix = today.slice(0, 7);
  const horizon = addDays(today, 30);

  return {
    next,
    thisMonth: expectedTotalOf(
      counted.filter((event) => event.date.startsWith(monthPrefix)),
    ),
    next30Days: expectedTotalOf(upcoming.filter((event) => event.date <= horizon)),
    upcoming: upcoming.length,
  };
}

/** Wie weit Ankündigungen in die Prognose zum Jahresende eingehen (CALCULATION_RULES.md §9.7). */
export const FORECAST_ANNOUNCED_DAYS = 30;

/**
 * Angekündigte Zahlungen der nächsten {@link FORECAST_ANNOUNCED_DAYS} Tage für
 * die Prognose (`yearEndForecast`): nur Zahltage (keine Ex-Tage), nicht
 * abgesagt, mit Betrag in Euro. Die Beträge der Quelle sind Nettobeträge;
 * andere Währungen bleiben außen vor, statt zu einem erfundenen Kurs
 * umgerechnet zu werden — für diese Tage gilt dann das Vorjahr.
 */
export function announcedForForecast(
  events: readonly CalendarEvent[],
  today: string,
): AnnouncedPayment[] {
  const until = addDays(today, FORECAST_ANNOUNCED_DAYS);
  return events.flatMap((event) =>
    event.eventType === "payment" &&
    isCounted(event) &&
    event.date > today &&
    event.date <= until &&
    event.expectedAmount?.currency === EUR
      ? [{ date: event.date, amount: event.expectedAmount }]
      : [],
  );
}
