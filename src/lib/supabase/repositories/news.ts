import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export type NewsItemRow = Pick<
  Database["public"]["Tables"]["news_items"]["Row"],
  | "id"
  | "security_id"
  | "provider"
  | "title"
  | "snippet"
  | "url"
  | "source"
  | "sentiment"
  | "published_at"
>;
export type NewsSyncStatusRow = Database["public"]["Tables"]["news_sync_status"]["Row"];

/** Name der Edge Function; eine Stelle fuer Aufruf und Dokumentation. */
const NEWS_SYNC_FUNCTION = "sync-news";

/**
 * Mehr als eine Seite gibt es nicht: Die Edge Function speichert je Asset und
 * Lauf hoechstens zehn Meldungen und loescht nach 30 Tagen. 1.000 Zeilen sind
 * zugleich die Grenze einer PostgREST-Antwort.
 */
const MAX_ROWS = 1000;

// prettier-ignore
const NEWS_COLUMNS = "id, security_id, provider, title, snippet, url, source, sentiment, published_at";

export async function fetchNewsItems(): Promise<NewsItemRow[]> {
  const { data, error } = await supabase
    .from("news_items")
    .select(NEWS_COLUMNS)
    .order("published_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_ROWS);
  if (error) throw error;
  return data;
}

export async function fetchNewsSyncStatus(): Promise<NewsSyncStatusRow | null> {
  const { data, error } = await supabase
    .from("news_sync_status")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

const GENERIC_SYNC_ERROR =
  "Die News konnten gerade nicht aktualisiert werden. Die zuletzt gespeicherten Meldungen werden weiterhin angezeigt.";

/**
 * Stoesst einen Abruf an. Der Server entscheidet, ob er wirklich abruft
 * (hoechstens alle 12 Stunden, Kontingent der Quelle) — `fresh` ist deshalb
 * kein Fehler, sondern „nichts zu tun". Der API-Key bleibt serverseitig.
 */
export async function triggerNewsSync(): Promise<void> {
  const invocation = await supabase.functions.invoke<{ status?: unknown }>(
    NEWS_SYNC_FUNCTION,
    { method: "POST" },
  );
  const error: unknown = invocation.error;
  const status = invocation.data?.status;
  if (error || (status !== "success" && status !== "fresh")) {
    throw new Error(GENERIC_SYNC_ERROR);
  }
}
