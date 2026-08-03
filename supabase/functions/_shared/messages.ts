/**
 * Nutzermeldungen und Bereinigung der Kalendersynchronisation (Auftrag §7/§12).
 *
 * Regel: Was der Client zu sehen bekommt, entsteht **hier** — aus einem
 * bekannten Code, nicht aus einer weitergereichten technischen Meldung. Damit
 * kann weder die Feed-Adresse noch der Token noch ein Datenbankdetail nach
 * aussen gelangen, auch nicht durch einen unerwarteten Fehler.
 */
import { FeedError, type FeedErrorCode } from "./feed.ts";
import { IcalParseError } from "./ical.ts";

const GENERIC =
  "Der Dividendenkalender konnte gerade nicht aktualisiert werden. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.";

const BY_CODE: Record<FeedErrorCode, string> = {
  not_configured:
    "Für den Dividendenkalender ist noch keine Kalenderquelle hinterlegt. Bitte das Secret DIVVYDIARY_ICAL_URL im Supabase-Projekt setzen.",
  http: "Die Kalenderquelle hat die Anfrage abgelehnt. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.",
  content_type:
    "Die Kalenderquelle hat keinen gültigen Kalender geliefert. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.",
  empty:
    "Die Kalenderquelle hat einen leeren Kalender geliefert. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.",
  too_large:
    "Die Kalenderquelle hat eine unerwartet große Antwort geliefert. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.",
  timeout:
    "Die Kalenderquelle hat nicht rechtzeitig geantwortet. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.",
  network: GENERIC,
};

/** Meldung, die dem Nutzer gezeigt und in `calendar_sync_status` abgelegt wird. */
export function userMessageFor(error: unknown): string {
  if (error instanceof FeedError) return BY_CODE[error.code];
  if (error instanceof IcalParseError) return BY_CODE.content_type;
  return GENERIC;
}

/**
 * Kurzform fuer das Server-Log: Fehlerart und — bei HTTP — der Status.
 *
 * Bewusst ohne Meldungstext des urspruenglichen Fehlers: Ein `fetch`-Fehler
 * nennt in vielen Laufzeiten die angefragte Adresse, und die enthaelt den
 * Token. Rohdaten des Feeds werden ebenfalls nie protokolliert (Auftrag §7).
 */
export function logCodeFor(error: unknown): string {
  if (error instanceof FeedError) {
    return error.status === null
      ? `feed:${error.code}`
      : `feed:${error.code}:${String(error.status)}`;
  }
  if (error instanceof IcalParseError) return "ical:parse";
  if (error instanceof Error) return `internal:${error.name}`;
  return "internal:unknown";
}
