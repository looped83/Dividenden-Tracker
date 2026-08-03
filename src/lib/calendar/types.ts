import { Money, toCurrencyCode } from "@/lib/money";
import type {
  CalendarEventState,
  CalendarEventType,
  Database,
} from "@/lib/supabase/database.types";

export type CalendarEventRow =
  Database["public"]["Tables"]["dividend_calendar_events"]["Row"];
export type CalendarSyncStatusRow =
  Database["public"]["Tables"]["calendar_sync_status"]["Row"];

/**
 * Ein angekuendigter Termin des Dividendenkalenders.
 *
 * Bewusst **kein** Betrag und keine Waehrung: Der Feed liefert beides nicht,
 * und ein geschaetzter Wert waere eine Behauptung (Auftrag §3/§18). Was der
 * Feed zusaetzlich mitgibt, steht in `description`.
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
