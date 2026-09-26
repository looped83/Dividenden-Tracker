import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterSort } from "@/components/ui/filter-bar";
import { ListGroup, ListRow } from "@/components/ui/list";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils/cn";
import { formatCountNumber } from "@/lib/utils/formatNumber";

export type SortDirection = "asc" | "desc";

export interface StatColumn<T> {
  /** Stabiler Spaltenschluessel (auch fuer den Sortierzustand). */
  key: string;
  header: React.ReactNode;
  align?: "left" | "right";
  /**
   * Vergleichsfunktion fuer aufsteigende Sortierung. Ist sie gesetzt, wird die
   * Spalte sortierbar; Money-Spalten vergleichen ueber `Money.compareTo`
   * (keine Float-Arithmetik), Text ueber `localeCompare`.
   */
  compare?: (a: T, b: T) => number;
  render: (row: T) => React.ReactNode;
  /** Klartext fuer den sortierbaren Spaltenkopf (Screenreader). */
  headerLabel?: string;
  /** Nur fuer die Tabellenzelle (z. B. `hidden xl:table-cell`), nicht fuer die Liste. */
  className?: string;
}

interface StatTableProps<T> {
  rows: readonly T[];
  /**
   * Die erste Spalte benennt die Zeile, die zweite traegt ihre Kennzahl. Auf
   * dem Telefon stehen beide in der Kopfzeile eines Listeneintrags, alle
   * weiteren als beschriftete Werte darunter.
   */
  columns: readonly StatColumn<T>[];
  getRowKey: (row: T) => string;
  /** Text, gegen den die Suche (case-insensitiv, Teilstring) prueft. */
  searchOf?: (row: T) => string;
  searchPlaceholder?: string;
  /**
   * Von aussen gesteuerte Suche. Ist sie gesetzt, filtert die Tabelle danach
   * und zeichnet **kein** eigenes Feld — das steht dann dort, wo es der
   * Aufrufer hinsetzt (z. B. in der Kopfzeile der Kachel, {@link StatSearch}).
   */
  query?: string;
  initialSort?: { key: string; direction: SortDirection };
  pageSize?: number;
  caption: string;
  emptyMessage?: string;
  /** Optionaler Klick-Handler je Zeile (Drill-down). */
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
}

/**
 * Suchfeld der Statistiktabellen. Eigenstaendig, damit es auch ausserhalb der
 * Tabelle stehen kann — auf breiten Schirmen sitzt es in der Kopfzeile der
 * Kachel, wo Ueberschrift und Werkzeug in einer Zeile liegen.
 */
export function StatSearch({
  value,
  onChange,
  placeholder = "Suchen …",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        className="pl-9"
        placeholder={placeholder}
        value={value}
        aria-label={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

/** Kurzname einer Spalte — fuer die Sortierauswahl und die Beschriftung in der Liste. */
function columnName<T>(column: StatColumn<T>): string {
  return typeof column.header === "string"
    ? column.header
    : (column.headerLabel ?? column.key);
}

/**
 * Ein Klick auf einen Link in der Zeile (etwa den Namen, der zur Detailseite
 * fuehrt) gehoert dem Link. Ohne diese Pruefung loeste er zusaetzlich den
 * Drill-down der Zeile aus, und die zweite Navigation gewann.
 */
function fromNestedLink(event: React.SyntheticEvent): boolean {
  return (event.target as HTMLElement).closest("a") !== null;
}

/**
 * Wiederverwendbare Statistiktabelle (§11) mit Sortierung, Suche und
 * Seitennavigation. Sie enthaelt **keine** fachlichen Berechnungen — Werte und
 * Reihenfolge-Kriterien liefert der Aufrufer aus der Analytics-Schicht. Bei
 * langen Listen (z. B. >500 Unternehmen) begrenzt die Paginierung die Anzahl
 * gleichzeitig gerenderter Zeilen.
 *
 * **Auf dem Telefon eine Liste statt einer Tabelle.** Die Tabelle scrollte
 * seitlich, und die Namensspalte nahm die ganze Breite ein: Zu sehen waren
 * die Namen, nicht eine einzige Zahl. Die Liste zeigt je Zeile Name und
 * Kennzahl oben, die weiteren Spalten beschriftet darunter; sortiert wird ueber
 * dieselbe Auswahl wie in den Filterleisten.
 */
export function StatTable<T>({
  rows,
  columns,
  getRowKey,
  searchOf,
  searchPlaceholder = "Suchen …",
  query: externalQuery,
  initialSort,
  pageSize = 25,
  caption,
  emptyMessage = "Keine Daten für die aktuelle Auswahl.",
  onRowClick,
  rowLabel,
}: StatTableProps<T>) {
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  const sortId = React.useId();
  const [ownQuery, setOwnQuery] = React.useState("");
  const [sort, setSort] = React.useState<{
    key: string;
    direction: SortDirection;
  } | null>(initialSort ?? null);
  const [page, setPage] = React.useState(1);

  const controlled = externalQuery !== undefined;
  const query = externalQuery ?? ownQuery;

  // Neue Suche -> zurueck auf Seite 1. Waehrend des Renderns abgeglichen
  // (React-Muster "Zustand bei Prop-Aenderung anpassen") statt in einem Effect.
  const [lastQuery, setLastQuery] = React.useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setPage(1);
  }

  const sortableColumns = React.useMemo(
    () => columns.filter((column) => column.compare),
    [columns],
  );

  // Die Liste kennt keinen unsortierten Zustand: Ihre Auswahl zeigt immer ein
  // Kriterium. Ohne Vorgabe ist es die erste sortierbare Spalte, aufsteigend —
  // die natuerliche Reihenfolge der Zeilen (Januar bis Dezember).
  const firstSortable = sortableColumns.at(0);
  const activeSort =
    sort ??
    (!isWide && firstSortable
      ? { key: firstSortable.key, direction: "asc" as const }
      : null);

  const columnByKey = React.useMemo(() => {
    const map = new Map<string, StatColumn<T>>();
    for (const column of columns) map.set(column.key, column);
    return map;
  }, [columns]);

  const filtered = React.useMemo(() => {
    if (!searchOf || query.trim() === "") return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => searchOf(row).toLowerCase().includes(needle));
  }, [rows, searchOf, query]);

  const sortKey = activeSort?.key;
  const sortDirection = activeSort?.direction;
  const sorted = React.useMemo(() => {
    const compare = sortKey ? columnByKey.get(sortKey)?.compare : undefined;
    if (!compare) return filtered;
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compare(a, b) * factor);
  }, [filtered, sortKey, sortDirection, columnByKey]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "desc" };
      if (prev.direction === "desc") return { key, direction: "asc" };
      return null;
    });
  };

  const rowInteraction = (row: T) =>
    onRowClick
      ? {
          role: "button",
          tabIndex: 0,
          "aria-label": rowLabel?.(row),
          onClick: (event: React.MouseEvent) => {
            if (!fromNestedLink(event)) onRowClick(row);
          },
          onKeyDown: (event: React.KeyboardEvent) => {
            if (fromNestedLink(event)) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onRowClick(row);
            }
          },
        }
      : {};

  return (
    <div className="space-y-3">
      {searchOf && !controlled && (
        <div className="max-w-xs">
          <StatSearch
            value={query}
            onChange={setOwnQuery}
            placeholder={searchPlaceholder}
          />
        </div>
      )}

      {isWide ? (
        // `relative`: haelt die absolut positionierten `sr-only`-Texte im
        // Bildlaufkasten — sonst schiebt eine breite Tabelle die ganze Seite
        // nach rechts (siehe ui/table.tsx).
        <div className="relative w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full caption-bottom text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-muted/50">
              <tr className="border-b border-border">
                {columns.map((column) => {
                  const isSorted = activeSort?.key === column.key;
                  const ariaSort: React.AriaAttributes["aria-sort"] = isSorted
                    ? activeSort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : column.compare
                      ? "none"
                      : undefined;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={ariaSort}
                      className={cn(
                        "h-11 px-4 align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground",
                        column.align === "right" ? "text-right" : "text-left",
                        column.className,
                      )}
                    >
                      {column.compare ? (
                        <button
                          type="button"
                          onClick={() => {
                            toggleSort(column.key);
                          }}
                          className={cn(
                            "inline-flex h-full min-h-11 items-center gap-1 rounded-sm uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            column.align === "right" && "flex-row-reverse",
                          )}
                          aria-label={`Nach ${column.headerLabel ?? column.key} sortieren`}
                        >
                          {column.header}
                          {isSorted ? (
                            activeSort.direction === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : (
                              <ArrowDown className="size-3.5" aria-hidden />
                            )
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr
                    key={getRowKey(row)}
                    className={cn(
                      "border-b border-border transition-colors hover:bg-muted/40",
                      onRowClick && "cursor-pointer focus-within:bg-muted/40",
                    )}
                    {...rowInteraction(row)}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          "px-4 py-3 align-middle",
                          column.align === "right" && "text-right tabular-nums",
                          column.className,
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {activeSort && sortableColumns.length > 1 && (
            <FilterSort
              id={sortId}
              value={activeSort.key}
              direction={activeSort.direction}
              options={sortableColumns.map((column) => ({
                value: column.key,
                label: `Nach ${columnName(column)}`,
              }))}
              onValueChange={(key) => {
                setPage(1);
                setSort({ key, direction: activeSort.direction });
              }}
              onDirectionChange={(direction) => {
                setPage(1);
                setSort({ key: activeSort.key, direction });
              }}
            />
          )}
          {pageRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <StatList
              rows={pageRows}
              columns={columns}
              getRowKey={getRowKey}
              caption={caption}
              clickable={onRowClick !== undefined}
              rowInteraction={rowInteraction}
            />
          )}
        </>
      )}

      {sorted.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span aria-live="polite">
            {formatCountNumber(start + 1)}–
            {formatCountNumber(Math.min(start + pageSize, sorted.length))} von{" "}
            {formatCountNumber(sorted.length)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => {
                setPage((value) => Math.max(1, value - 1));
              }}
            >
              Zurück
            </Button>
            <span aria-hidden>
              Seite {formatCountNumber(currentPage)} / {formatCountNumber(pageCount)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => {
                setPage((value) => Math.min(pageCount, value + 1));
              }}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Listenfassung der Tabelle. Die Zeile steht in der Karte ohne eigenen Rahmen
 * (`ListGroup inset`) — eine Tabelle in der Karte braucht ihn, eine Liste
 * nicht, und jeder weitere Rahmen kostet auf dem Telefon Breite.
 */
function StatList<T>({
  rows,
  columns,
  getRowKey,
  caption,
  clickable,
  rowInteraction,
}: {
  rows: readonly T[];
  columns: readonly StatColumn<T>[];
  getRowKey: (row: T) => string;
  caption: string;
  clickable: boolean;
  rowInteraction: (row: T) => React.HTMLAttributes<HTMLElement>;
}) {
  const nameColumn = columns.at(0);
  const valueColumn = columns.at(1);
  const detailColumns = columns.slice(2);
  if (!nameColumn) return null;

  return (
    <ListGroup inset aria-label={caption}>
      {rows.map((row) => (
        <li key={getRowKey(row)}>
          <ListRow
            interactive={clickable}
            className="items-start"
            {...rowInteraction(row)}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                {/* Namen duerfen hier auf zwei Zeilen umbrechen (wie in jeder
                    Liste, `ListItemBody`); die Tabellenzelle kuerzt sie mit
                    `truncate`, damit die Spalte schmal bleibt. */}
                <div className="min-w-0 font-medium [&_.truncate]:line-clamp-2 [&_.truncate]:whitespace-normal">
                  {nameColumn.render(row)}
                </div>
                {valueColumn && (
                  <div className="shrink-0 font-semibold tabular-amount">
                    {valueColumn.render(row)}
                  </div>
                )}
              </div>
              {/* Beschriftung links, Wert rechts — dieselbe Form wie im
                  Monatsvergleich (`ComparisonBreakdown`); die Werte stehen in
                  einer Spalte unter der Kennzahl. */}
              {detailColumns.length > 0 && (
                <dl className="space-y-0.5 text-sm">
                  {detailColumns.map((column) => (
                    <div
                      key={column.key}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="text-muted-foreground">{columnName(column)}</dt>
                      <dd className="text-right tabular-amount">{column.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {clickable && (
              <ChevronRight
                className="mt-1 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
          </ListRow>
        </li>
      ))}
    </ListGroup>
  );
}
