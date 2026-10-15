import { Disclosure } from "@/components/ui/disclosure";
import type * as React from "react";

/**
 * Aufklappbare Datentabelle unter einem Diagramm (§17) — der zugaengliche
 * Zwilling der Zeichnung, gleich beschriftet und gleich gesetzt.
 *
 * Die Tabelle darin ist die **gewoehnliche** Tabelle der Anwendung
 * (`components/ui/table`): Rahmen, graue Kopfzeile, 44px hohe Kopfzellen,
 * `px-4 py-3` je Zelle. Zuvor trugen die Diagrammtabellen ein eigenes, engeres
 * Muster (`py-1`, keine Kopfflaeche) — dieselbe Sache sah zwei Bildschirme
 * weiter anders aus.
 */
export function ChartDataTable({ children }: { children: React.ReactNode }) {
  return (
    <Disclosure summary="Datentabelle anzeigen" contentClassName="mt-6">
      {children}
    </Disclosure>
  );
}

/**
 * Zeilenkopf einer Diagrammtabelle (Monat, Jahr, Kategorie). Optisch eine
 * gewoehnliche Zelle — die graue Grossschrift bleibt der Kopfzeile vorbehalten.
 */
export function ChartRowHeader({ children }: { children: React.ReactNode }) {
  return (
    <th scope="row" className="px-4 py-3 text-left align-middle font-normal">
      {children}
    </th>
  );
}
