import { normalizeCompareName } from "./normalizeName";
import { companyNameSimilarity } from "./similarity";

/**
 * Konservatives, mehrstufiges Unternehmens-Matching (IMPORT_SPEC.md §6).
 *
 * Stufe A: eindeutige Kennung (ISIN/WKN) — in dieser Datei nicht vorhanden.
 * Stufe B: exakter kanonischer Name (genau ein Treffer) -> automatischer Vorschlag.
 * Stufe C: bestaetigter Alias -> Aufloesung auf genau ein Unternehmen.
 * Stufe D: aehnlicher Name -> NUR Hinweis, niemals automatische Zusammenfuehrung.
 */

export interface ExistingSecurity {
  id: string;
  name: string;
  isin: string | null;
  wkn: string | null;
  archived: boolean;
}

export interface ExistingAlias {
  aliasNormalized: string;
  securityId: string;
}

export type MatchReason = "exact_name" | "alias" | "similar" | "none";

export interface CompanyMatch {
  reason: MatchReason;
  /** true nur bei exact_name/alias — Stufe D ist niemals automatisch. */
  autoAssignable: boolean;
  securityId: string | null;
  securityName: string | null;
  /** Aehnlichkeitswert nur bei Stufe D. */
  similarity?: number;
  /** Weitere aehnliche Kandidaten (Stufe D), absteigend nach Aehnlichkeit. */
  suggestions: { securityId: string; securityName: string; similarity: number }[];
}

const SIMILARITY_THRESHOLD = 0.7;

/**
 * Bestimmt fuer einen Quell-Investmentnamen den konservativen Match-Vorschlag.
 * Es findet keine automatische Zuordnung bei nur aehnlichen Namen statt.
 */
export function matchCompany(
  sourceName: string,
  existing: ExistingSecurity[],
  aliases: ExistingAlias[] = [],
): CompanyMatch {
  const normalizedSource = normalizeCompareName(sourceName);

  // Stufe B: exakter kanonischer Name. Aktive Treffer haben Vorrang vor archivierten.
  const exactMatches = existing.filter(
    (s) => normalizeCompareName(s.name) === normalizedSource,
  );
  if (exactMatches.length >= 1) {
    const active = exactMatches.filter((s) => !s.archived);
    const pick =
      active.length === 1
        ? active[0]
        : exactMatches.length === 1
          ? exactMatches[0]
          : null;
    if (pick) {
      return {
        reason: "exact_name",
        autoAssignable: true,
        securityId: pick.id,
        securityName: pick.name,
        suggestions: [],
      };
    }
    // Mehrere exakte (aktive) Treffer -> nicht eindeutig, Nutzer muss entscheiden.
  }

  // Stufe C: bestaetigter Alias.
  const alias = aliases.find((a) => a.aliasNormalized === normalizedSource);
  if (alias) {
    const target = existing.find((s) => s.id === alias.securityId);
    if (target) {
      return {
        reason: "alias",
        autoAssignable: true,
        securityId: target.id,
        securityName: target.name,
        suggestions: [],
      };
    }
  }

  // Stufe D: aehnliche Namen — nur als Hinweis.
  const suggestions = existing
    .map((s) => ({
      securityId: s.id,
      securityName: s.name,
      similarity: companyNameSimilarity(normalizedSource, normalizeCompareName(s.name)),
    }))
    .filter((c) => c.similarity >= SIMILARITY_THRESHOLD && c.similarity < 1)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  const best = suggestions.at(0);
  if (best) {
    return {
      reason: "similar",
      autoAssignable: false,
      securityId: null,
      securityName: null,
      similarity: best.similarity,
      suggestions,
    };
  }

  return {
    reason: "none",
    autoAssignable: false,
    securityId: null,
    securityName: null,
    suggestions: [],
  };
}
