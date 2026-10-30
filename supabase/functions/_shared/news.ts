/**
 * Abruf der News zu den Assets im Bestand (Edge Function `sync-news`).
 *
 * Zwei kostenlose Quellen, weil keine allein alle Assets abdeckt:
 *
 * - **Marketaux** ordnet Meldungen über das Börsenkürzel zu und liefert die
 *   Stimmung je Asset. Der kostenlose Plan erlaubt 100 Anfragen am Tag mit je
 *   3 Meldungen; gefragt wird deshalb nur für Aktien, eine Anfrage je Aktie.
 * - **Google News** (RSS-Suche nach dem Namen) deckt ab, was Marketaux nicht
 *   kennt: ETFs, deutsche und britische Werte, kleinere REITs und BDCs.
 *
 * Der API-Key ist ein Geheimnis: Er steht in der Anfrageadresse von Marketaux.
 * Adressen tauchen deshalb in keiner Fehlermeldung auf — `NewsSourceError`
 * trägt nur einen Code und den HTTP-Status.
 *
 * Laufzeitunabhängig wie `feed.ts`: `fetch` wird hereingereicht, damit die
 * Unit-Tests ohne Netz auskommen.
 */

export type NewsProvider = "marketaux" | "google_news";

/** Ein Asset, zu dem Meldungen gesucht werden. */
export interface NewsSecurity {
  id: string;
  name: string;
  ticker: string | null;
  isin: string | null;
  /** Nur Aktien fragen bei Marketaux an (Kontingent). */
  isEquity: boolean;
}

/** Eine Meldung, so wie sie in `news_items` landet (ohne `user_id`). */
export interface NewsItemWrite {
  security_id: string;
  provider: NewsProvider;
  external_id: string;
  title: string;
  snippet: string | null;
  url: string;
  source: string | null;
  language: string | null;
  sentiment: number | null;
  published_at: string;
}

export type NewsSourceErrorCode = "http" | "timeout" | "network" | "format";

export class NewsSourceError extends Error {
  readonly code: NewsSourceErrorCode;
  readonly status: number | null;

  constructor(code: NewsSourceErrorCode, status: number | null = null) {
    super(`News-Fehler: ${code}`);
    this.name = "NewsSourceError";
    this.code = code;
    this.status = status;
  }
}

/** Meldungen je Asset und Quelle — mehr liest niemand, und es spart Platz. */
const MAX_ITEMS_PER_SOURCE = 5;

/** So lange bleibt eine Meldung gespeichert. */
export const NEWS_RETENTION_DAYS = 30;

/** Beim ersten Abruf (oder nach langer Pause) so weit zurück. */
export const NEWS_LOOKBACK_DAYS = 14;

const REQUEST_TIMEOUT_MS = 10_000;

/** 2 MB — ein RSS-Ergebnis mit 100 Einträgen liegt bei rund 50 KB. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const TITLE_MAX = 500;
const SNIPPET_MAX = 500;
const SOURCE_MAX = 200;

// ---------------------------------------------------------------------------
// Namen und Kürzel
// ---------------------------------------------------------------------------

/**
 * Börsenendung je ISIN-Land für Marketaux (Yahoo-Schreibweise). US-, kanadische
 * und irische Werte stehen meist ohne Endung an der NYSE oder Nasdaq; für sie
 * gilt das Kürzel unverändert.
 */
const EXCHANGE_SUFFIX: Record<string, string> = {
  DE: ".DE",
  GB: ".L",
  FR: ".PA",
  NL: ".AS",
  CH: ".SW",
  ES: ".MC",
  IT: ".MI",
  DK: ".CO",
  SE: ".ST",
  NO: ".OL",
  FI: ".HE",
  AT: ".VI",
  BE: ".BR",
};

/** Kürzel für Marketaux, oder `null`, wenn keins vorliegt. */
export function marketauxSymbol(
  security: Pick<NewsSecurity, "ticker" | "isin">,
): string | null {
  const ticker = security.ticker?.trim().toUpperCase();
  if (!ticker) return null;
  if (ticker.includes(".")) return ticker;
  const country = security.isin?.slice(0, 2).toUpperCase() ?? "";
  return `${ticker.replaceAll(" ", "-")}${EXCHANGE_SUFFIX[country] ?? ""}`;
}

/** Rechtsformen und Zusätze am Ende eines Namens, die keiner mitschreibt. */
const LEGAL_SUFFIX =
  /[\s,]+(inc|incorporated|corp|corporation|co|company|ag|se|sa|nv|n\.v|plc|ltd|limited|llc|lp|reit|kgaa|holding|holdings|group|trust|& co(\.?\s*kgaa)?|the)\.?$/i;

/**
 * Kern eines Namens für die Suche: ohne Klammerzusätze, Rechtsform,
 * Aktiengattung und — bei Fonds — ohne alles ab „UCITS ETF“ bzw. „ETF“
 * („iShares STOXX Global Select Dividend 100 UCITS ETF (DE)“ →
 * „iShares STOXX Global Select Dividend 100“).
 */
export function searchName(name: string): string {
  let core = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(ucits\s+)?etf\b.*$/i, " ")
    .replace(/\b(class|cl\.?)\s+[a-c]\b.*$/i, " ")
    .replace(/\b(registered|reg\.?|namens-?aktien?|vz|stammaktien?|adr)\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Mehrere Zusätze hintereinander („Holdings Inc.“): so lange kürzen, wie
  // etwas wegfällt und ein Name übrig bleibt.
  for (;;) {
    const shorter = core.replace(LEGAL_SUFFIX, "").trim();
    if (shorter === core || shorter.length < 2) break;
    core = shorter;
  }
  return core.replace(/[,.&\s]+$/, "").trim() || name.trim();
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Trifft der Titel einer Google-Meldung das Asset? Die Suche läuft zwar nach
 * dem genauen Namen, findet ihn aber auch tief im Artikel („… neben Allianz
 * auch …“). Gezeigt wird eine Meldung nur, wenn der Name oder das Kürzel im
 * Titel steht.
 */
export function titleMentions(
  title: string,
  security: Pick<NewsSecurity, "name" | "ticker">,
): boolean {
  const text = ` ${normalize(title)} `;
  const core = normalize(searchName(security.name));
  if (core.length > 0 && text.includes(` ${core} `)) return true;
  // Lange Namen kürzen Redaktionen ab („JPMorgan Equity Premium Income“ →
  // „JPMorgan Equity Premium“): die ersten beiden Wörter genügen dann.
  const words = core.split(" ");
  if (words.length >= 3 && text.includes(` ${words.slice(0, 2).join(" ")} `)) return true;
  // Kürzel erst ab drei Zeichen, sonst trifft „O“ (Realty Income) jedes Wort.
  const ticker = normalize(security.ticker ?? "");
  return ticker.length >= 3 && text.includes(` ${ticker} `);
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function clip(value: string | null | undefined, max: number): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function language(value: unknown): string | null {
  return typeof value === "string" && /^[a-z]{2}$/.test(value) ? value : null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#"))
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

async function fetchText(
  doFetch: typeof fetch,
  url: string,
  accept: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await doFetch(url, {
        method: "GET",
        headers: { accept },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch {
      throw new NewsSourceError(controller.signal.aborted ? "timeout" : "network");
    }
    if (!response.ok) throw new NewsSourceError("http", response.status);
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new NewsSourceError(controller.signal.aborted ? "timeout" : "network");
    }
    if (text.length > MAX_RESPONSE_BYTES) throw new NewsSourceError("format");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Marketaux
// ---------------------------------------------------------------------------

/** `published_after` verlangt „YYYY-MM-DDTHH:MM“ in UTC. */
function marketauxDate(since: Date): string {
  return since.toISOString().slice(0, 16);
}

export function marketauxUrl(symbol: string, since: Date, apiKey: string): string {
  const url = new URL("https://api.marketaux.com/v1/news/all");
  url.searchParams.set("symbols", symbol);
  url.searchParams.set("filter_entities", "true");
  url.searchParams.set("must_have_entities", "true");
  url.searchParams.set("language", "de,en");
  url.searchParams.set("published_after", marketauxDate(since));
  url.searchParams.set("sort", "published_at");
  url.searchParams.set("api_token", apiKey);
  return url.toString();
}

interface MarketauxEntity {
  symbol?: unknown;
  sentiment_score?: unknown;
}

interface MarketauxArticle {
  uuid?: unknown;
  title?: unknown;
  description?: unknown;
  snippet?: unknown;
  url?: unknown;
  source?: unknown;
  language?: unknown;
  published_at?: unknown;
  entities?: unknown;
}

export function parseMarketaux(
  body: string,
  security: Pick<NewsSecurity, "id">,
  symbol: string,
): NewsItemWrite[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new NewsSourceError("format");
  }
  const data = (parsed as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new NewsSourceError("format");

  const items: NewsItemWrite[] = [];
  for (const raw of data as MarketauxArticle[]) {
    const id = typeof raw.uuid === "string" ? raw.uuid : null;
    const title =
      typeof raw.title === "string" ? clip(decodeEntities(raw.title), TITLE_MAX) : null;
    const url = httpsUrl(raw.url);
    const publishedAt = isoDate(raw.published_at);
    if (!id || !title || !url || !publishedAt) continue;

    const entities = Array.isArray(raw.entities)
      ? (raw.entities as MarketauxEntity[])
      : [];
    const entity = entities.find(
      (candidate) =>
        typeof candidate.symbol === "string" && candidate.symbol.toUpperCase() === symbol,
    );
    const score =
      typeof entity?.sentiment_score === "number" ? entity.sentiment_score : null;
    const description =
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description
        : typeof raw.snippet === "string"
          ? raw.snippet
          : null;

    items.push({
      security_id: security.id,
      provider: "marketaux",
      external_id: id.slice(0, 512),
      title,
      snippet: clip(
        description === null ? null : decodeEntities(description),
        SNIPPET_MAX,
      ),
      url,
      source: clip(typeof raw.source === "string" ? raw.source : null, SOURCE_MAX),
      language: language(raw.language),
      sentiment:
        score === null
          ? null
          : Math.max(-1, Math.min(1, Math.round(score * 1000) / 1000)),
      published_at: publishedAt,
    });
  }
  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

// ---------------------------------------------------------------------------
// Google News (RSS)
// ---------------------------------------------------------------------------

/**
 * Suche nach dem genauen Namen. `when:` begrenzt den Zeitraum serverseitig,
 * damit nicht jedes Mal 100 alte Einträge übertragen werden. Deutsche Ausgabe,
 * weil sie deutsche und englische Quellen gleichermaßen führt.
 */
export function googleNewsUrl(
  security: Pick<NewsSecurity, "name">,
  since: Date,
  now: Date,
): string {
  const days = Math.max(
    1,
    Math.min(
      NEWS_LOOKBACK_DAYS,
      Math.ceil((now.getTime() - since.getTime()) / 86_400_000),
    ),
  );
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", `"${searchName(security.name)}" when:${String(days)}d`);
  url.searchParams.set("hl", "de");
  url.searchParams.set("gl", "DE");
  url.searchParams.set("ceid", "DE:de");
  return url.toString();
}

function tag(block: string, name: string): string | null {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(
    block,
  );
  if (!match?.[1]) return null;
  const inner = match[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(inner);
  return decodeEntities(cdata?.[1] ?? inner).trim();
}

/**
 * Liest die Einträge eines Google-News-RSS. Bewusst ohne XML-Bibliothek: Das
 * Format ist flach und fest (item → title, link, guid, pubDate, source), und
 * die Edge Function bleibt so ohne weitere Abhängigkeit.
 */
export function parseGoogleNews(
  body: string,
  security: Pick<NewsSecurity, "id" | "name" | "ticker">,
  since: Date,
): NewsItemWrite[] {
  if (!/<rss[\s>]/i.test(body)) throw new NewsSourceError("format");

  const items: NewsItemWrite[] = [];
  for (const match of body.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const rawTitle = tag(block, "title");
    const url = httpsUrl(tag(block, "link"));
    const publishedAt = isoDate(tag(block, "pubDate"));
    if (!rawTitle || !url || !publishedAt) continue;
    if (Date.parse(publishedAt) < since.getTime()) continue;

    const source = tag(block, "source");
    // Google hängt die Quelle an den Titel an („… - Handelsblatt“).
    const title =
      source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3)).trim()
        : rawTitle;
    if (!titleMentions(title, security)) continue;

    items.push({
      security_id: security.id,
      provider: "google_news",
      external_id: (tag(block, "guid") ?? url).slice(0, 512),
      title: clip(title, TITLE_MAX) ?? title.slice(0, TITLE_MAX),
      // Die Beschreibung ist bei Google nur der Titel als Link — kein Auszug.
      snippet: null,
      url,
      source: clip(source, SOURCE_MAX),
      language: null,
      sentiment: null,
      published_at: publishedAt,
    });
  }
  items.sort((a, b) => b.published_at.localeCompare(a.published_at));
  return items.slice(0, MAX_ITEMS_PER_SOURCE);
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

export interface CollectNewsOptions {
  securities: readonly NewsSecurity[];
  since: Date;
  now: Date;
  /** Fehlt er, bleibt es bei Google News. */
  marketauxKey: string | null;
  fetchImpl?: typeof fetch;
  /** Gleichzeitige Anfragen — schont beide Quellen und hält den Lauf kurz. */
  concurrency?: number;
}

export interface CollectNewsResult {
  items: NewsItemWrite[];
  requests: number;
  failed: number;
  /** Kurzcodes der Fehler fürs Server-Log, ohne Adressen. */
  errorCodes: string[];
}

function errorCode(provider: NewsProvider, error: unknown): string {
  if (error instanceof NewsSourceError) {
    return `${provider}:${error.code}${error.status === null ? "" : `:${String(error.status)}`}`;
  }
  return `${provider}:internal`;
}

/**
 * Fragt je Asset Google News und — bei Aktien mit Kürzel — Marketaux ab.
 * Fällt eine einzelne Anfrage aus, fehlen nur deren Meldungen; der Lauf geht
 * weiter. Ob der Lauf als Ganzes gescheitert ist, entscheidet die Aufrufstelle
 * an `failed === requests`.
 */
export async function collectNews(
  options: CollectNewsOptions,
): Promise<CollectNewsResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const tasks: (() => Promise<NewsItemWrite[]>)[] = [];
  const result: CollectNewsResult = { items: [], requests: 0, failed: 0, errorCodes: [] };

  const track = (provider: NewsProvider, run: () => Promise<NewsItemWrite[]>) => {
    tasks.push(async () => {
      try {
        return await run();
      } catch (error) {
        result.failed += 1;
        result.errorCodes.push(errorCode(provider, error));
        return [];
      }
    });
  };

  for (const security of options.securities) {
    const symbol = security.isEquity ? marketauxSymbol(security) : null;
    const key = options.marketauxKey;
    if (symbol && key) {
      track("marketaux", async () =>
        parseMarketaux(
          await fetchText(
            doFetch,
            marketauxUrl(symbol, options.since, key),
            "application/json",
          ),
          security,
          symbol,
        ),
      );
    }
    track("google_news", async () =>
      parseGoogleNews(
        await fetchText(
          doFetch,
          googleNewsUrl(security, options.since, options.now),
          "application/rss+xml, application/xml;q=0.9, */*;q=0.1",
        ),
        security,
        options.since,
      ),
    );
  }

  result.requests = tasks.length;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    async () => {
      while (next < tasks.length) {
        const task = tasks[next];
        next += 1;
        result.items.push(...(await task()));
      }
    },
  );
  await Promise.all(workers);
  return result;
}
