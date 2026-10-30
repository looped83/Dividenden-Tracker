/**
 * Abruf der News zu den Assets im Bestand (Edge Function `sync-news`).
 *
 * Zwei kostenlose Quellen, weil keine allein alle Assets abdeckt:
 *
 * - **Marketaux** ordnet Meldungen über das Börsenkürzel zu und liefert die
 *   Stimmung je Asset. Der kostenlose Plan erlaubt 100 Anfragen am Tag mit je
 *   3 Meldungen; gefragt wird deshalb nur für Aktien, eine Anfrage je Aktie.
 * - **GDELT** (Volltextsuche nach dem Namen, ohne Key) deckt ab, was Marketaux
 *   nicht liefert: ETFs, deutsche und britische Werte, kleinere REITs und
 *   BDCs. Alle diese Namen gehen in ein bis zwei Sammelanfragen; GDELT
 *   erlaubt nur eine Anfrage alle fünf Sekunden.
 *
 * Google News war die erste Wahl, antwortet Servern von Supabase aber
 * durchweg mit 503 (30.10.2026).
 *
 * Der API-Key ist ein Geheimnis: Er steht in der Anfrageadresse von Marketaux.
 * Adressen tauchen deshalb in keiner Fehlermeldung auf — `NewsSourceError`
 * trägt nur einen Code und den HTTP-Status.
 *
 * Laufzeitunabhängig wie `feed.ts`: `fetch` wird hereingereicht, damit die
 * Unit-Tests ohne Netz auskommen.
 */

export type NewsProvider = "marketaux" | "gdelt";

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
 * Höchstens so lange werden neue Anfragen gestartet. Bei rund 50 Assets sind
 * es knapp 90 Anfragen; hängt eine Quelle, endet der Lauf trotzdem weit vor
 * dem Zeitlimit der Edge Function und speichert, was bis dahin da ist.
 */
const DEFAULT_BUDGET_MS = 40_000;

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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Trifft der Titel einer GDELT-Meldung das Asset? Die Suche läuft zwar nach
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
// GDELT
// ---------------------------------------------------------------------------

/** GDELT verlangt mindestens fünf Sekunden zwischen zwei Anfragen. */
const GDELT_PAUSE_MS = 5_500;

/** Namen je Sammelanfrage — kurz genug für die Längengrenze der Suche. */
const GDELT_NAMES_PER_QUERY = 12;

/** Sprachen, die GDELT ausschreibt, und ihr Kürzel. Andere fallen weg. */
const GDELT_LANGUAGES: Record<string, string> = { English: "en", German: "de" };

/** Suchbegriff eines Namens: nur Buchstaben, Ziffern und Leerzeichen. */
function gdeltPhrase(security: Pick<NewsSecurity, "name">): string | null {
  const phrase = searchName(security.name)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  // GDELT lehnt sehr kurze Begriffe ab.
  return phrase.length >= 4 ? phrase : null;
}

export function gdeltUrl(
  securities: readonly Pick<NewsSecurity, "name">[],
  since: Date,
  now: Date,
): string | null {
  const phrases = [
    ...new Set(securities.map(gdeltPhrase).filter((p): p is string => p !== null)),
  ];
  if (phrases.length === 0) return null;
  const terms = phrases.map((phrase) => `"${phrase}"`);
  const hours = Math.max(
    1,
    Math.min(
      NEWS_LOOKBACK_DAYS * 24,
      Math.ceil((now.getTime() - since.getTime()) / 3_600_000),
    ),
  );
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set(
    "query",
    terms.length === 1 ? (terms[0] ?? "") : `(${terms.join(" OR ")})`,
  );
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "250");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", `${String(hours)}h`);
  return url.toString();
}

/** „20261030T201500Z“ → ISO. */
function gdeltDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, se] = match;
  return isoDate(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`);
}

interface GdeltArticle {
  url?: unknown;
  title?: unknown;
  seendate?: unknown;
  domain?: unknown;
  language?: unknown;
}

/**
 * Ordnet die Treffer einer Sammelanfrage den Assets zu: über den Namen oder
 * das Kürzel im Titel ({@link titleMentions}). Höchstens fünf je Asset, nur
 * Deutsch und Englisch.
 */
export function parseGdelt(
  body: string,
  securities: readonly Pick<NewsSecurity, "id" | "name" | "ticker">[],
  since: Date,
): NewsItemWrite[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // GDELT antwortet auf Fehler mit Klartext („Please limit requests …“).
    throw new NewsSourceError("format");
  }
  const articles = (parsed as { articles?: unknown } | null)?.articles ?? [];
  if (!Array.isArray(articles)) throw new NewsSourceError("format");

  const perSecurity = new Map<string, number>();
  const items: NewsItemWrite[] = [];
  for (const raw of articles as GdeltArticle[]) {
    const url = httpsUrl(raw.url);
    const title =
      typeof raw.title === "string" ? clip(decodeEntities(raw.title), TITLE_MAX) : null;
    const publishedAt = gdeltDate(raw.seendate);
    const lang =
      typeof raw.language === "string" ? GDELT_LANGUAGES[raw.language] : undefined;
    if (!url || !title || !publishedAt || !lang) continue;
    if (Date.parse(publishedAt) < since.getTime()) continue;

    for (const security of securities) {
      const count = perSecurity.get(security.id) ?? 0;
      if (count >= MAX_ITEMS_PER_SOURCE || !titleMentions(title, security)) continue;
      perSecurity.set(security.id, count + 1);
      items.push({
        security_id: security.id,
        provider: "gdelt",
        external_id: url.slice(0, 512),
        title,
        snippet: null,
        url,
        source: clip(typeof raw.domain === "string" ? raw.domain : null, SOURCE_MAX),
        language: lang,
        sentiment: null,
        published_at: publishedAt,
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

export interface CollectNewsOptions {
  securities: readonly NewsSecurity[];
  since: Date;
  now: Date;
  /** Fehlt er, bleibt es bei GDELT. */
  marketauxKey: string | null;
  fetchImpl?: typeof fetch;
  /** Gleichzeitige Anfragen an Marketaux. */
  concurrency?: number;
  /** Zeit, in der Anfragen an Marketaux starten dürfen (Vorgabe 40 s). */
  budgetMs?: number;
  /** Pause zwischen zwei GDELT-Anfragen; nur Tests setzen sie herab. */
  gdeltPauseMs?: number;
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

function errorCode(provider: NewsProvider, error: unknown): string {
  if (error instanceof NewsSourceError) {
    return `${provider}:${error.code}${error.status === null ? "" : `:${String(error.status)}`}`;
  }
  return `${provider}:internal`;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Erst Marketaux je Aktie (parallel, im Zeitrahmen), dann GDELT in
 * Sammelanfragen für alle Assets ohne Marketaux-Treffer. Fällt eine einzelne
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
  const attempt = async (
    provider: NewsProvider,
    run: () => Promise<NewsItemWrite[]>,
  ): Promise<void> => {
    result.requests += 1;
    try {
      result.items.push(...(await run()));
    } catch (error) {
      result.failed += 1;
      result.errorCodes.push(errorCode(provider, error));
    }
  };

  // 1) Marketaux
  const key = options.marketauxKey;
  const marketaux = key
    ? options.securities.flatMap((security) => {
        const symbol = security.isEquity ? marketauxSymbol(security) : null;
        return symbol ? [{ security, symbol }] : [];
      })
    : [];
  const stopAt = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, options.concurrency ?? 8), marketaux.length) },
    async () => {
      while (next < marketaux.length && Date.now() < stopAt) {
        const task = marketaux[next];
        next += 1;
        if (!key) break;
        await attempt("marketaux", async () =>
          parseMarketaux(
            await fetchText(
              doFetch,
              marketauxUrl(task.symbol, options.since, key),
              "application/json",
            ),
            task.security,
            task.symbol,
          ),
        );
      }
    },
  );
  await Promise.all(workers);
  result.skipped = marketaux.length - next;

  // 2) GDELT für den Rest
  const covered = new Set(result.items.map((item) => item.security_id));
  const rest = options.securities.filter((security) => !covered.has(security.id));
  for (let start = 0; start < rest.length; start += GDELT_NAMES_PER_QUERY) {
    const chunk = rest.slice(start, start + GDELT_NAMES_PER_QUERY);
    const url = gdeltUrl(chunk, options.since, options.now);
    if (!url) continue;
    if (start > 0) await pause(options.gdeltPauseMs ?? GDELT_PAUSE_MS);
    await attempt("gdelt", async () =>
      parseGdelt(await fetchText(doFetch, url, "application/json"), chunk, options.since),
    );
  }
  return result;
}
