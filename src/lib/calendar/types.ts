import { Money, toCurrencyCode } from "@/lib/money";
import type {
  CalendarEventState,
  CalendarEventType,
  Database,
} from "@/lib/supabase/database.types";

export type { CalendarEventType };

/**
 * Zeile, wie die App sie laedt — nur die Spalten, die {@link mapCalendarEvent}
 * liest. Beim Erweitern hier **und** in `CALENDAR_EVENT_COLUMNS`
 * (repositories/calendarEvents.ts) nachziehen.
 */
export type CalendarEventRow = Pick<
  Database["public"]["Tables"]["dividend_calendar_events"]["Row"],
  | "id"
  | "external_uid"
  | "event_type"
  | "event_state"
  | "title"
  | "company_name"
  | "expected_amount"
  | "expected_currency"
  | "source_portfolio"
  | "description"
  | "location"
  | "external_url"
  | "categories"
  | "event_date"
  | "end_date"
  | "starts_at"
  | "ends_at"
  | "is_all_day"
>;
export type CalendarSyncStatusRow =
  Database["public"]["Tables"]["calendar_sync_status"]["Row"];

/**
 * Ein angekuendigter Termin des Dividendenkalenders.
 *
 * Ein Betrag steht nur dort, wo der Feed ihn nennt (`expectedAmount`) —
 * geschaetzt wird nie (Auftrag §3/§18).
 *
 * `date` ist ein reines Kalenderdatum ("YYYY-MM-DD") und wird nie ueber `Date`
 * geparst — genau daran verschieben sich ganztaegige Termine sonst um einen Tag
 * (Auftrag §14).
 */
export interface CalendarEvent {
  id: string;
  externalUid: string;
  eventType: CalendarEventType;
  eventState: CalendarEventState;
  /** SUMMARY des Feeds unveraendert; fehlt sie, bleibt sie leer. */
  title: string | null;
  /**
   * Unternehmensname, beim Einlesen aus der SUMMARY geloest. Erkennt der Parser
   * die Zeile nicht, bleibt er leer und die Oberflaeche zeigt `title`.
   */
  companyName: string | null;
  /**
   * Name des **angelegten** Unternehmens, wenn `companyName` eindeutig darauf
   * passt (siehe `companyNames.ts`). Steht nicht in der Datenbank: Der Abgleich
   * geschieht beim Anzeigen, damit Umbenennungen sofort greifen und der
   * gespeicherte Termin unangetastet bleibt.
   */
  matchedCompanyName: string | null;
  /**
   * Seit wann der Broker die Dividenden des angelegten Unternehmens
   * reinvestiert — wie `matchedCompanyName` erst beim Anzeigen ergaenzt
   * (siehe {@link isReinvested}).
   */
  reinvestSince: string | null;
  /**
   * **Erwarteter** Betrag laut Kalenderquelle — keine erhaltene Zahlung und
   * keine Schaetzung dieser App. Fehlt er im Feed, bleibt er leer.
   */
  expectedAmount: Money | null;
  /** Depot oder Broker, den die Quelle zu diesem Termin nennt. */
  sourcePortfolio: string | null;
  description: string | null;
  location: string | null;
  externalUrl: string | null;
  categories: string[];
  date: string;
  /** Letzter Tag mehrtaegiger Termine, inklusiv. */
  endDate: string | null;
  /** Nur bei Terminen mit Uhrzeit. */
  startsAt: string | null;
  endsAt: string | null;
  isAllDay: boolean;
}

/**
 * Betrag und Waehrung stehen in der Datenbank nur gemeinsam (Constraint der
 * Migration 0028). Eine unbekannte Waehrung fuehrt nicht zum Absturz der
 * Kalenderseite, sondern laesst den Betrag weg — angezeigt wird dann eben
 * keiner.
 */
function readExpectedAmount(row: CalendarEventRow): Money | null {
  const { expected_amount: amount, expected_currency: currency } = row;
  if (amount === null || currency === null) return null;
  try {
    // PostgREST liefert `numeric` je nach Cast als JSON-Zahl statt als String
    // (siehe normalizeAmountFields); Money.fromString erwartet einen String.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion -- Laufzeittyp weicht bewusst vom statischen Typ ab
    return Money.fromString(String(amount), toCurrencyCode(currency));
  } catch {
    return null;
  }
}

export function mapCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    externalUid: row.external_uid,
    eventType: row.event_type,
    eventState: row.event_state,
    title: row.title,
    companyName: row.company_name,
    // Der Abgleich mit den eigenen Unternehmen braucht deren Bestand und
    // geschieht deshalb erst in der Kalenderseite, nicht hier an der Zeile.
    matchedCompanyName: null,
    reinvestSince: null,
    expectedAmount: readExpectedAmount(row),
    sourcePortfolio: row.source_portfolio,
    description: row.description,
    location: row.location,
    externalUrl: row.external_url,
    categories: row.categories ?? [],
    date: row.event_date,
    endDate: row.end_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isAllDay: row.is_all_day,
  };
}
