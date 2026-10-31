import { describe, expect, it, vi } from "vitest";
import {
  NewsSourceError,
  collectNews,
  decodeEntities,
  marketauxSymbol,
  marketauxUrl,
  parseMarketaux,
  type NewsSecurity,
} from "../../../supabase/functions/_shared/news.ts";

/**
 * News-Abruf der Edge Function `sync-news` (Marketaux). Alle Namen, Kürzel
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

  it("fragt Marketaux nur für Aktien", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(marketauxBody)));
    const result = await collectNews({
      securities: [AKTIE, ETF],
      since: SINCE,
      marketauxKey: API_KEY,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ requests: 1, failed: 0 });
    expect(result.items.map((entry) => entry.security_id)).toEqual(["sec-1"]);
  });

  it("fragt ohne Key nichts an", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(marketauxBody)));
    const result = await collectNews({
      securities: [AKTIE],
      since: SINCE,
      marketauxKey: null,
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.requests).toBe(0);
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
    expect(result.failed).toBe(1);
    expect(result.errorCodes).toEqual(["marketaux:network"]);
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
    expect(result).toMatchObject({ requests: 1, failed: 1, skipped: 1 });
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
