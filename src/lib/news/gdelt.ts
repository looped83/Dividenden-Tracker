import type { NewsItemRow } from "@/lib/supabase/repositories/news";

/**
 * GDELT (Volltextsuche nach dem Namen, ohne Key) ergänzt die gespeicherten
 * Marketaux-Meldungen um alles, was Marketaux nicht kennt: ETFs, deutsche und
 * britische Werte, kleinere REITs.
 *
 * Der Abruf läuft im Browser, nicht in der Edge Function: GDELT begrenzt
 * Anfragen je Absender-IP, und Supabase-Server teilen sich ihre IPs mit
 * anderen Projekten — von dort kam am 30./31.10.2026 nur „zu viele Anfragen“.
 * GDELT erlaubt den Abruf aus dem Browser ausdrücklich (CORS `*`). Die
 * Meldungen werden nicht gespeichert; sie gelten nur für die Sitzung.
 *
 * `fetch` wird hereingereicht, damit die Unit-Tests ohne Netz auskommen.
 */

export interface GdeltSecurity {
  id: string;
  name: string;
  ticker: string | null;
}

/** So weit zurück wie der längste Zeitraum der Seite. */
const LOOKBACK_HOURS = 30 * 24;

/** GDELT verlangt mindestens fünf Sekunden zwischen zwei Anfragen. */
const PAUSE_MS = 5_500;

/** Nach „zu viele Anfragen“ einmal nach dieser Pause erneut. */
const RETRY_MS = 10_000;

/** GDELT durchsucht den Volltext und braucht oft mehr als acht Sekunden. */
const TIMEOUT_MS = 20_000;

/** Namen je Sammelanfrage — kurz genug für die Längengrenze der Suche. */
const NAMES_PER_QUERY = 12;

/** Meldungen je Asset — mehr liest niemand. */
const MAX_ITEMS_PER_SECURITY = 5;

const TITLE_MAX = 500;
const SOURCE_MAX = 200;

/** Sprachen, die GDELT ausschreibt, und ihr Kürzel. Andere fallen weg. */
const LANGUAGES: Record<string, string> = { English: "en", German: "de" };

export class GdeltError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "GdeltError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Namen
// ---------------------------------------------------------------------------

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
 * Trifft der Titel das Asset? Die Suche findet den Namen auch tief im Artikel
 * („… neben Allianz auch …“); gezeigt wird eine Meldung nur, wenn der Name
 * oder das Kürzel im Titel steht.
 */
export function titleMentions(
  title: string,
  security: Pick<GdeltSecurity, "name" | "ticker">,
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

/** Suchbegriff eines Namens: nur Buchstaben, Ziffern und Leerzeichen. */
function phrase(security: Pick<GdeltSecurity, "name">): string | null {
  const value = searchName(security.name)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  // GDELT lehnt sehr kurze Begriffe ab.
  return value.length >= 4 ? value : null;
}

// ---------------------------------------------------------------------------
// Anfrage und Antwort
// ---------------------------------------------------------------------------

export function gdeltUrl(
  securities: readonly Pick<GdeltSecurity, "name">[],
): string | null {
  const phrases = [
    ...new Set(securities.map(phrase).filter((value): value is string => value !== null)),
  ];
  if (phrases.length === 0) return null;
  const terms = phrases.map((value) => `"${value}"`);
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set(
    "query",
    terms.length === 1 ? (terms[0] ?? "") : `(${terms.join(" OR ")})`,
  );
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "250");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", `${String(LOOKBACK_HOURS)}h`);
  return url.toString();
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
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

/** „20261030T201500Z“ → ISO. */
function gdeltDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, se] = match;
  const time = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

interface GdeltArticle {
  url?: unknown;
  title?: unknown;
  seendate?: unknown;
  domain?: unknown;
  language?: unknown;
}

/**
 * Ordnet die Treffer einer Sammelanfrage den Assets zu, über den Namen oder
 * das Kürzel im Titel ({@link titleMentions}). Höchstens fünf je Asset, nur
 * Deutsch und Englisch. Die Zeilen haben die Form der gespeicherten, damit
 * die Seite beide Quellen gleich behandelt.
 */
export function parseGdelt(
  body: string,
  securities: readonly GdeltSecurity[],
): NewsItemRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // GDELT antwortet auf Fehler mit Klartext („Please limit requests …“).
    throw new GdeltError("format");
  }
  const articles = (parsed as { articles?: unknown } | null)?.articles ?? [];
  if (!Array.isArray(articles)) throw new GdeltError("format");

  const perSecurity = new Map<string, number>();
  const rows: NewsItemRow[] = [];
  for (const raw of articles as GdeltArticle[]) {
    const url = httpsUrl(raw.url);
    const title = typeof raw.title === "string" ? clip(raw.title, TITLE_MAX) : "";
    const publishedAt = gdeltDate(raw.seendate);
    const known = typeof raw.language === "string" && raw.language in LANGUAGES;
    if (!url || !title || !publishedAt || !known) continue;

    for (const security of securities) {
      const count = perSecurity.get(security.id) ?? 0;
      if (count >= MAX_ITEMS_PER_SECURITY || !titleMentions(title, security)) continue;
      perSecurity.set(security.id, count + 1);
      rows.push({
        id: `gdelt:${security.id}:${url}`,
        security_id: security.id,
        provider: "gdelt",
        title,
        snippet: null,
        url,
        source: typeof raw.domain === "string" ? clip(raw.domain, SOURCE_MAX) : null,
        sentiment: null,
        published_at: publishedAt,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Abruf
// ---------------------------------------------------------------------------

export interface FetchGdeltOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Pausen; nur Tests setzen sie herab. */
  pauseMs?: number;
  retryMs?: number;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GdeltError("aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new GdeltError("aborted"));
      },
      { once: true },
    );
  });
}

async function load(
  doFetch: typeof fetch,
  url: string,
  chunk: readonly GdeltSecurity[],
  signal?: AbortSignal,
): Promise<NewsItemRow[]> {
  // Eigener Controller statt AbortSignal.any: das fehlt älteren iPhones.
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  const timer = setTimeout(abort, TIMEOUT_MS);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await doFetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new GdeltError("http", response.status);
    return parseGdelt(await response.text(), chunk);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Sammelanfragen à zwölf Namen, nacheinander mit der verlangten Pause. Fällt
 * eine aus, fehlen nur deren Meldungen; scheitern alle, gilt der Abruf als
 * gescheitert.
 */
export async function fetchGdeltNews(
  securities: readonly GdeltSecurity[],
  options: FetchGdeltOptions = {},
): Promise<NewsItemRow[]> {
  const doFetch = options.fetchImpl ?? fetch;
  const pauseMs = options.pauseMs ?? PAUSE_MS;
  const rows: NewsItemRow[] = [];
  let requests = 0;
  let failed = 0;
  let lastError: unknown = null;

  for (let start = 0; start < securities.length; start += NAMES_PER_QUERY) {
    const chunk = securities.slice(start, start + NAMES_PER_QUERY);
    const url = gdeltUrl(chunk);
    if (!url) continue;
    if (requests > 0) await wait(pauseMs, options.signal);
    requests += 1;
    try {
      try {
        rows.push(...(await load(doFetch, url, chunk, options.signal)));
      } catch (error) {
        const limited =
          error instanceof GdeltError &&
          (error.status === 429 || error.message === "format");
        if (!limited) throw error;
        await wait(options.retryMs ?? RETRY_MS, options.signal);
        rows.push(...(await load(doFetch, url, chunk, options.signal)));
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
      failed += 1;
      lastError = error;
    }
  }
  if (requests > 0 && failed === requests) throw lastError;
  return rows;
}
