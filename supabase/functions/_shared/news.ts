/**
 * Abruf der News zu den Assets im Bestand (Edge Function `sync-news`).
 *
 * **Marketaux** ordnet Meldungen über das Börsenkürzel zu und liefert die
 * Stimmung je Asset. Der kostenlose Plan erlaubt 100 Anfragen am Tag mit je
 * 3 Meldungen; gefragt wird deshalb nur für Aktien, eine Anfrage je Aktie.
 *
 * Was Marketaux nicht kennt (ETFs, manche deutsche und britische Werte),
 * sucht der Browser bei GDELT (`src/lib/news/gdelt.ts`): GDELT begrenzt je
 * Absender-IP, und von den geteilten IPs der Supabase-Server kam nur „zu
 * viele Anfragen“ (30./31.10.2026). Google News antwortete ihnen mit 503.
 *
 * Der API-Key ist ein Geheimnis: Er steht in der Anfrageadresse von Marketaux.
 * Adressen tauchen deshalb in keiner Fehlermeldung auf — `NewsSourceError`
 * trägt nur einen Code und den HTTP-Status.
 *
 * Laufzeitunabhängig wie `feed.ts`: `fetch` wird hereingereicht, damit die
 * Unit-Tests ohne Netz auskommen.
 */

export type NewsProvider = "marketaux";

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

const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Anfragen an Marketaux nacheinander: Bei 8 und auch bei 3 gleichzeitigen
 * antwortete es teils mit 429 (30.10.2026).
 */
const MARKETAUX_CONCURRENCY = 1;

/** Pause vor dem zweiten Versuch nach einem 429. */
const MARKETAUX_RETRY_MS = 2_000;

/**
 * Höchstens so lange werden neue Anfragen gestartet. Hängt Marketaux, endet
 * der Lauf trotzdem weit vor dem Zeitlimit der Edge Function und speichert,
 * was bis dahin da ist.
 */
const DEFAULT_BUDGET_MS = 40_000;

/** 2 MB — eine Marketaux-Antwort liegt bei wenigen Kilobyte. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const TITLE_MAX = 500;
const SNIPPET_MAX = 500;
const SOURCE_MAX = 200;

// ---------------------------------------------------------------------------
// Kürzel
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
// Ablauf
// ---------------------------------------------------------------------------

export interface CollectNewsOptions {
  securities: readonly NewsSecurity[];
  since: Date;
  /** Fehlt er, wird nichts abgerufen. */
  marketauxKey: string | null;
  fetchImpl?: typeof fetch;
  /** Gleichzeitige Anfragen an Marketaux. */
  concurrency?: number;
  /** Zeit, in der Anfragen an Marketaux starten dürfen (Vorgabe 40 s). */
  budgetMs?: number;
  /** Pause vor dem zweiten Versuch nach 429; nur Tests setzen sie herab. */
  marketauxRetryMs?: number;
}

export interface CollectNewsResult {
  items: NewsItemWrite[];
  requests: number;
  failed: number;
  /** Nicht mehr gestartet, weil die Zeit abgelaufen war. */
  skipped: number;
  /** Kurzcodes der Fehler fürs Server-Log, ohne Adressen. */
  errorCodes: string[];
}

function errorCode(error: unknown): string {
  if (error instanceof NewsSourceError) {
    return `marketaux:${error.code}${error.status === null ? "" : `:${String(error.status)}`}`;
  }
  return "marketaux:internal";
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Marketaux je Aktie, nacheinander und im Zeitrahmen. Fällt eine einzelne
 * Anfrage aus, fehlen nur deren Meldungen; ob der Lauf als Ganzes gescheitert
 * ist, entscheidet die Aufrufstelle an `failed === requests`.
 */
export async function collectNews(
  options: CollectNewsOptions,
): Promise<CollectNewsResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const result: CollectNewsResult = {
    items: [],
    requests: 0,
    failed: 0,
    skipped: 0,
    errorCodes: [],
  };
  const attempt = async (run: () => Promise<NewsItemWrite[]>): Promise<void> => {
    result.requests += 1;
    try {
      result.items.push(...(await run()));
    } catch (error) {
      result.failed += 1;
      result.errorCodes.push(errorCode(error));
    }
  };

  const key = options.marketauxKey;
  const marketaux = key
    ? options.securities.flatMap((security) => {
        const symbol = security.isEquity ? marketauxSymbol(security) : null;
        return symbol ? [{ security, symbol }] : [];
      })
    : [];
  const stopAt = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  let next = 0;
  // 402 heißt: Tageskontingent verbraucht. Weitere Anfragen kosten nur Zeit.
  let exhausted = false;
  const fetchMarketaux = async (url: string): Promise<string> => {
    try {
      return await fetchText(doFetch, url, "application/json");
    } catch (error) {
      if (!(error instanceof NewsSourceError)) throw error;
      if (error.status === 402) exhausted = true;
      if (error.status !== 429) throw error;
    }
    // 429: zu viele Anfragen in kurzer Zeit (30.10.2026 bei 8 gleichzeitigen).
    // Ein zweiter Versuch nach einer Pause genügt meist.
    await pause(options.marketauxRetryMs ?? MARKETAUX_RETRY_MS);
    return fetchText(doFetch, url, "application/json");
  };
  const workers = Array.from(
    {
      length: Math.min(
        Math.max(1, options.concurrency ?? MARKETAUX_CONCURRENCY),
        marketaux.length,
      ),
    },
    async () => {
      while (next < marketaux.length && Date.now() < stopAt && !exhausted) {
        const task = marketaux[next];
        next += 1;
        if (!key) break;
        await attempt(async () =>
          parseMarketaux(
            await fetchMarketaux(marketauxUrl(task.symbol, options.since, key)),
            task.security,
            task.symbol,
          ),
        );
      }
    },
  );
  await Promise.all(workers);
  result.skipped = marketaux.length - next;
  return result;
}
