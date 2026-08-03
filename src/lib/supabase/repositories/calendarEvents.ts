import { supabase } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import type { CalendarEventRow, CalendarSyncStatusRow } from "@/lib/calendar/types";

/** Name der Edge Function; eine Stelle fuer Aufruf und Dokumentation. */
export const CALENDAR_SYNC_FUNCTION = "sync-divvydiary-calendar";

/**
 * Die angekuendigten Termine des angemeldeten Nutzers (RLS).
 *
 * Aus der Quelle entfernte Termine bleiben in der Datenbank nachvollziehbar
 * erhalten, gehoeren aber nicht mehr in die Ansicht — sie werden serverseitig
 * herausgefiltert, statt sie unnoetig zu uebertragen.
 *
 * Eindeutige Sortierung (Datum plus `id`), weil `fetchAllPages` sonst ueber
 * Seitengrenzen hinweg Zeilen doppelt oder gar nicht sehen kann.
 */
export async function fetchCalendarEvents(): Promise<CalendarEventRow[]> {
  return fetchAllPages<CalendarEventRow>((from, to) =>
    supabase
      .from("dividend_calendar_events")
      .select("*")
      .neq("event_state", "removed_from_source")
      .order("event_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Ergebnis des letzten Laufs; `null`, solange nie synchronisiert wurde. */
export async function fetchCalendarSyncStatus(): Promise<CalendarSyncStatusRow | null> {
  const { data, error } = await supabase
    .from("calendar_sync_status")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface CalendarSyncSummary {
  eventsRead: number;
  created: number;
  updated: number;
  removed: number;
  skipped: number;
}

/**
 * Fehler der Synchronisation — mit einer Meldung, die dem Nutzer gezeigt werden
 * darf. Technische Details bleiben absichtlich auszen vor: Die Edge Function
 * liefert bereits eine bereinigte Meldung, und alles andere koennte Teile der
 * Feed-Adresse enthalten (SECURITY_MODEL.md §5, Auftrag §12).
 */
export class CalendarSyncError extends Error {
  /** Ein zweiter Lauf war bereits unterwegs — kein echter Fehlschlag. */
  readonly alreadyRunning: boolean;

  constructor(message: string, alreadyRunning = false) {
    super(message);
    this.name = "CalendarSyncError";
    this.alreadyRunning = alreadyRunning;
  }
}

const GENERIC_SYNC_ERROR =
  "Der Dividendenkalender konnte gerade nicht aktualisiert werden. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.";

/**
 * Antwortet nicht die Funktion, sondern das Supabase-Gateway (die Funktion ist
 * nicht ausgerollt), ist das kein Betriebsfehler, sondern ein fehlender
 * Einrichtungsschritt — und genau das soll dastehen.
 */
const NOT_DEPLOYED_ERROR =
  "Die Kalender-Synchronisation ist im Supabase-Projekt noch nicht eingerichtet.";

interface SyncResponseBody {
  status?: unknown;
  message?: unknown;
  eventsRead?: unknown;
  created?: unknown;
  updated?: unknown;
  removed?: unknown;
  skipped?: unknown;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Uebernimmt eine Meldung nur dann, wenn sie **aus der eigenen Edge Function**
 * stammt — erkennbar am `status`-Feld der Antwort.
 *
 * Auf demselben Weg antworten naemlich auch andere: Das Supabase-Gateway meldet
 * eine nicht ausgerollte Funktion mit „Requested function was not found", ein
 * Proxy schickt womoeglich eine HTML-Seite. Solche Texte sind englisch,
 * technisch und dem Nutzer nicht zumutbar (Auftrag §12); nur die Meldungen der
 * eigenen Funktion sind bewusst formuliert und bereinigt.
 */
function safeMessage(body: SyncResponseBody | null): string {
  const fromOwnFunction = body?.status === "error" || body?.status === "running";
  if (!fromOwnFunction) return GENERIC_SYNC_ERROR;
  const { message } = body;
  return typeof message === "string" && message.length > 0 && message.length <= 500
    ? message
    : GENERIC_SYNC_ERROR;
}

async function readBody(response: Response | undefined): Promise<SyncResponseBody> {
  if (!response) return {};
  try {
    return (await response.json()) as SyncResponseBody;
  } catch {
    return {};
  }
}

/**
 * Stoesst einen serverseitigen Lauf an.
 *
 * Der Client kennt die Feed-Adresse nicht und sieht sie nie: Er ruft nur die
 * Edge Function auf, die das Secret serverseitig liest. Das Zugangstoken der
 * Sitzung haengt supabase-js selbst an — eine `user_id` wird bewusst **nicht**
 * mitgeschickt, sie stammt serverseitig aus dem geprueften JWT.
 */
export async function triggerCalendarSync(): Promise<CalendarSyncSummary> {
  const invocation = await supabase.functions.invoke<SyncResponseBody>(
    CALENDAR_SYNC_FUNCTION,
    { method: "POST" },
  );
  const error: unknown = invocation.error;
  const data: SyncResponseBody | null = invocation.data;

  if (error) {
    const context: unknown = (error as { context?: unknown }).context;
    const response = context instanceof Response ? context : undefined;
    const body = await readBody(response);
    if (response?.status === 404 && body.status !== "error") {
      throw new CalendarSyncError(NOT_DEPLOYED_ERROR);
    }
    throw new CalendarSyncError(safeMessage(body), body.status === "running");
  }

  if (data?.status !== "success") {
    throw new CalendarSyncError(safeMessage(data), data?.status === "running");
  }

  return {
    eventsRead: count(data.eventsRead),
    created: count(data.created),
    updated: count(data.updated),
    removed: count(data.removed),
    skipped: count(data.skipped),
  };
}
