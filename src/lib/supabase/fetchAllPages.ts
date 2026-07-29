/**
 * Seitenweises Laden vollstaendiger Tabellen.
 *
 * PostgREST liefert nie mehr als `db-max-rows` Zeilen je Antwort (Supabase-
 * Standard 1.000) und meldet die Kappung **nicht** als Fehler — eine Abfrage
 * ohne `range()` sieht erfolgreich aus und ist unvollstaendig. Genau daran
 * haben Sicherung und Datenexport still Daten verloren; deshalb gibt es diesen
 * einen Baustein, statt die Schleife an jeder Aufrufstelle zu wiederholen.
 *
 * Abbruch, sobald eine Seite kuerzer als die Seitengroesse ist. Damit das ueber
 * Seitengrenzen hinweg traegt, muss der Aufrufer **eindeutig** sortieren
 * (fachliches Feld plus `id` als Tiebreaker) — sonst kann dieselbe Zeile
 * zweimal oder gar nicht erscheinen.
 */

/** Seitengroesse; entspricht dem PostgREST-Standardlimit von Supabase. */
export const PAGE_SIZE = 1000;

/** Strukturelle Sicht auf eine PostgREST-Antwort (passt auf jeden Query-Builder). */
interface PageResponse<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Laedt alle Seiten und wirft den ersten Fehler weiter — ein Teilergebnis wird
 * nie zurueckgegeben. Bei Sicherungen und Exporten ist eine fehlende Datei
 * deutlich besser als eine unvollstaendige.
 *
 * @param fetchPage Liefert die Zeilen von `from` bis einschliesslich `to`.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResponse<T>>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}
