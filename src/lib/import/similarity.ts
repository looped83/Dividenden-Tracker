/**
 * Levenshtein-Distanz und daraus abgeleitetes Aehnlichkeitsverhaeltnis
 * (IMPORT_SPEC.md §6/§7, Stufe D). Dient AUSSCHLIESSLICH als Hinweis fuer den
 * Nutzer — niemals als automatische Zusammenfuehrung.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = (curr[j - 1] ?? 0) + 1;
      const insertion = (prev[j] ?? 0) + 1;
      const substitution = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(deletion, insertion, substitution);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

/** Aehnlichkeit in [0,1]; 1 = identisch. */
export function similarityRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

/**
 * Namens-Aehnlichkeit fuer den Unternehmensabgleich (Stufe D). Kombiniert die
 * Levenshtein-Ratio mit einer Token-Enthaltensein-Heuristik: ist die komplette
 * (mehr als ein Token umfassende) Tokenmenge des einen Namens Teilmenge des
 * anderen (z. B. "Allianz" ⊂ "Allianz SE", "Realty Income" ⊂ "Realty Income
 * Corporation"), gilt eine hohe Aehnlichkeit — solche Faelle sollen als Hinweis
 * erscheinen, ohne jemals automatisch zusammengefuehrt zu werden.
 */
export function companyNameSimilarity(a: string, b: string): number {
  const ratio = similarityRatio(a, b);
  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const shorter = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const longerSet = tokensA.length <= tokensB.length ? setB : setA;
  const contained = shorter.length >= 1 && shorter.every((t) => longerSet.has(t));
  return contained ? Math.max(ratio, 0.9) : ratio;
}
