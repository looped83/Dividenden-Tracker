import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

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
  className?: string;
}

interface StatTableProps<T> {
  rows: readonly T[];
  columns: readonly StatColumn<T>[];
  getRowKey: (row: T) => string;
  /** Text, gegen den die Suche (case-insensitiv, Teilstring) prueft. */
  searchOf?: (row: T) => string;
  searchPlaceholder?: string;
  initialSort?: { key: string; direction: SortDirection };
  pageSize?: number;
  caption: string;
  emptyMessage?: string;
  /** Optionaler Klick-Handler je Zeile (Drill-down). */
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
}

/**
 * Wiederverwendbare Statistiktabelle (§11) mit Sortierung, Suche und
 * Seitennavigation. Sie enthaelt **keine** fachlichen Berechnungen — Werte und
 * Reihenfolge-Kriterien liefert der Aufrufer aus der Analytics-Schicht. Bei
 * langen Listen (z. B. >500 Unternehmen) begrenzt die Paginierung die Anzahl
 * gleichzeitig gerenderter Zeilen.
 */
export function StatTable<T>({
  rows,
  columns,
  getRowKey,
  searchOf,
  searchPlaceholder = "Suchen …",
  initialSort,
  pageSize = 25,
  caption,
  emptyMessage = "Keine Daten für die aktuelle Auswahl.",
  onRowClick,
  rowLabel,
}: StatTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{
    key: string;
    direction: SortDirection;
  } | null>(initialSort ?? null);
  const [page, setPage] = React.useState(1);

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

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const column = columnByKey.get(sort.key);
    if (!column?.compare) return filtered;
    const compare = column.compare;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compare(a, b) * factor);
  }, [filtered, sort, columnByKey]);

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

  return (
    <div className="space-y-3">
      {searchOf && (
        <div className="relative max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-9"
            placeholder={searchPlaceholder}
            value={query}
            aria-label={searchPlaceholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
      )}

      <div className="w-full overflow-x-auto rounded-lg border border-border">
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/50">
            <tr className="border-b border-border">
              {columns.map((column) => {
                const isSorted = sort?.key === column.key;
                const ariaSort: React.AriaAttributes["aria-sort"] = isSorted
                  ? sort.direction === "asc"
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
                          "inline-flex items-center gap-1 rounded-sm uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                          column.align === "right" && "flex-row-reverse",
                        )}
                        aria-label={`Nach ${column.headerLabel ?? column.key} sortieren`}
                      >
                        {column.header}
                        {isSorted ? (
                          sort.direction === "asc" ? (
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
                  {...(onRowClick
                    ? {
                        role: "button",
                        tabIndex: 0,
                        "aria-label": rowLabel?.(row),
                        onClick: () => {
                          onRowClick(row);
                        },
                        onKeyDown: (event: React.KeyboardEvent) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        },
                      }
                    : {})}
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

      {sorted.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span aria-live="polite">
            {start + 1}–{Math.min(start + pageSize, sorted.length)} von {sorted.length}
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
              Seite {currentPage} / {pageCount}
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
