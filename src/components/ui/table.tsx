import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Tabelle (UX_AND_DESIGN_SYSTEM.md §2), seit 1.9.0 in der Form der Listen:
 * **ohne Rahmen und ohne graue Kopfzeile**, Spaltenköpfe in gewöhnlicher
 * Schreibung statt Versalien, Zeilen durch Haarlinien getrennt. Die erste und
 * die letzte Spalte stehen bündig auf der Linie der Überschrift — wie Namen
 * und Beträge einer Liste. Ein Rahmen um jede Tabelle machte aus jeder Seite
 * ein Raster aus Kästen, während die Übersicht ihre Abschnitte allein durch
 * Abstand und Überschrift trennt.
 */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    // `relative` klammert die absolut positionierten `sr-only`-Texte (u. a.
    // die Tabellenbeschriftung) in diesen Kasten ein. Ohne positionierten
    // Vorfahren beziehen sie sich auf das Dokument, und eine breite Tabelle
    // laesst dann die **Seite** seitlich scrollen statt nur sich selbst.
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={className} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/50 motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 px-3 text-left align-middle text-[0.8125rem] font-medium text-muted-foreground first:pl-0 last:pr-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Sortierbarer Spaltenkopf: Antippen sortiert nach der Spalte, erneutes
 * Antippen dreht die Richtung (was genau passiert, entscheidet `onSort`).
 * Der Knopf fuellt die Kopfzeile (44px Trefferflaeche); der Zustand steht fuer
 * Sprachausgaben als `aria-sort` am `th`, sichtbar als Pfeil. Unsortierte
 * Spalten zeigen einen blassen Doppelpfeil — er sagt, dass der Kopf ein
 * Bedienelement ist. In rechtsbuendigen Spalten steht der Pfeil links, damit
 * der Titel buendig ueber den Betraegen bleibt.
 */
export function SortableTableHead({
  sorted,
  onSort,
  label,
  align = "left",
  className,
  children,
}: {
  /** Richtung, wenn die Tabelle nach dieser Spalte sortiert ist. */
  sorted: "asc" | "desc" | null;
  onSort: () => void;
  /** Klartext des Spaltennamens fuer „Nach … sortieren". */
  label: string;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TableHead
      scope="col"
      aria-sort={
        sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"
      }
      className={cn("h-11", align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={onSort}
        aria-label={`Nach ${label} sortieren`}
        className={cn(
          "inline-flex h-full min-h-11 items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
          sorted && "text-foreground",
        )}
      >
        {children}
        {sorted === "asc" ? (
          <ArrowUp className="size-3.5" aria-hidden />
        ) : sorted === "desc" ? (
          <ArrowDown className="size-3.5" aria-hidden />
        ) : (
          <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
        )}
      </button>
    </TableHead>
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("px-3 py-3 align-middle first:pl-0 last:pr-0", className)}
      {...props}
    />
  );
}
