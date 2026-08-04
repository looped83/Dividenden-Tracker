import { normalizeCompareName } from "@/lib/import/normalizeName";
import type { CalendarEvent } from "./types";

/**
 * Angleichung der Unternehmensnamen des Feeds an die **angelegten** Unternehmen.
 *
 * Die Kalenderquelle schreibt „Realty Income Corporation", im eigenen Bestand
 * steht „Realty Income" — dasselbe Unternehmen, zwei Schreibweisen. Auf einer
 * Seite nebeneinander wirkt das wie zwei Werte. Diese Datei loest den Namen des
 * Feeds deshalb auf den Namen des eigenen Unternehmens auf, sobald er eindeutig
 * darauf passt.
 *
 * **Angeglichen wird ausschliesslich die Anzeige.** Der Termin bleibt der des
 * Feeds: Nichts wird der Zahlung zugeordnet, nichts gespeichert, kein
 * Unternehmen angelegt (PRODUCT_SPEC.md Grundsatz 8). Der urspruengliche Name
 * der Quelle bleibt in `companyName` erhalten und steht in der Detailansicht.
 *
 * Drei Stufen, alle **eindeutig oder gar nicht** — dieselbe Zurueckhaltung wie
 * beim Import (IMPORT_SPEC.md §6):
 *
 * 1. gleicher Name (nach Normalisierung),
 * 2. bestaetigter Alias aus dem Import (`security_aliases`),
 * 3. gleicher Name ohne Rechtsform („Corp.", „AG", „plc" …) und Satzzeichen.
 *
 * Passen zwei verschiedene eigene Unternehmen auf denselben Schluessel, bleibt
 * der Name der Quelle stehen: Ein geratener Treffer waere schlimmer als eine
 * abweichende Schreibweise. Die Aehnlichkeitsstufe des Imports (Levenshtein)
 * hat hier bewusst **kein** Gegenstueck — sie ist dort ein Vorschlag, den ein
 * Mensch bestaetigt; hier gaebe es niemanden, der widerspricht.
 */

export interface KnownCompany {
  id: string;
  name: string;
  archived: boolean;
}

export interface KnownCompanyAlias {
  /** Alias in der Normalform von {@link normalizeCompareName}. */
  aliasNormalized: string;
  securityId: string;
}

/** Liefert den Namen des eigenen Unternehmens oder `null`, wenn keiner passt. */
export type CompanyNameResolver = (feedName: string | null) => string | null;

/**
 * Rechtsformen am Namensende. Nur eindeutige Rechtsform-Kuerzel — „Group",
 * „Holding" oder „Trust" stehen bewusst nicht darin: Sie gehoeren zum Namen und
 * unterscheiden mitunter zwei Unternehmen voneinander.
 */
const LEGAL_FORM_TOKENS = new Set([
  "ab",
  "ag",
  "as",
  "asa",
  "bv",
  "co",
  "company",
  "corp",
  "corporation",
  "gmbh",
  "inc",
  "incorporated",
  "kg",
  "kgaa",
  "limited",
  "llc",
  "llp",
  "lp",
  "ltd",
  "nv",
  "ohg",
  "oyj",
  "pcl",
  "plc",
  "sa",
  "sarl",
  "sas",
  "se",
  "spa",
]);

/** Fuellwoerter, die zwei Schreibweisen desselben Namens trennen. */
const FILLER_TOKENS = new Set(["and", "und", "the"]);

/**
 * Vergleichsschluessel ohne Rechtsform und Satzzeichen: „The Coca-Cola Company"
 * und „Coca Cola Co." ergeben beide „coca cola".
 *
 * Rechtsformen fallen nur **am Ende** weg. In der Mitte sind dieselben Silben
 * Teil des Namens („Co-operative", „SA Braspress") — dort abgetragen entstuende
 * ein Schluessel, der zwei Unternehmen zusammenwirft.
 */
export function canonicalCompanyKey(name: string): string {
  const normalized = normalizeCompareName(name);
  const tokens = normalized
    // Satzzeichen und Bindestriche trennen, statt zu verschwinden: „Coca-Cola"
    // soll „coca cola" ergeben, nicht „cocacola".
    .replace(/[.,'"()\-/&]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !FILLER_TOKENS.has(token));

  while (tokens.length > 1 && LEGAL_FORM_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  // Ein Name, der vollstaendig aus Fuellwoertern besteht, behaelt seine
  // Normalform — ein leerer Schluessel passte auf jeden anderen leeren.
  return tokens.length > 0 ? tokens.join(" ") : normalized;
}

/** Eintrag eines Schluessels; `null` bedeutet: nicht eindeutig. */
type Bucket = KnownCompany | null;

/**
 * Traegt ein Unternehmen unter einem Schluessel ein. Aktive haben Vorrang vor
 * archivierten (ein archiviertes Unternehmen ist der aeltere Name); zwei
 * gleichrangige mit verschiedenen Namen machen den Schluessel mehrdeutig.
 */
function addToIndex(
  index: Map<string, Bucket>,
  key: string,
  company: KnownCompany,
): void {
  if (!index.has(key)) {
    index.set(key, company);
    return;
  }
  const current = index.get(key);
  if (current === null) return;
  if (current === undefined || current.id === company.id) return;
  if (current.archived && !company.archived) {
    index.set(key, company);
    return;
  }
  if (!current.archived && company.archived) return;
  // Gleichrangig: nur derselbe Name bleibt eindeutig.
  if (current.name !== company.name) index.set(key, null);
}

/**
 * Baut den Aufloeser einmal je Bestand — nicht je Termin: Der Kalender zeigt
 * Dutzende Termine, und jeder von ihnen suchte sonst erneut die ganze
 * Unternehmensliste durch.
 */
export function buildCompanyNameResolver(
  companies: readonly KnownCompany[],
  aliases: readonly KnownCompanyAlias[] = [],
): CompanyNameResolver {
  const byName = new Map<string, Bucket>();
  const byCanonical = new Map<string, Bucket>();
  const byId = new Map<string, KnownCompany>();

  for (const company of companies) {
    const name = company.name.trim();
    if (name.length === 0) continue;
    byId.set(company.id, company);
    addToIndex(byName, normalizeCompareName(name), company);
    addToIndex(byCanonical, canonicalCompanyKey(name), company);
  }

  const byAlias = new Map<string, Bucket>();
  for (const alias of aliases) {
    const company = byId.get(alias.securityId);
    if (company) addToIndex(byAlias, alias.aliasNormalized, company);
  }

  return (feedName) => {
    if (feedName === null) return null;
    const normalized = normalizeCompareName(feedName);
    if (normalized.length === 0) return null;

    const exact = byName.get(normalized);
    if (exact) return exact.name;

    const alias = byAlias.get(normalized);
    if (alias) return alias.name;

    const canonical = byCanonical.get(canonicalCompanyKey(feedName));
    return canonical ? canonical.name : null;
  };
}

/**
 * Ergaenzt die Termine um den angeglichenen Namen. Termine ohne Treffer bleiben
 * unveraendert — auch als Objekt, damit React nur neu zeichnet, was sich
 * tatsaechlich geaendert hat.
 */
export function resolveCompanyNames(
  events: readonly CalendarEvent[],
  resolve: CompanyNameResolver,
): CalendarEvent[] {
  return events.map((event) => {
    const matched = resolve(event.companyName);
    if (matched === null || matched === event.companyName) return event;
    return { ...event, matchedCompanyName: matched };
  });
}
