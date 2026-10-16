import * as React from "react";
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

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("px-3 py-3 align-middle first:pl-0 last:pr-0", className)}
      {...props}
    />
  );
}
