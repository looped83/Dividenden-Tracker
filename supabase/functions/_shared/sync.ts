/**
 * Abgleichslogik der Kalendersynchronisation (Auftrag §5).
 *
 * Idempotent: Derselbe Feed zweimal angewendet erzeugt weder Dubletten noch
 * Schreibvorgaenge. Die Identitaet eines Termins ist `(user_id, source,
 * external_uid)`; `user_id` und `source` setzt die Aufrufstelle, hier zaehlt
 * die UID.
 *
 * Wie `ical.ts` ohne Laufzeitbezug: Die Datenbank steckt hinter einem schmalen
 * Port (`CalendarEventStore`), damit derselbe Ablauf in der Edge Function und
 * im Test laeuft.
 */
import type {
  CalendarEventState,
  CalendarEventType,
  ParsedCalendarEvent,
} from "./ical.ts";

export const CALENDAR_SOURCE = "divvydiary";

/** Die Schritte, an denen ein Schreib- oder Lesezugriff scheitern kann. */
export const STORE_FAILURES = ["load", "insert", "update", "remove"] as const;
export type StoreFailure = (typeof STORE_FAILURES)[number];

/**
 * Die eigene Datenbank hat den Zugriff abgelehnt — nicht die Kalenderquelle.
 *
 * Der Unterschied ist wichtig genug fuer einen eigenen Fehlertyp: Ein Ausfall
 * bei DivvyDiary geht vorueber, eine fehlende Migration nicht. Beides mit
 * derselben Meldung zu quittieren schickte den Betreiber auf die falsche
 * Faehrte.
 *
 * `detail` traegt die Meldung der Datenbank fuer das Server-Log (etwa
 * „column … does not exist"), niemals die Werte der Zeile.
 */
export class StoreError extends Error {
  readonly step: StoreFailure;
  readonly detail: string | null;

  constructor(step: StoreFailure, detail: string | null = null) {
    super(`store_${step}_failed`);
    this.name = "StoreError";
    this.step = step;
    this.detail = detail;
  }
}

/** Fachliche Felder einer Kalenderzeile — genau das, was der Feed bestimmt. */
export interface CalendarEventWrite {
  external_uid: string;
  event_type: CalendarEventType;
  event_state: CalendarEventState;
  title: string | null;
  company_name: string | null;
  expected_amount: string | null;
  expected_currency: string | null;
  source_portfolio: string | null;
  description: string | null;
  location: string | null;
  external_url: string | null;
  categories: string[] | null;
  event_date: string;
  end_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_all_day: boolean;
  sequence_number: number | null;
  recurrence_rule: string | null;
  source_created_at: string | null;
  source_updated_at: string | null;
  raw_data: Record<string, string | string[]>;
}

export interface StoredCalendarEvent extends CalendarEventWrite {
  id: string;
}

export interface CalendarEventStore {
  /** Alle bereits gespeicherten Termine des Nutzers dieser Quelle. */
  loadEvents(): Promise<StoredCalendarEvent[]>;
  insertEvents(rows: CalendarEventWrite[]): Promise<void>;
  updateEvents(rows: StoredCalendarEvent[]): Promise<void>;
  markRemoved(ids: string[]): Promise<void>;
}

export interface SyncResult {
  eventsRead: number;
  created: number;
  updated: number;
  removed: number;
  skipped: number;
}

export interface SyncPlan {
  toInsert: CalendarEventWrite[];
  toUpdate: StoredCalendarEvent[];
  toRemove: string[];
  unchanged: number;
}

/** Uebersetzt ein geparstes Ereignis in die Spalten der Tabelle. */
export function toWrite(event: ParsedCalendarEvent): CalendarEventWrite {
  return {
    external_uid: event.externalUid,
    event_type: event.eventType,
    event_state: event.eventState,
    title: event.title,
    company_name: event.companyName,
    expected_amount: event.expectedAmount,
    expected_currency: event.expectedCurrency,
    source_portfolio: event.sourcePortfolio,
    description: event.description,
    location: event.location,
    external_url: event.externalUrl,
    categories: event.categories,
    event_date: event.eventDate,
    end_date: event.endDate,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    is_all_day: event.isAllDay,
    sequence_number: event.sequenceNumber,
    recurrence_rule: event.recurrenceRule,
    source_created_at: event.sourceCreatedAt,
    source_updated_at: event.sourceUpdatedAt,
    raw_data: event.rawData,
  };
}

/**
 * Vergleichbare Textform eines Wertes: Objektschluessel in fester Ordnung.
 *
 * `raw_data` liegt als `jsonb` in der Datenbank, und `jsonb` bewahrt die
 * Reihenfolge der Schluessel **nicht**. Ein naiver `JSON.stringify`-Vergleich
 * meldete deshalb bei jedem Lauf eine Aenderung und schriebe jede Zeile neu.
 */
function stableString(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableString).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableString(entryValue)}`);
  return `{${entries.join(",")}}`;
}

/**
 * Hat sich fachlich etwas geaendert? Nur dann wird geschrieben — sonst wuerde
 * jede Synchronisation `updated_at` aller Termine anfassen und die Historie
 * bereits vergangener Zahltage unnoetig beruehren (Auftrag §5).
 */
function hasChanged(existing: StoredCalendarEvent, next: CalendarEventWrite): boolean {
  const keys = Object.keys(next) as (keyof CalendarEventWrite)[];
  return keys.some((key) => stableString(existing[key]) !== stableString(next[key]));
}

/**
 * Berechnet, was der Feed an der gespeicherten Fassung aendert.
 *
 * `today` ist ein reines Kalenderdatum ("YYYY-MM-DD"). Entfallene Termine
 * werden nur ab heute beruecksichtigt: Der Feed enthaelt ausschliesslich
 * kommende Zahltage, jeder vergangene Termin fehlte darin zwangslaeufig und
 * wuerde sonst bei jedem Lauf faelschlich als entfallen gelten.
 */
export function planSync(
  events: readonly ParsedCalendarEvent[],
  existing: readonly StoredCalendarEvent[],
  today: string,
): SyncPlan {
  const byUid = new Map(existing.map((row) => [row.external_uid, row]));
  const feedUids = new Set<string>();

  const toInsert: CalendarEventWrite[] = [];
  const toUpdate: StoredCalendarEvent[] = [];
  let unchanged = 0;

  for (const event of events) {
    const next = toWrite(event);
    feedUids.add(next.external_uid);
    const current = byUid.get(next.external_uid);

    if (!current) {
      toInsert.push(next);
    } else if (hasChanged(current, next)) {
      // Ein Termin, der wieder im Feed auftaucht, wird ueber `event_state`
      // automatisch wieder aktiv — er ist Teil der fachlichen Felder.
      toUpdate.push({ ...next, id: current.id });
    } else {
      unchanged += 1;
    }
  }

  const toRemove = existing
    .filter(
      (row) =>
        row.event_state === "active" &&
        row.event_date >= today &&
        !feedUids.has(row.external_uid),
    )
    .map((row) => row.id);

  return { toInsert, toUpdate, toRemove, unchanged };
}

/**
 * Fuehrt den Abgleich aus. Der Feed ist zu diesem Zeitpunkt bereits erfolgreich
 * geladen und geparst — ein Netz- oder Formatfehler erreicht diese Funktion
 * gar nicht und kann deshalb keine gespeicherten Daten beruehren (Auftrag §6).
 */
export async function runCalendarSync(options: {
  events: readonly ParsedCalendarEvent[];
  skipped: number;
  store: CalendarEventStore;
  today: string;
}): Promise<SyncResult> {
  const { events, skipped, store, today } = options;
  const existing = await store.loadEvents();
  const plan = planSync(events, existing, today);

  if (plan.toInsert.length > 0) await store.insertEvents(plan.toInsert);
  if (plan.toUpdate.length > 0) await store.updateEvents(plan.toUpdate);
  if (plan.toRemove.length > 0) await store.markRemoved(plan.toRemove);

  return {
    eventsRead: events.length,
    created: plan.toInsert.length,
    updated: plan.toUpdate.length,
    removed: plan.toRemove.length,
    skipped,
  };
}
