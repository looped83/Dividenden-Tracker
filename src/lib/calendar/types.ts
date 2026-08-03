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
  /** SUMMARY des Feeds; fehlt sie, bleibt sie leer (kein erfundener Titel). */
  title: string | null;
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

export function mapCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    externalUid: row.external_uid,
    eventType: row.event_type,
    eventState: row.event_state,
    title: row.title,
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
