import { Money, sumMoney, type CurrencyCode } from "@/lib/money";
import { addDays } from "./month";
import { eventTitle } from "./format";
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
  /** Termine des Zeitraums, die einen Betrag mitbringen. */
  withAmount: number;
  /** Termine des Zeitraums insgesamt. */
  count: number;
  mixedCurrencies: boolean;
}

export interface CalendarSummary {
  next: NextPayday | null;
  /** Termine im laufenden Kalendermonat (ganzer Monat, nicht nur ab heute). */
  thisMonth: ExpectedTotal;
  /** Termine von heute bis einschliesslich in 30 Tagen. */
  next30Days: ExpectedTotal;
  /** Verschiedene Unternehmen unter den kommenden Terminen. */
  companies: number;
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

function isCounted(event: CalendarEvent): boolean {
  return event.eventState !== "cancelled";
}

/**
 * Bildet die Summe der erwarteten Betraege einer Terminmenge. Summiert wird
 * ausschliesslich ueber `lib/money` (Decimal) — nie mit `+` auf rohen Zahlen
 * (CALCULATION_RULES.md §8).
 */
export function expectedTotalOf(events: readonly CalendarEvent[]): ExpectedTotal {
  const amounts: Money[] = [];
  let currency: CurrencyCode | null = null;
  let mixedCurrencies = false;

  for (const event of events) {
    const amount = event.expectedAmount;
    if (!amount) continue;
    if (currency === null) currency = amount.currency;
    else if (currency !== amount.currency) mixedCurrencies = true;
    amounts.push(amount);
  }

  const total =
    currency !== null && !mixedCurrencies ? sumMoney(amounts, currency) : null;

  return { total, withAmount: amounts.length, count: events.length, mixedCurrencies };
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
    // Gezaehlt wird der **angezeigte** Name: „Realty Income Corporation" aus dem
    // Feed und das eigene „Realty Income" sind ein Unternehmen, kein zweites.
    companies: new Set(upcoming.map((event) => eventTitle(event))).size,
    upcoming: upcoming.length,
  };
}
