import { Disclosure } from "@/components/ui/disclosure";
import type * as React from "react";

/**
 * Aufklappbare Datentabelle unter einem Diagramm (§17) — der zugaengliche
 * Zwilling der Zeichnung, gleich beschriftet und gleich gesetzt.
 *
 * Die Tabelle darin ist die **gewoehnliche** Tabelle der Anwendung
 * (`components/ui/table`): ohne Rahmen, Haarlinien zwischen den Zeilen, erste
 * und letzte Spalte buendig. Zuvor trugen die Diagrammtabellen ein eigenes, engeres
 * Muster (`py-1`, keine Kopfflaeche) — dieselbe Sache sah zwei Bildschirme
 * weiter anders aus.
 *
 * Seit 1.30.2 so breit wie ihr Inhalt (`w-auto`, 40px zwischen den Spalten)
 * statt ueber die ganze Breite: Drei kurze Spalten standen sonst auf dem
 * Telefon weit auseinander, und Jahr und Betrag liessen sich schlecht
 * zusammen lesen.
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
 * gewoehnliche Zelle (dieselben Abstaende wie `TableCell`, buendig am Rand).
 */
export function ChartRowHeader({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="row"
      className="px-3 py-3 text-left align-middle font-normal first:pl-0 last:pr-0"
    >
      {children}
    </th>
  );
}
