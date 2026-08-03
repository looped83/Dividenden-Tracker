/**
 * Edge Function `sync-divvydiary-calendar` — holt den persoenlichen
 * DivvyDiary-iCal-Feed und schreibt die angekuendigten Zahltage nach Supabase.
 *
 * Laufzeit: Deno (Supabase Edge Runtime). Diese Datei ist die einzige Stelle
 * mit Laufzeitbezug — Abruf, Parsen und Abgleich stehen in `../_shared/*.ts`
 * und werden von den Unit-Tests des Projekts geprueft.
 *
 * Sicherheit (Auftrag §7):
 * - Die Feed-URL steht ausschliesslich im Secret `DIVVYDIARY_ICAL_URL`; sie
 *   verlaesst diese Funktion weder in einer Antwort noch in einem Logeintrag.
 * - Die Nutzerkennung stammt aus dem geprueften JWT (`auth.getUser`), niemals
 *   aus dem Anfragekoerper.
 * - Geschrieben wird mit service_role, nachdem die Identitaet feststeht; jede
 *   Abfrage filtert zusaetzlich explizit auf diese Kennung.
 * - Der Client bekommt nur Zaehler und eine vorformulierte Meldung zurueck.
 */
// Versionen stehen in `deno.json` neben dieser Datei — eine Stelle fuer beide
// Abhaengigkeiten der Funktion (supabase-js und ical.js, letztere in `_shared`).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DISPLAY_TIME_ZONE, calendarDayInZone } from "../_shared/datetime.ts";
import { FeedError, fetchIcalFeed } from "../_shared/feed.ts";
import { parseIcalCalendar } from "../_shared/ical.ts";
import { logCodeFor, userMessageFor } from "../_shared/messages.ts";
import {
  CALENDAR_SOURCE,
  runCalendarSync,
  type CalendarEventStore,
  type CalendarEventWrite,
  type StoredCalendarEvent,
  type SyncResult,
} from "../_shared/sync.ts";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};

/** Die Spalten, die der Abgleich vergleicht — nichts darueber hinaus. */
const EVENT_COLUMNS = [
  "id",
  "external_uid",
  "event_type",
  "event_state",
  "title",
  "company_name",
  "expected_amount",
  "expected_currency",
  "source_portfolio",
  "description",
  "location",
  "external_url",
  "categories",
  "event_date",
  "end_date",
  "starts_at",
  "ends_at",
  "is_all_day",
  "sequence_number",
  "recurrence_rule",
  "source_created_at",
  "source_updated_at",
  "raw_data",
].join(", ");

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Speicheranbindung des Abgleichs. Jede Anweisung filtert zusaetzlich zu
 * `id`/`external_uid` auf `user_id` und `source`: service_role umgeht RLS, die
 * Eingrenzung muss hier also ausdruecklich stehen.
 */
function createStore(
  admin: SupabaseClient,
  userId: string,
  now: string,
): CalendarEventStore {
  return {
    async loadEvents(): Promise<StoredCalendarEvent[]> {
      const { data, error } = await admin
        .from("dividend_calendar_events")
        .select(EVENT_COLUMNS)
        .eq("user_id", userId)
        .eq("source", CALENDAR_SOURCE);
      if (error) throw new Error("load_failed");
      return (data ?? []) as unknown as StoredCalendarEvent[];
    },

    async insertEvents(rows: CalendarEventWrite[]): Promise<void> {
      const { error } = await admin.from("dividend_calendar_events").insert(
        rows.map((row) => ({
          ...row,
          user_id: userId,
          source: CALENDAR_SOURCE,
          first_synced_at: now,
          last_synced_at: now,
        })),
      );
      if (error) throw new Error("insert_failed");
    },

    async updateEvents(rows: StoredCalendarEvent[]): Promise<void> {
      for (const { id, ...row } of rows) {
        const { error } = await admin
          .from("dividend_calendar_events")
          .update({ ...row, last_synced_at: now })
          .eq("id", id)
          .eq("user_id", userId);
        if (error) throw new Error("update_failed");
      }
    },

    async markRemoved(ids: string[]): Promise<void> {
      const { error } = await admin
        .from("dividend_calendar_events")
        .update({ event_state: "removed_from_source", last_synced_at: now })
        .in("id", ids)
        .eq("user_id", userId);
      if (error) throw new Error("remove_failed");
    },
  };
}

async function finish(
  admin: SupabaseClient,
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("calendar_sync_status")
    .update(fields)
    .eq("user_id", userId)
    .eq("source", CALENDAR_SOURCE);
  if (error) {
    console.error("calendar-sync: status_update_failed");
  }
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ status: "error", message: "Methode nicht erlaubt." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("calendar-sync: missing_runtime_configuration");
    return json({ status: "error", message: userMessageFor(null) }, 500);
  }

  // 1) Identitaet aus dem JWT bestimmen. Ohne gueltiges Token endet die
  //    Anfrage hier — die Funktion ist nie anonym ausfuehrbar.
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return json({ status: "error", message: "Nicht angemeldet." }, 401);
  }
  const asUser = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return json({ status: "error", message: "Nicht angemeldet." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2) Lauf belegen. Gleichzeitige Anfragen laufen nicht doppelt (Auftrag §6).
  const { data: claimed, error: claimError } = await admin.rpc("claim_calendar_sync", {
    p_user_id: userId,
    p_source: CALENDAR_SOURCE,
  });
  if (claimError) {
    console.error("calendar-sync: claim_failed");
    return json({ status: "error", message: userMessageFor(null) }, 500);
  }
  if (claimed !== true) {
    return json({ status: "running", message: "Die Aktualisierung läuft bereits." }, 409);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const today = calendarDayInZone(now, DISPLAY_TIME_ZONE);

  try {
    // 3) Feed laden und parsen. Beides geschieht **vor** jedem Schreibzugriff:
    //    Ein Ausfall der Quelle darf gespeicherte Termine nie beruehren.
    const feedUrl = Deno.env.get("DIVVYDIARY_ICAL_URL");
    if (!feedUrl) throw new FeedError("not_configured");
    const icalText = await fetchIcalFeed(feedUrl);
    const { events, skipped } = parseIcalCalendar(icalText);

    const result: SyncResult = await runCalendarSync({
      events,
      skipped,
      store: createStore(admin, userId, nowIso),
      today,
    });

    await finish(admin, userId, {
      state: "success",
      last_success_at: nowIso,
      events_read: result.eventsRead,
      events_created: result.created,
      events_updated: result.updated,
      events_removed: result.removed,
      events_skipped: result.skipped,
      error_message: null,
    });

    console.log(
      `calendar-sync: ok read=${String(result.eventsRead)} new=${String(result.created)} upd=${String(result.updated)} rem=${String(result.removed)} skip=${String(result.skipped)}`,
    );
    return json({ status: "success", ...result, lastSuccessAt: nowIso }, 200);
  } catch (error) {
    // Nur ein Code, kein Fehlertext: Meldungen von `fetch` enthalten die
    // angefragte Adresse — und die traegt den Token.
    console.error(`calendar-sync: ${logCodeFor(error)}`);
    const message = userMessageFor(error);
    await finish(admin, userId, { state: "error", error_message: message });
    return json({ status: "error", message }, 502);
  }
}

Deno.serve((request: Request) => handle(request));
