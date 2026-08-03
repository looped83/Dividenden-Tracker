import { describe, expect, it, vi } from "vitest";
import {
  FeedError,
  fetchIcalFeed,
  isPlausibleFeedUrl,
} from "../../../supabase/functions/_shared/feed.ts";
import {
  logCodeFor,
  userMessageFor,
} from "../../../supabase/functions/_shared/messages.ts";

/**
 * Abruf des iCal-Feeds (Auftrag §20 „HTTP-Fehler / Timeout / leere Antwort").
 *
 * Die hier verwendete Adresse ist frei erfunden; der echte Feed steht
 * ausschliesslich im Supabase-Secret DIVVYDIARY_ICAL_URL.
 */
const FEED_URL = "https://feed.example.test/ical?token=beispiel-token";

const KALENDER = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:pay-1",
  "DTSTART;VALUE=DATE:20260813",
  "SUMMARY:Beispiel AG",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function antwort(
  body: string,
  init: { status?: number; contentType?: string | null } = {},
): Response {
  const headers = new Headers();
  if (init.contentType !== null) {
    headers.set("content-type", init.contentType ?? "text/calendar; charset=utf-8");
  }
  return new Response(body, { status: init.status ?? 200, headers });
}

describe("isPlausibleFeedUrl", () => {
  it("verlangt HTTPS", () => {
    expect(isPlausibleFeedUrl("https://feed.example.test/ical")).toBe(true);
    expect(isPlausibleFeedUrl("http://feed.example.test/ical")).toBe(false);
    expect(isPlausibleFeedUrl("kein-url")).toBe(false);
    expect(isPlausibleFeedUrl("")).toBe(false);
    expect(isPlausibleFeedUrl(undefined)).toBe(false);
  });
});

describe("fetchIcalFeed", () => {
  it("liefert den Kalendertext bei einer gueltigen Antwort", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(antwort(KALENDER)));

    await expect(fetchIcalFeed(FEED_URL, { fetchImpl })).resolves.toBe(KALENDER);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("meldet einen HTTP-Fehler, ohne die Adresse preiszugeben", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(antwort("Forbidden", { status: 403, contentType: "text/plain" })),
    );

    const fehler = await fetchIcalFeed(FEED_URL, { fetchImpl }).catch(
      (error: unknown) => error,
    );

    expect(fehler).toBeInstanceOf(FeedError);
    expect((fehler as FeedError).code).toBe("http");
    expect((fehler as FeedError).status).toBe(403);
    expect(JSON.stringify(fehler)).not.toContain("token");
  });

  it("weist eine HTML-Fehlerseite zurueck", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        antwort("<html>Fehler</html>", { contentType: "text/html; charset=utf-8" }),
      ),
    );

    await expect(fetchIcalFeed(FEED_URL, { fetchImpl })).rejects.toMatchObject({
      code: "content_type",
    });
  });

  it("weist eine Antwort ohne VCALENDAR zurueck", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(antwort("nur Text")));

    await expect(fetchIcalFeed(FEED_URL, { fetchImpl })).rejects.toMatchObject({
      code: "content_type",
    });
  });

  it("meldet eine leere Antwort", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(antwort("   ")));

    await expect(fetchIcalFeed(FEED_URL, { fetchImpl })).rejects.toMatchObject({
      code: "empty",
    });
  });

  it("bricht nach der Zeitgrenze ab", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    await expect(
      fetchIcalFeed(FEED_URL, { fetchImpl, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("meldet einen Verbindungsfehler", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(fetchIcalFeed(FEED_URL, { fetchImpl })).rejects.toMatchObject({
      code: "network",
    });
  });

  it("meldet eine unbrauchbare Adresse als fehlende Konfiguration", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(antwort(KALENDER)));

    await expect(fetchIcalFeed("nicht-erreichbar", { fetchImpl })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Meldungen (Auftrag §12) enthalten keine technischen Details", () => {
  const faelle: unknown[] = [
    new FeedError("http", 403),
    new FeedError("timeout"),
    new FeedError("network"),
    new FeedError("empty"),
    new Error(`fetch failed for ${FEED_URL}`),
    "irgendetwas",
  ];

  it("gibt zu jedem Fehler eine verstaendliche Meldung ohne Adresse oder Token", () => {
    for (const fall of faelle) {
      const meldung = userMessageFor(fall);
      expect(meldung.length).toBeGreaterThan(20);
      expect(meldung).not.toContain("token");
      expect(meldung).not.toContain("feed.example.test");
      expect(meldung).not.toContain("http");
    }
  });

  it("protokolliert nur einen Code, nie den Fehlertext", () => {
    expect(logCodeFor(new FeedError("http", 403))).toBe("feed:http:403");
    expect(logCodeFor(new FeedError("timeout"))).toBe("feed:timeout");
    expect(logCodeFor(new Error(`boom ${FEED_URL}`))).toBe("internal:Error");
    expect(logCodeFor("kaputt")).toBe("internal:unknown");
  });
});
