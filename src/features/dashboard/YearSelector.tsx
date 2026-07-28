import * as React from "react";
import { Select } from "@/components/ui/select";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import type { YearSelection } from "@/lib/statistics";

interface YearSelectorProps {
  selection: YearSelection;
  onSelect: (next: YearSelection) => void;
  /** Vorhandene Jahre der Datenbasis, absteigend (§3). */
  availableYears: number[];
}

/**
 * Zeitraumsteuerung des Dashboards (§3) in derselben Filterleiste wie
 * Statistik- und Dividendenbereich (geteiltes Primitive `FilterBar`), damit der
 * Kopfbereich aller drei Seiten gleich wirkt.
 *
 * Frueher Segment-Buttons fuer aktuelles Jahr und Vorjahr plus eine zweite
 * Auswahl fuer alle uebrigen Jahre — zwei Bedienelemente fuer eine Entscheidung.
 * Jetzt eine Auswahl mit allen Jahren, wie „Jahr" in den anderen Bereichen.
 */
export function YearSelector({ selection, onSelect, availableYears }: YearSelectorProps) {
  // `availableYears` enthaelt nur Jahre mit Zahlungen. Das aktuelle Jahr ist
  // aber die Standardauswahl (yearParam.ts) und eine URL kann ein beliebiges
  // gueltiges Jahr mitbringen — beide muessen waehlbar sein, sonst stuende die
  // Auswahl auf einem Wert, den die Liste nicht kennt, und bliebe leer.
  const years = React.useMemo(() => {
    const set = new Set(availableYears);
    set.add(new Date().getFullYear());
    if (typeof selection === "number") set.add(selection);
    return [...set].sort((a, b) => b - a);
  }, [availableYears, selection]);

  return (
    <FilterBar>
      {/* Als einziges Feld wuerde flex-1 die volle Kartenbreite belegen; die
          Begrenzung haelt es auf der Breite der Felder in Statistik und
          Dividendenliste. Mobil fuellt es weiterhin die Zeile. */}
      <FilterField id="dashboard-year" label="Jahr" className="sm:max-w-56">
        <Select
          id="dashboard-year"
          value={selection === "all" ? "" : String(selection)}
          onChange={(event) => {
            const value = event.target.value;
            onSelect(value ? Number.parseInt(value, 10) : "all");
          }}
        >
          <option value="">Alle Jahre</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      </FilterField>
    </FilterBar>
  );
}
