import { describe, expect, it, vi } from "vitest";
import {
  NewsSourceError,
  collectNews,
  decodeEntities,
  gdeltUrl,
  marketauxSymbol,
  marketauxUrl,
  parseGdelt,
  parseMarketaux,
  searchName,
  titleMentions,
  type NewsSecurity,
} from "../../../supabase/functions/_shared/news.ts";

/**
 * News-Abruf (Edge Function `sync-news`). Alle Namen, Kürzel und Meldungen
 * sind erfunden; der echte API-Key steht nur im Supabase-Secret.
 */
const API_KEY = "geheimer-test-key";
const NOW = new Date("2026-10-30T12:00:00Z");
const SINCE = new Date("2026-10-23T12:00:00Z");

const AKTIE: NewsSecurity = {
  id: "sec-1",
  name: "Beispiel Immobilien Corp.",
  ticker: "BSPI",
  isin: "US0000000001",
  isEquity: true,
};

const ETF: NewsSecurity = {
  id: "sec-2",
  name: "Muster Global Dividend UCITS ETF (Dist)",
  ticker: "MGDV",
  isin: "IE0000000002",
  isEquity: false,
};

function href(request: RequestInfo | URL): string {
  if (typeof request === "string") return request;
  return request instanceof URL ? request.href : request.url;
}

function gdelt(articles: object[]): string {
  return JSON.stringify({ articles });
}

function article(title: string, seendate: string, language: string): object {
  return {
    url: `https://example.test/${encodeURIComponent(title)}`,
    title,
    seendate,
    domain: "example.test",
    language,
  };
}

describe("searchName", () => {
  it("entfernt Rechtsform, Klammern und Fondszusätze", () => {
    expect(searchName("Beispiel Immobilien Corp.")).toBe("Beispiel Immobilien");
    expect(searchName("Muster Holdings Inc.")).toBe("Muster");
    expect(searchName("Muster Global Dividend UCITS ETF (Dist)")).toBe(
      "Muster Global Dividend",
    );
    expect(searchName("Muster Versicherung SE")).toBe("Muster Versicherung");
    expect(searchName("Muster Bank & Co.")).toBe("Muster Bank");
    expect(searchName("Muster Tabak plc ADR")).toBe("Muster Tabak");
  });

  it("lässt einen Namen ohne Zusatz unverändert", () => {
    expect(searchName("Muster")).toBe("Muster");
  });
});

describe("marketauxSymbol", () => {
  it("hängt die Börse nach dem ISIN-Land an", () => {
    expect(marketauxSymbol({ ticker: "MUS", isin: "DE0000000001" })).toBe("MUS.DE");
    expect(marketauxSymbol({ ticker: "MUS", isin: "GB0000000001" })).toBe("MUS.L");
    expect(marketauxSymbol({ ticker: "mus", isin: "US0000000001" })).toBe("MUS");
    expect(marketauxSymbol({ ticker: "MUS.F", isin: "DE0000000001" })).toBe("MUS.F");
    expect(marketauxSymbol({ ticker: null, isin: "US0000000001" })).toBeNull();
  });
});

describe("titleMentions", () => {
  it("verlangt Name oder Kürzel im Titel", () => {
    expect(titleMentions("Beispiel Immobilien erhöht Dividende", AKTIE)).toBe(true);
    expect(titleMentions("BSPI: Quartalszahlen", AKTIE)).toBe(true);
    expect(titleMentions("Immobilienmarkt kühlt ab", AKTIE)).toBe(false);
  });

  it("nimmt kurze Kürzel nicht als Treffer", () => {
    expect(titleMentions("O wie Oktober", { name: "Realty Beispiel", ticker: "O" })).toBe(
      false,
    );
  });

  it("erkennt abgekürzte lange Namen an den ersten beiden Wörtern", () => {
    expect(titleMentions("Muster Global zahlt aus", ETF)).toBe(true);
  });
});

describe("decodeEntities", () => {
  it("löst benannte und numerische Zeichen auf", () => {
    expect(decodeEntities("A &amp; B &#252; &#x2013; &quot;x&quot;")).toBe(
      'A & B ü – "x"',
    );
  });
});

describe("parseMarketaux", () => {
  const body = JSON.stringify({
    data: [
      {
        uuid: "m-1",
        title: "Beispiel Immobilien raises dividend",
        description: "  The company   raised its payout. ",
        url: "https://example.test/a",
        source: "example.test",
        language: "en",
        published_at: "2026-10-29T08:00:00.000000Z",
        entities: [{ symbol: "BSPI", sentiment_score: 0.61234 }],
      },
      {
        uuid: "m-2",
        title: "Ohne Link",
        url: "http://unsicher.test",
        published_at: "2026-10-29T08:00:00Z",
      },
    ],
  });

  it("übernimmt gültige Meldungen mit Stimmung zum Kürzel", () => {
    const items = parseMarketaux(body, AKTIE, "BSPI");
    expect(items).toEqual([
      {
        security_id: "sec-1",
        provider: "marketaux",
        external_id: "m-1",
        title: "Beispiel Immobilien raises dividend",
        snippet: "The company raised its payout.",
        url: "https://example.test/a",
        source: "example.test",
        language: "en",
        sentiment: 0.612,
        published_at: "2026-10-29T08:00:00.000Z",
      },
    ]);
  });

  it("wirft bei kaputtem Format", () => {
    expect(() => parseMarketaux("<html>", AKTIE, "BSPI")).toThrow(NewsSourceError);
    expect(() => parseMarketaux("{}", AKTIE, "BSPI")).toThrow(NewsSourceError);
  });
});

describe("parseGdelt", () => {
  const body = gdelt([
    article("Beispiel Immobilien: Ausschüttung steigt", "20261028T090000Z", "German"),
    article("Muster Global Dividend legt zu", "20261030T070000Z", "English"),
    article("Zinsen bewegen den Markt", "20261029T090000Z", "German"),
    article("Beispiel Immobilien alt", "20260901T090000Z", "German"),
    article("Beispiel Immobilien auf Spanisch", "20261029T090000Z", "Spanish"),
  ]);

  it("ordnet Treffer über den Titel zu und filtert Sprache und Alter", () => {
    const items = parseGdelt(body, [AKTIE, ETF], SINCE);
    expect(items.map((entry) => [entry.security_id, entry.title])).toEqual([
      ["sec-1", "Beispiel Immobilien: Ausschüttung steigt"],
      ["sec-2", "Muster Global Dividend legt zu"],
    ]);
    expect(items[0]).toMatchObject({
      provider: "gdelt",
      source: "example.test",
      language: "de",
      published_at: "2026-10-28T09:00:00.000Z",
    });
  });

  it("begrenzt auf fünf Meldungen je Asset", () => {
    const many = gdelt(
      Array.from({ length: 8 }, (_, index) =>
        article(`Beispiel Immobilien Nr. ${String(index)}`, "20261030T070000Z", "German"),
      ),
    );
    expect(parseGdelt(many, [AKTIE], SINCE)).toHaveLength(5);
  });

  it("nimmt eine leere Antwort hin und wirft bei Klartext", () => {
    expect(parseGdelt("{}", [AKTIE], SINCE)).toEqual([]);
    expect(() => parseGdelt("Please limit requests", [AKTIE], SINCE)).toThrow(
      NewsSourceError,
    );
  });
});

describe("Adressen", () => {
  it("sucht bei GDELT alle Namen in einer Anfrage im passenden Zeitraum", () => {
    const url = new URL(gdeltUrl([AKTIE, ETF], SINCE, NOW) ?? "");
    expect(url.searchParams.get("query")).toBe(
      '("Beispiel Immobilien" OR "Muster Global Dividend")',
    );
    expect(url.searchParams.get("timespan")).toBe("168h");
  });

  it("fragt Marketaux nach Kürzel und Zeitpunkt", () => {
    const url = new URL(marketauxUrl("BSPI", SINCE, API_KEY));
    expect(url.searchParams.get("symbols")).toBe("BSPI");
    expect(url.searchParams.get("published_after")).toBe("2026-10-23T12:00");
  });
});

describe("collectNews", () => {
  const marketauxBody = JSON.stringify({
    data: [
      {
        uuid: "m-1",
        title: "Beispiel Immobilien news",
        url: "https://example.test/a",
        published_at: "2026-10-29T08:00:00Z",
        entities: [{ symbol: "BSPI", sentiment_score: 0.2 }],
      },
    ],
  });
  const gdeltBody = gdelt([
    article("Muster Global Dividend legt zu", "20261030T070000Z", "German"),
  ]);

  it("fragt Marketaux für Aktien und GDELT nur für den Rest", async () => {
    const fetchImpl = vi.fn((request: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          href(request).startsWith("https://api.marketaux.com/")
            ? marketauxBody
            : gdeltBody,
        ),
      ),
    );
    const result = await collectNews({
      securities: [AKTIE, ETF],
      since: SINCE,
      now: NOW,
      marketauxKey: API_KEY,
      fetchImpl,
    });
    expect(result.requests).toBe(2);
    expect(result.failed).toBe(0);
    const gdeltQuery = new URL(href(fetchImpl.mock.calls[1]?.[0] ?? "")).searchParams.get(
      "query",
    );
    expect(gdeltQuery).toBe('"Muster Global Dividend"');
    expect(
      result.items.map((entry) => [entry.security_id, entry.provider]).sort(),
    ).toEqual([
      ["sec-1", "marketaux"],
      ["sec-2", "gdelt"],
    ]);
  });

  it("teilt viele Namen auf mehrere GDELT-Anfragen auf", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(gdelt([]))));
    const securities = Array.from({ length: 13 }, (_, index) => ({
      ...ETF,
      id: `etf-${String(index)}`,
      name: `Muster Fonds Nummer ${String(index)}`,
    }));
    const result = await collectNews({
      securities,
      since: SINCE,
      now: NOW,
      marketauxKey: API_KEY,
      fetchImpl,
      gdeltPauseMs: 0,
    });
    expect(result.requests).toBe(2);
  });

  it("zählt Ausfälle einzeln und verrät weder Adresse noch Key", async () => {
    const fetchImpl = vi.fn((request: RequestInfo | URL) =>
      href(request).startsWith("https://api.marketaux.com/")
        ? Promise.resolve(new Response("limit", { status: 429 }))
        : Promise.reject(new TypeError(`connect failed ${href(request)}`)),
    );
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      now: NOW,
      marketauxKey: API_KEY,
      fetchImpl,
      marketauxRetryMs: 0,
    });
    expect(result.failed).toBe(2);
    expect(result.errorCodes.sort()).toEqual(["gdelt:network", "marketaux:http:429"]);
    expect(result.errorCodes.join(" ")).not.toContain(API_KEY);
  });

  it("versucht es nach 429 einmal erneut", async () => {
    let calls = 0;
    const fetchImpl = vi.fn((request: RequestInfo | URL) => {
      if (!href(request).startsWith("https://api.marketaux.com/"))
        return Promise.resolve(new Response(gdelt([])));
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? new Response("zu schnell", { status: 429 })
          : new Response(marketauxBody),
      );
    });
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      now: NOW,
      marketauxKey: API_KEY,
      fetchImpl,
      marketauxRetryMs: 0,
    });
    expect(calls).toBe(2);
    expect(result).toMatchObject({ requests: 1, failed: 0 });
    expect(result.items.map((entry) => entry.provider)).toEqual(["marketaux"]);
  });

  it("hört nach 402 mit Marketaux auf und sucht den Rest bei GDELT", async () => {
    const fetchImpl = vi.fn((request: RequestInfo | URL) =>
      Promise.resolve(
        href(request).startsWith("https://api.marketaux.com/")
          ? new Response("limit", { status: 402 })
          : new Response(gdelt([])),
      ),
    );
    const zweite = { ...AKTIE, id: "sec-3", name: "Zweite Muster Corp.", ticker: "ZWM" };
    const result = await collectNews({
      securities: [AKTIE, zweite],
      since: SINCE,
      now: NOW,
      marketauxKey: API_KEY,
      fetchImpl,
      concurrency: 1,
    });
    expect(result).toMatchObject({ requests: 2, failed: 1, skipped: 1 });
    const gdeltQuery = new URL(href(fetchImpl.mock.calls[1]?.[0] ?? "")).searchParams.get(
      "query",
    );
    expect(gdeltQuery).toBe('("Beispiel Immobilien" OR "Zweite Muster")');
  });

  it("startet nach Ablauf der Zeit keine Marketaux-Anfragen mehr", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(gdelt([]))));
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      now: NOW,
      marketauxKey: API_KEY,
      fetchImpl,
      budgetMs: 0,
    });
    expect(result).toMatchObject({ requests: 1, skipped: 1 });
  });
});
