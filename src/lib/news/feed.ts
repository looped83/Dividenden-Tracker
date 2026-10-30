import { calendarDayOf, longDate } from "@/lib/calendar/format";
import type { NewsItemRow } from "@/lib/supabase/repositories/news";

/**
 * Aufbereitung der News (Bereich „News“): filtern, Dubletten zusammenlegen,
 * nach Tagen gliedern. Rein rechnerisch, damit die Seite nur darstellt.
 */

export type NewsPeriod = "7" | "30";
export type NewsTopic = "all" | "dividend";

export interface NewsFilters {
  /** Leer = alle Assets. */
  securityId: string;
  period: NewsPeriod;
  topic: NewsTopic;
}

export const DEFAULT_NEWS_FILTERS: NewsFilters = {
  securityId: "",
  period: "7",
  topic: "all",
};

export interface NewsEntry {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  source: string | null;
  publishedAt: string;
  /** Alle Assets, die die Meldung betrifft — bei Übernahmen oft zwei. */
  securityIds: string[];
  dividend: boolean;
}

export interface NewsDay {
  key: string;
  label: string;
  entries: NewsEntry[];
}

/**
 * Meldungen mit Bezug zur Ausschüttung — deutsch und englisch, auch
 * Kürzungen und Aussetzungen. Wortteile statt ganzer Wörter, damit
 * „Dividendenerhöhung“, „Sonderausschüttung“ und „dividends“ mitzählen.
 */
const DIVIDEND_PATTERN = /dividend|ausschütt|ausschuett|payout|pay-out/i;

export function isDividendNews(item: Pick<NewsItemRow, "title" | "snippet">): boolean {
  return DIVIDEND_PATTERN.test(item.title) || DIVIDEND_PATTERN.test(item.snippet ?? "");
}

/** Zwei Quellen melden dieselbe Nachricht oft wortgleich. */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function previousDay(iso: string): string {
  const [year = 0, month = 1, day = 1] = iso
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Heute";
  if (day === previousDay(today)) return "Gestern";
  return longDate(day);
}

/**
 * Die Liste nach Filtern, neueste zuerst, je Tag eine Gruppe. Eine Meldung,
 * die mehrere Assets betrifft oder von beiden Quellen kommt, steht einmal —
 * mit allen betroffenen Assets.
 */
export function buildNewsFeed(
  rows: readonly NewsItemRow[],
  filters: NewsFilters,
  now: Date,
): NewsDay[] {
  const cutoff = now.getTime() - Number.parseInt(filters.period, 10) * 86_400_000;
  const byKey = new Map<string, NewsEntry>();

  for (const row of rows) {
    if (Date.parse(row.published_at) < cutoff) continue;
    const key = titleKey(row.title);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.securityIds.includes(row.security_id))
        existing.securityIds.push(row.security_id);
      // Marketaux bringt einen Auszug mit, GDELT nicht.
      existing.snippet ??= row.snippet;
      continue;
    }
    byKey.set(key, {
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      url: row.url,
      source: row.source,
      publishedAt: row.published_at,
      securityIds: [row.security_id],
      dividend: isDividendNews(row),
    });
  }

  const today = calendarDayOf(now);
  const days: NewsDay[] = [];
  const entries = [...byKey.values()]
    .filter(
      (entry) =>
        (filters.securityId === "" || entry.securityIds.includes(filters.securityId)) &&
        (filters.topic === "all" || entry.dividend),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  for (const entry of entries) {
    const day = calendarDayOf(new Date(entry.publishedAt));
    const last = days.at(-1);
    if (last?.key === day) last.entries.push(entry);
    else days.push({ key: day, label: dayLabel(day, today), entries: [entry] });
  }
  return days;
}

export function countActiveNewsFilters(filters: NewsFilters): number {
  return (["securityId", "period", "topic"] as const).filter(
    (key) => filters[key] !== DEFAULT_NEWS_FILTERS[key],
  ).length;
}
