/**
 * Der lesende Zugriff der Discovery (Auftrag Phase B0 §4).
 *
 * Zwei Zusagen macht dieses Modul, und beide sind technisch erzwungen, nicht
 * bloss vereinbart:
 *
 * 1. **Es wird nur gelesen.** `assertReadOnlyMethod` laesst ausschliesslich GET
 *    und HEAD durch und wirft bei allem anderen, bevor irgendein Netzwerk-
 *    aufruf stattfindet. Ein spaeterer Beitrag kann keinen schreibenden Aufruf
 *    „aus Versehen" hinzufuegen — er scheitert am Wachposten und an dessen Test.
 * 2. **Es wird nur der bekannte Host angefragt.** Weiterleitungen werden nicht
 *    blind verfolgt, sondern gemeldet; sonst genuegte eine Umleitung, um den
 *    API-Schluessel an einen fremden Server zu schicken.
 *
 * `fetch` wird hereingereicht — wie in `supabase/functions/_shared/feed.ts` —,
 * damit Statuscodes, Zeitueberschreitungen und kaputte Antworten ohne Server
 * pruefbar sind.
 */

import { API_ORIGIN } from "./endpoints.ts";

/** Nur diese Methoden sind nachweislich lesend. */
const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

export class UnsafeMethodError extends Error {
  constructor(method: string) {
    super(
      `Die Discovery ist ausschliesslich lesend: „${method}" ist nicht zulaessig ` +
        `(erlaubt: ${[...READ_ONLY_METHODS].join(", ")}).`,
    );
    this.name = "UnsafeMethodError";
  }
}

/**
 * Wachposten vor jedem Aufruf. Wirft — statt `false` zurueckzugeben —, damit
 * ein Aufrufer die Pruefung nicht stillschweigend ignorieren kann.
 */
export function assertReadOnlyMethod(method: string): void {
  if (!READ_ONLY_METHODS.has(method.toUpperCase())) throw new UnsafeMethodError(method);
}

/** 15 Sekunden, wie beim Kalenderabruf: grosszuegig, aber endlich. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** 2 MB. Eine Depotantwort liegt weit darunter; eine Swagger-Seite auch. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export type ProbeOutcome =
  /** Antwort erhalten — `status` sagt, ob sie erfolgreich war. */
  | "response"
  /** Weiterleitung auf einen anderen Host; bewusst nicht verfolgt. */
  | "redirect_blocked"
  | "timeout"
  | "network_error"
  | "too_large";

export interface ProbeResult {
  readonly endpointId: string;
  readonly url: string;
  readonly outcome: ProbeOutcome;
  readonly status: number | null;
  readonly statusText: string | null;
  readonly contentType: string | null;
  readonly headers: Readonly<Record<string, string>>;
  readonly durationMs: number;
  readonly bodyBytes: number | null;
  /** Nur bei `response` gesetzt; der Aufrufer maskiert, bevor er ausgibt. */
  readonly body: string | null;
  /** Nur bei Fehlausgang: eine kurze, technische Beschreibung ohne Geheimnisse. */
  readonly detail: string | null;
}

/**
 * Header, die fuer die Bewertung der API zaehlen (Auftrag §6): Versionierung,
 * Rate Limits, Zwischenspeicherung. Alle anderen bleiben aussen vor — je
 * weniger ein Bericht enthaelt, desto weniger kann er verraten.
 */
const REPORTED_HEADERS = [
  "content-type",
  "content-length",
  "etag",
  "last-modified",
  "cache-control",
  "date",
  "link",
  "location",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "x-api-version",
  "api-version",
  "server",
];

function pickHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of REPORTED_HEADERS) {
    const value = headers.get(name);
    if (value !== null) result[name] = value;
  }
  return result;
}

export interface ProbeOptions {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

/**
 * Fragt genau einen Endpunkt an. Wirft nie wegen des Netzwerks — jeder
 * Fehlausgang ist ein Ergebnis, denn „nicht erreichbar" und „401" sind fuer
 * die Bewertung genauso wertvoll wie „200".
 */
export async function probe(
  endpointId: string,
  url: string,
  options: ProbeOptions,
): Promise<ProbeResult> {
  assertReadOnlyMethod("GET");

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const clock = options.now ?? (() => Date.now());
  const startedAt = clock();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const base = {
    endpointId,
    url,
    status: null,
    statusText: null,
    contentType: null,
    headers: {},
    bodyBytes: null,
    body: null,
  } as const;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "GET",
      headers: {
        // Genau ein Kopfzeilenfeld traegt das Geheimnis, und nur an diesen Host.
        "x-api-key": options.apiKey,
        accept: "application/json, text/html;q=0.5, */*;q=0.1",
        "user-agent": "DividendenTracker-Discovery/0.1 (read-only)",
      },
      // Nicht `follow`: Eine Weiterleitung auf einen fremden Host wuerde den
      // Schluessel dorthin mitnehmen. Sie wird stattdessen berichtet.
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = controller.signal.aborted || isAbortLike(error);
    return {
      ...base,
      outcome: aborted ? "timeout" : "network_error",
      durationMs: clock() - startedAt,
      detail: aborted
        ? `Zeitgrenze ${String(timeoutMs)} ms ueberschritten`
        : "fetch fehlgeschlagen",
    };
  } finally {
    clearTimeout(timer);
  }

  const headers = pickHeaders(response.headers);
  const durationMs = clock() - startedAt;
  const shared = {
    endpointId,
    url,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    headers,
    durationMs,
  };

  if (isRedirect(response.status)) {
    const target = response.headers.get("location");
    return {
      ...shared,
      outcome: "redirect_blocked",
      bodyBytes: null,
      body: null,
      detail: describeRedirect(target),
    };
  }

  let body: string;
  try {
    body = await response.text();
  } catch {
    return {
      ...shared,
      outcome: "network_error",
      bodyBytes: null,
      body: null,
      detail: "Antwortkoerper nicht lesbar",
    };
  }

  if (body.length > MAX_BODY_BYTES) {
    return {
      ...shared,
      outcome: "too_large",
      bodyBytes: body.length,
      body: null,
      detail: `Antwort groesser als ${String(MAX_BODY_BYTES)} Zeichen`,
    };
  }

  return {
    ...shared,
    outcome: "response",
    bodyBytes: body.length,
    body,
    detail: null,
  };
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

/**
 * Beschreibt das Ziel einer Weiterleitung, ohne es vollstaendig auszugeben:
 * Der Host entscheidet ueber die Gefahr, der Pfad kann eine Kennung enthalten.
 */
function describeRedirect(target: string | null): string {
  if (target === null) return "Weiterleitung ohne Location-Kopfzeile";
  let host: string;
  try {
    host = new URL(target, API_ORIGIN).origin;
  } catch {
    return "Weiterleitung mit unlesbarer Location-Kopfzeile";
  }
  return host === API_ORIGIN
    ? `Weiterleitung innerhalb von ${API_ORIGIN} — nicht verfolgt`
    : `Weiterleitung auf fremden Host ${host} — nicht verfolgt`;
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
