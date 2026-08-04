import type * as React from "react";
import { ResponsiveContainer } from "recharts";

/**
 * Bausteine, die jedes Diagramm umgeben: Zeichenflaeche, Tooltip-Kasten,
 * Leerzustand und die aufklappbare Datentabelle. Die Werte, die Recharts
 * braucht (Achsen, Raster, Margins), stehen in `chartTheme.ts` — Recharts liest
 * die Typen seiner Kinder, eigene Wrapper waeren dort unbekannte Elemente.
 */

/**
 * Zeichenflaeche eines Diagramms: feste Hoehe (sonst kollabiert der
 * `ResponsiveContainer`) und die Beschreibung fuer Hilfsmittel. Das Diagramm
 * selbst ist fuer Screenreader ein Bild; die Zahlen stehen in der Datentabelle
 * darunter (§17).
 */
export function ChartCanvas({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: React.ReactElement;
}) {
  return (
    <div className="h-64 w-full sm:h-72" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Kasten hinter einem Tooltip — eine Optik fuer alle Diagramme. */
export function ChartTooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm tabular-nums shadow-md">
      {children}
    </div>
  );
}

/** Leerzustand an der Stelle des Diagramms. */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{children}</p>;
}

/**
 * Aufklappbare Datentabelle unter einem Diagramm (§17) — der zugaengliche
 * Zwilling der Zeichnung, gleich beschriftet und gleich gesetzt.
 */
export function ChartDataTable({ children }: { children: React.ReactNode }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Datentabelle anzeigen
      </summary>
      <div className="relative mt-3 overflow-x-auto">{children}</div>
    </details>
  );
}
