import { describe, expect, it, vi } from "vitest";
import {
  NewsSourceError,
  collectNews,
  decodeEntities,
  googleNewsUrl,
  marketauxSymbol,
  marketauxUrl,
  parseGoogleNews,
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

function rss(items: string[]): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${items.join("")}</channel></rss>`;
}

function item(title: string, source: string, date: string, guid = title): string {
  return `<item><title>${title} - ${source}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(guid)}</link><guid isPermaLink="false">${guid}</guid><pubDate>${date}</pubDate><description>&lt;a&gt;x&lt;/a&gt;</description><source url="https://example.test">${source}</source></item>`;
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

describe("parseGoogleNews", () => {
  it("trennt die Quelle ab, filtert fremde und alte Meldungen und sortiert neu zuerst", () => {
    const body = rss([
      item(
        "Beispiel Immobilien: Ausschüttung steigt",
        "Musterzeitung",
        "Tue, 28 Oct 2026 09:00:00 GMT",
      ),
      item(
        "Beispiel Immobilien &amp; Co. im Fokus",
        "Börse Muster",
        "Thu, 30 Oct 2026 07:00:00 GMT",
      ),
      item("Zinsen bewegen den Markt", "Musterzeitung", "Wed, 29 Oct 2026 09:00:00 GMT"),
      item("Beispiel Immobilien alt", "Musterzeitung", "Mon, 01 Sep 2026 09:00:00 GMT"),
    ]);
    const items = parseGoogleNews(body, AKTIE, SINCE);
    expect(items.map((entry) => entry.title)).toEqual([
      "Beispiel Immobilien & Co. im Fokus",
      "Beispiel Immobilien: Ausschüttung steigt",
    ]);
    expect(items[0]).toMatchObject({
      provider: "google_news",
      source: "Börse Muster",
      snippet: null,
      sentiment: null,
      published_at: "2026-10-30T07:00:00.000Z",
    });
  });

  it("begrenzt auf fünf Meldungen", () => {
    const body = rss(
      Array.from({ length: 8 }, (_, index) =>
        item(
          `Beispiel Immobilien Nr. ${String(index)}`,
          "Q",
          "Thu, 30 Oct 2026 07:00:00 GMT",
          `g${String(index)}`,
        ),
      ),
    );
    expect(parseGoogleNews(body, AKTIE, SINCE)).toHaveLength(5);
  });

  it("wirft, wenn kein RSS ankommt", () => {
    expect(() => parseGoogleNews("<html></html>", AKTIE, SINCE)).toThrow(NewsSourceError);
  });
});

describe("Adressen", () => {
  it("sucht bei Google nach dem genauen Namen im passenden Zeitraum", () => {
    const url = new URL(googleNewsUrl(AKTIE, SINCE, NOW));
    expect(url.searchParams.get("q")).toBe('"Beispiel Immobilien" when:7d');
    expect(url.searchParams.get("hl")).toBe("de");
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
  const googleBody = rss([
    item("Muster Global Dividend legt zu", "Q", "Thu, 30 Oct 2026 07:00:00 GMT"),
  ]);

  it("fragt Marketaux nur für Aktien und Google für alle", async () => {
    const fetchImpl = vi.fn((request: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          href(request).startsWith("https://api.marketaux.com/")
            ? marketauxBody
            : href(request).includes("Muster")
              ? googleBody
              : rss([]),
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
    expect(result.requests).toBe(3);
    expect(result.failed).toBe(0);
    expect(
      result.items.map((entry) => [entry.security_id, entry.provider]).sort(),
    ).toEqual([
      ["sec-1", "marketaux"],
      ["sec-2", "google_news"],
    ]);
  });

  it("überspringt Marketaux ohne Key", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(rss([]))));
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      now: NOW,
      marketauxKey: null,
      fetchImpl,
    });
    expect(result.requests).toBe(1);
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
    });
    expect(result.failed).toBe(2);
    expect(result.errorCodes.sort()).toEqual([
      "google_news:network",
      "marketaux:http:429",
    ]);
    expect(result.errorCodes.join(" ")).not.toContain(API_KEY);
  });
});
