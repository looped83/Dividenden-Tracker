import { describe, expect, it, vi } from "vitest";
import {
  GdeltError,
  fetchGdeltNews,
  gdeltUrl,
  parseGdelt,
  searchName,
  titleMentions,
  type GdeltSecurity,
} from "@/lib/news/gdelt";

/**
 * GDELT-Abruf aus dem Browser (Bereich News). Alle Namen und Meldungen sind
 * erfunden.
 */
const AKTIE: GdeltSecurity = {
  id: "sec-1",
  name: "Beispiel Immobilien Corp.",
  ticker: "BSPI",
};

const ETF: GdeltSecurity = {
  id: "sec-2",
  name: "Muster Global Dividend UCITS ETF (Dist)",
  ticker: "MGDV",
};

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

describe("gdeltUrl", () => {
  it("sucht alle Namen in einer Anfrage über 30 Tage", () => {
    const url = new URL(gdeltUrl([AKTIE, ETF]) ?? "");
    expect(url.origin).toBe("https://api.gdeltproject.org");
    expect(url.searchParams.get("query")).toBe(
      '("Beispiel Immobilien" OR "Muster Global Dividend")',
    );
    expect(url.searchParams.get("timespan")).toBe("720h");
  });

  it("lässt zu kurze Namen weg", () => {
    expect(gdeltUrl([{ name: "AB" }])).toBeNull();
  });
});

describe("parseGdelt", () => {
  const body = gdelt([
    article("Beispiel Immobilien: Ausschüttung steigt", "20261028T090000Z", "German"),
    article("Muster Global Dividend legt zu", "20261030T070000Z", "English"),
    article("Zinsen bewegen den Markt", "20261029T090000Z", "German"),
    article("Beispiel Immobilien auf Spanisch", "20261029T090000Z", "Spanish"),
    {
      ...article("Beispiel Immobilien unsicher", "20261029T090000Z", "German"),
      url: "http://x.test",
    },
  ]);

  it("ordnet Treffer über den Titel zu und filtert Sprache und Link", () => {
    const rows = parseGdelt(body, [AKTIE, ETF]);
    expect(rows.map((row) => [row.security_id, row.title])).toEqual([
      ["sec-1", "Beispiel Immobilien: Ausschüttung steigt"],
      ["sec-2", "Muster Global Dividend legt zu"],
    ]);
    expect(rows[0]).toMatchObject({
      provider: "gdelt",
      source: "example.test",
      snippet: null,
      sentiment: null,
      published_at: "2026-10-28T09:00:00.000Z",
    });
  });

  it("begrenzt auf fünf Meldungen je Asset", () => {
    const many = gdelt(
      Array.from({ length: 8 }, (_, index) =>
        article(`Beispiel Immobilien Nr. ${String(index)}`, "20261030T070000Z", "German"),
      ),
    );
    expect(parseGdelt(many, [AKTIE])).toHaveLength(5);
  });

  it("nimmt eine leere Antwort hin und wirft bei Klartext", () => {
    expect(parseGdelt("{}", [AKTIE])).toEqual([]);
    expect(() => parseGdelt("Please limit requests", [AKTIE])).toThrow(GdeltError);
  });
});

describe("fetchGdeltNews", () => {
  const hit = gdelt([
    article("Muster Global Dividend legt zu", "20261030T070000Z", "German"),
  ]);

  it("teilt viele Namen auf mehrere Anfragen auf", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(gdelt([]))));
    const securities = Array.from({ length: 13 }, (_, index) => ({
      ...ETF,
      id: `etf-${String(index)}`,
      name: `Muster Fonds Nummer ${String(index)}`,
    }));
    await fetchGdeltNews(securities, { fetchImpl, pauseMs: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("versucht es nach „zu viele Anfragen“ einmal erneut", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(() => {
      calls += 1;
      return Promise.resolve(
        new Response(calls === 1 ? "Please limit requests to one every 5 seconds" : hit),
      );
    });
    const rows = await fetchGdeltNews([ETF], { fetchImpl, retryMs: 0 });
    expect(calls).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it("wirft, wenn alle Anfragen scheitern", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response("kaputt", { status: 500 })),
    );
    await expect(fetchGdeltNews([ETF], { fetchImpl })).rejects.toThrow(GdeltError);
  });

  it("fragt ohne Assets nichts an", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(hit)));
    expect(await fetchGdeltNews([], { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
