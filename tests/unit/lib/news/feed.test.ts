import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEWS_FILTERS,
  buildNewsFeed,
  countActiveNewsFilters,
  isDividendNews,
} from "@/lib/news/feed";
import type { NewsItemRow } from "@/lib/supabase/repositories/news";

const NOW = new Date("2026-10-30T12:00:00Z");

function row(
  id: string,
  securityId: string,
  title: string,
  publishedAt: string,
  snippet: string | null = null,
): NewsItemRow {
  return {
    id,
    security_id: securityId,
    provider: "google_news",
    title,
    snippet,
    url: `https://example.test/${id}`,
    source: "Musterzeitung",
    sentiment: null,
    published_at: publishedAt,
  };
}

const ROWS = [
  row("1", "a", "Muster AG erhöht die Dividende", "2026-10-30T08:00:00Z"),
  row("2", "b", "Muster AG erhöht die Dividende!", "2026-10-30T08:05:00Z", "Auszug"),
  row("3", "a", "Muster AG baut Werk", "2026-10-29T08:00:00Z"),
  row("4", "b", "Beispiel Inc. quarterly results", "2026-10-26T08:00:00Z"),
  row("5", "b", "Beispiel Inc. alt", "2026-10-10T08:00:00Z"),
];

describe("buildNewsFeed", () => {
  it("gliedert nach Tagen, legt Dubletten zusammen und lässt Altes weg", () => {
    const days = buildNewsFeed(ROWS, DEFAULT_NEWS_FILTERS, NOW);
    expect(days.map((day) => day.label)).toEqual([
      "Heute",
      "Gestern",
      "Montag, 26.10.2026",
    ]);
    expect(days[0]?.entries).toHaveLength(1);
    expect(days[0]?.entries[0]).toMatchObject({
      securityIds: ["a", "b"],
      snippet: "Auszug",
      dividend: true,
    });
  });

  it("filtert nach Asset, Thema und Zeitraum", () => {
    expect(
      buildNewsFeed(ROWS, { ...DEFAULT_NEWS_FILTERS, securityId: "a" }, NOW).flatMap(
        (day) => day.entries,
      ),
    ).toHaveLength(2);
    expect(
      buildNewsFeed(ROWS, { ...DEFAULT_NEWS_FILTERS, topic: "dividend" }, NOW).flatMap(
        (day) => day.entries,
      ),
    ).toHaveLength(1);
    expect(
      buildNewsFeed(ROWS, { ...DEFAULT_NEWS_FILTERS, period: "30" }, NOW).flatMap(
        (day) => day.entries,
      ),
    ).toHaveLength(4);
  });
});

describe("isDividendNews", () => {
  it("erkennt deutsche und englische Begriffe", () => {
    expect(
      isDividendNews({ title: "Sonderausschüttung beschlossen", snippet: null }),
    ).toBe(true);
    expect(isDividendNews({ title: "Company cuts dividends", snippet: null })).toBe(true);
    expect(
      isDividendNews({ title: "Neuer Chef", snippet: "Ex-Dividend am Montag" }),
    ).toBe(true);
    expect(isDividendNews({ title: "Neuer Chef", snippet: null })).toBe(false);
  });
});

describe("countActiveNewsFilters", () => {
  it("zählt nur Abweichungen von der Voreinstellung", () => {
    expect(countActiveNewsFilters(DEFAULT_NEWS_FILTERS)).toBe(0);
    expect(countActiveNewsFilters({ securityId: "a", period: "30", topic: "all" })).toBe(
      2,
    );
  });
});
