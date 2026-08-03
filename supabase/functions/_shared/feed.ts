/**
 * Abruf des iCal-Feeds (Auftrag §2, Schritte 1–4).
 *
 * Die Feed-URL ist ein Geheimnis: Sie enthaelt den persoenlichen Token. Sie
 * wird ausschliesslich hier verwendet, taucht in keiner geworfenen Fehlermeldung
 * auf und wird nirgends protokolliert. Deshalb traegt `FeedError` nur einen
 * Code und — wo unkritisch — den HTTP-Status, niemals die Adresse.
 *
 * `fetch` wird als Parameter hereingereicht, damit HTTP-Fehler, Zeitueber-
 * schreitungen und leere Antworten testbar sind, ohne einen Server zu starten.
 */

export type FeedErrorCode =
  /** Kein oder ein unbrauchbares Secret hinterlegt. */
  | "not_configured"
  /** Der Server hat mit einem Fehlerstatus geantwortet. */
  | "http"
  /** Die Antwort ist offensichtlich kein Kalender (z. B. eine HTML-Seite). */
  | "content_type"
  /** Leere Antwort. */
  | "empty"
  /** Antwort ueberschreitet die zulaessige Groesse. */
  | "too_large"
  /** Zeitueberschreitung. */
  | "timeout"
  /** Verbindungsfehler. */
  | "network";

export class FeedError extends Error {
  readonly code: FeedErrorCode;
  /** Nur fuer die serverseitige Protokollierung; nie Teil einer Nutzermeldung. */
  readonly status: number | null;

  constructor(code: FeedErrorCode, status: number | null = null) {
    super(`Feed-Fehler: ${code}`);
    this.name = "FeedError";
    this.code = code;
    this.status = status;
  }
}

/** 15 Sekunden: grosszuegig fuer einen Kalenderabruf, kurz genug fuer eine Anfrage. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** 5 MB — ein persoenlicher Dividendenkalender liegt um Groessenordnungen darunter. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;

const ACCEPTED_CONTENT_TYPES = [
  "text/calendar",
  "application/ics",
  "text/plain",
  "application/octet-stream",
];

/** Grobe Plausibilitaetspruefung der Adresse, ohne sie preiszugeben. */
export function isPlausibleFeedUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isAcceptableContentType(header: string | null): boolean {
  // Fehlt die Angabe, entscheidet der Inhalt selbst (Pruefung unten).
  if (!header) return true;
  const type = header.split(";")[0]?.trim().toLowerCase() ?? "";
  return ACCEPTED_CONTENT_TYPES.includes(type);
}

export interface FetchIcalFeedOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Laedt den Feed und liefert seinen Text. Wirft ausschliesslich {@link FeedError}
 * — mit einem Code, aus dem die Aufrufstelle eine verstaendliche Meldung baut.
 */
export async function fetchIcalFeed(
  url: string,
  options: FetchIcalFeedOptions = {},
): Promise<string> {
  if (!isPlausibleFeedUrl(url)) throw new FeedError("not_configured");

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await doFetch(url, {
      // Nur lesen; Weiterleitungen folgt `fetch` von selbst.
      method: "GET",
      headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    throw controller.signal.aborted || isAbortLike(error)
      ? new FeedError("timeout")
      : new FeedError("network");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new FeedError("http", response.status);
  }
  if (!isAcceptableContentType(response.headers.get("content-type"))) {
    throw new FeedError("content_type");
  }

  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number.parseInt(declaredLength, 10) > MAX_FEED_BYTES) {
    throw new FeedError("too_large");
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new FeedError("network");
  }

  if (text.length > MAX_FEED_BYTES) throw new FeedError("too_large");
  if (text.trim().length === 0) throw new FeedError("empty");
  if (!text.includes("BEGIN:VCALENDAR")) throw new FeedError("content_type");

  return text;
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
