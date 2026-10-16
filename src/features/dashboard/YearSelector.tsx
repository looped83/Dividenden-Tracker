import * as React from "react";
import { Select } from "@/components/ui/select";
import type { YearSelection } from "@/lib/statistics";

interface YearSelectorProps {
  selection: YearSelection;
  onSelect: (next: YearSelection) => void;
  /** Vorhandene Jahre der Datenbasis, absteigend (§3). */
  availableYears: number[];
}

/**
 * Zeitraumsteuerung des Dashboards (§3). Sitzt in der Kopfzeile neben der
 * Primaeraktion — eine eigene Filterleiste waere fuer ein einzelnes Feld zu
 * viel Rahmen. Beschriftet ueber `aria-label`, da in der Kopfzeile kein
 * sichtbares Label steht.
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
    <Select
      aria-label="Jahr"
      // Als Pille: Das Jahr gilt fuer die ganze Seite und sitzt deshalb im
      // Seitenkopf. Der Rahmen bleibt (`--input`, 3:1) — er macht das Feld als
      // Bedienelement erkennbar (UX_AND_DESIGN_SYSTEM.md §7).
      className="w-auto rounded-full pl-4 font-semibold"
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
  );
}
