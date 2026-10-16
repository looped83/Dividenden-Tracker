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
  /** Gesamtzahl, wenn die erste Seite mit `count` angefragt wurde. */
  count?: number | null;
}

/**
 * Laedt alle Seiten und wirft den ersten Fehler weiter — ein Teilergebnis wird
 * nie zurueckgegeben. Bei Sicherungen und Exporten ist eine fehlende Datei
 * deutlich besser als eine unvollstaendige.
 *
 * Nennt die erste Antwort die Gesamtzahl (der Aufrufer wertet `withCount`
 * aus und fragt `count: "exact"` an), kommen alle weiteren Seiten **parallel**
 * statt nacheinander — eine Wartezeit statt einer je 1.000 Zeilen. Ohne
 * Gesamtzahl bleibt es bei der Schleife.
 *
 * @param fetchPage Liefert die Zeilen von `from` bis einschliesslich `to`.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
    withCount: boolean,
  ) => PromiseLike<PageResponse<T>>,
): Promise<T[]> {
  const first = await fetchPage(0, PAGE_SIZE - 1, true);
  if (first.error) throw new Error(first.error.message);
  const all = [...(first.data ?? [])];
  if (all.length < PAGE_SIZE) return all;

  if (typeof first.count === "number") {
    const rest = await Promise.all(
      Array.from({ length: Math.ceil(first.count / PAGE_SIZE) - 1 }, (_, index) =>
        fetchPage((index + 1) * PAGE_SIZE, (index + 2) * PAGE_SIZE - 1, false),
      ),
    );
    for (const { data, error } of rest) {
      if (error) throw new Error(error.message);
      all.push(...(data ?? []));
    }
    // Endet die letzte Seite voll, koennte noch eine folgen (Zeilen kamen
    // zwischen Zaehlen und Laden hinzu): Die Schleife liest den Rest nach.
    if (all.length % PAGE_SIZE !== 0) return all;
  }

  for (let from = all.length; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1, false);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}
