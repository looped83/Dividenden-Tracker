import { describe, expect, it, vi } from "vitest";
import {
  NewsSourceError,
  collectNews,
  decodeEntities,
  marketauxSymbol,
  marketauxUrl,
  parseMarketaux,
  parseYahoo,
  yahooSymbol,
  yahooUrl,
  type NewsSecurity,
} from "../../../supabase/functions/_shared/news.ts";

/**
 * News-Abruf der Edge Function `sync-news` (Marketaux, Yahoo). Alle Namen, Kürzel
 * und Meldungen sind erfunden; der echte API-Key steht nur im Supabase-Secret.
 */
const API_KEY = "geheimer-test-key";
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

describe("marketauxSymbol", () => {
  it("hängt die Börse nach dem ISIN-Land an", () => {
    expect(marketauxSymbol({ ticker: "MUS", isin: "DE0000000001" })).toBe("MUS.DE");
    expect(marketauxSymbol({ ticker: "MUS", isin: "GB0000000001" })).toBe("MUS.L");
    expect(marketauxSymbol({ ticker: "mus", isin: "US0000000001" })).toBe("MUS");
    expect(marketauxSymbol({ ticker: "MUS.F", isin: "DE0000000001" })).toBe("MUS.F");
    expect(marketauxSymbol({ ticker: null, isin: "US0000000001" })).toBeNull();
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

describe("marketauxUrl", () => {
  it("fragt Marketaux nach Kürzel und Zeitpunkt", () => {
    const url = new URL(marketauxUrl("BSPI", SINCE, API_KEY));
    expect(url.searchParams.get("symbols")).toBe("BSPI");
    expect(url.searchParams.get("published_after")).toBe("2026-10-23T12:00");
  });
});

describe("yahooSymbol", () => {
  it("nimmt für Fonds das Xetra-Kürzel, für Aktien das von Marketaux", () => {
    expect(yahooSymbol(ETF)).toBe("MGDV.DE");
    expect(yahooSymbol({ ...ETF, isin: "US0000000002" })).toBe("MGDV");
    expect(yahooSymbol(AKTIE)).toBe("BSPI");
    expect(yahooSymbol({ ...AKTIE, isin: "GB0000000001" })).toBe("BSPI.L");
    expect(yahooSymbol({ ...ETF, ticker: null })).toBeNull();
  });

  it("baut die Feed-Adresse", () => {
    expect(new URL(yahooUrl("MGDV.DE")).searchParams.get("s")).toBe("MGDV.DE");
  });
});

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Yahoo</title>
<item><title><![CDATA[Muster Global Dividend &amp; Co. legt zu]]></title>
<link>https://finance.example.test/news/a</link><guid isPermaLink="false">y-1</guid>
<description>Der <b>Fonds</b> steigt.</description><pubDate>Thu, 29 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>Zu alt</title><link>https://finance.example.test/news/b</link>
<pubDate>Mon, 05 Oct 2026 08:00:00 +0000</pubDate></item>
<item><title>Unsicher</title><link>http://x.test/c</link>
<pubDate>Thu, 29 Oct 2026 08:00:00 +0000</pubDate></item>
</channel></rss>`;

describe("parseYahoo", () => {
  it("übernimmt Schlagzeilen ab dem Zeitpunkt mit https-Link", () => {
    expect(parseYahoo(RSS, ETF, SINCE)).toEqual([
      {
        security_id: "sec-2",
        provider: "yahoo",
        external_id: "y-1",
        title: "Muster Global Dividend & Co. legt zu",
        snippet: "Der Fonds steigt.",
        url: "https://finance.example.test/news/a",
        source: "finance.example.test",
        language: "en",
        sentiment: null,
        published_at: "2026-10-29T08:00:00.000Z",
      },
    ]);
  });

  it("wirft, wenn keine RSS-Antwort kommt", () => {
    expect(() => parseYahoo("<html>gesperrt</html>", ETF, SINCE)).toThrow(
      NewsSourceError,
    );
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

  /** Antwortet je nach Adresse wie Marketaux oder Yahoo. */
  function byHost(marketaux: () => Response) {
    return vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(url.includes("marketaux") ? marketaux() : new Response(RSS));
    });
  }

  it("fragt Marketaux für Aktien und Yahoo für ETFs", async () => {
    const fetchImpl = byHost(() => new Response(marketauxBody));
    const result = await collectNews({
      securities: [AKTIE, ETF],
      since: SINCE,
      marketauxKey: API_KEY,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      requests: 2,
      failed: 0,
      yahoo: { requests: 1, items: 1 },
    });
    expect(result.items.map((entry) => [entry.security_id, entry.provider])).toEqual([
      ["sec-1", "marketaux"],
      ["sec-2", "yahoo"],
    ]);
  });

  it("fragt Yahoo für eine Aktie, bei der Marketaux scheitert", async () => {
    const fetchImpl = byHost(() => new Response("abgelehnt", { status: 429 }));
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      marketauxKey: API_KEY,
      fetchImpl,
      marketauxRetryMs: 0,
    });
    expect(result).toMatchObject({ requests: 2, failed: 1, yahoo: { requests: 1 } });
    expect(result.errorCodes).toEqual(["marketaux:http:429"]);
  });

  it("fragt ohne Key nur Yahoo", async () => {
    const fetchImpl = byHost(() => new Response(marketauxBody));
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      marketauxKey: null,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toMatch(/feeds\.finance\.yahoo\.com/);
    expect(result.yahoo).toEqual({ requests: 1, items: 1 });
  });

  it("zählt Ausfälle einzeln und verrät weder Adresse noch Key", async () => {
    // Die Fehlermeldung von fetch nennt die Adresse samt Key.
    const fetchImpl = vi.fn(() =>
      Promise.reject(new TypeError(`connect failed ?api_token=${API_KEY}`)),
    );
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      marketauxKey: API_KEY,
      fetchImpl,
    });
    expect(result.failed).toBe(2);
    expect(result.errorCodes).toEqual(["marketaux:network", "yahoo:network"]);
    expect(result.errorCodes.join(" ")).not.toContain(API_KEY);
  });

  it("versucht es nach 429 einmal erneut", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(() => {
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
      marketauxKey: API_KEY,
      fetchImpl,
      marketauxRetryMs: 0,
    });
    expect(calls).toBe(2);
    expect(result).toMatchObject({ requests: 1, failed: 0 });
  });

  it("hört nach 402 (Tageskontingent) auf", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response("limit", { status: 402 })),
    );
    const zweite = { ...AKTIE, id: "sec-3", ticker: "ZWM" };
    const result = await collectNews({
      securities: [AKTIE, zweite],
      since: SINCE,
      marketauxKey: API_KEY,
      fetchImpl,
    });
    // Die gescheiterte Aktie fragt danach Yahoo, die übersprungene nicht.
    expect(result).toMatchObject({ requests: 2, failed: 2, skipped: 1 });
  });

  it("startet nach Ablauf der Zeit keine Anfragen mehr", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(marketauxBody)));
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      marketauxKey: API_KEY,
      fetchImpl,
      budgetMs: 0,
    });
    expect(result).toMatchObject({ requests: 0, skipped: 1 });
  });
});
