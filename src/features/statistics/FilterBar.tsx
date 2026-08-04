import * as React from "react";
import { Select } from "@/components/ui/select";
import { EntitySelect, type EntityOption } from "@/components/domain/EntitySelect";
import {
  FilterBar as FilterBarShell,
  FilterField,
  FilterReset,
} from "@/components/ui/filter-bar";
import { isEmptyFilter, type StatisticsFilter } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { EMPTY_STATISTICS_FILTER } from "./filterParams";

interface FilterBarProps {
  filter: StatisticsFilter;
  setFilter: (next: StatisticsFilter) => void;
  years: number[];
  securities: Map<string, EntityInfo>;
  depots: Map<string, EntityInfo>;
  /**
   * Jahresauswahl anzeigen. Der Vergleichsbereich waehlt seine Zeitraeume
   * selbst; dort waere dieser Regler wirkungslos und damit irrefuehrend.
   */
  showYear?: boolean;
  /**
   * Depotauswahl anzeigen. Die Entwicklung setzt auf den Depotstaenden auf, und
   * die kennen kein Depot — der Regler traefe dort nur eine Haelfte des
   * Vergleichs.
   */
  showDepot?: boolean;
}

function toOptions(map: Map<string, EntityInfo>): EntityOption[] {
  return [...map.entries()].map(([id, info]) => ({
    id,
    name: info.name,
    archived: info.archived,
  }));
}

/**
 * Globale, kombinierbare Statistikfilter (§11): **Jahr, Unternehmen, Depot** —
 * in jedem Unterbereich dieselben drei, in derselben Reihenfolge. Der Filter
 * ist URL-gestuetzt (siehe `useStatisticsFilter`) und wirkt ueberall gleich.
 * Archivierte Unternehmen/Depots bleiben waehlbar (gesondert gruppiert, aber
 * nie ausgeschlossen — {@link EntitySelect}).
 *
 * **Datenquelle und Zahlungsart standen frueher daneben.** Sie liessen sich in
 * der Zahlungsliste nicht nachbilden: Wer eine so gefilterte Kennzahl anklickte,
 * landete in einer Liste mit *mehr* Zahlungen als die Zahl, aus der er kam —
 * genau die Zusage, auf der der ganze Statistikbereich steht (§13). Beide
 * Kriterien sind deshalb entfallen; wer nach Herkunft sucht, findet sie in der
 * Datenqualitaet.
 *
 * Zwei Auswahlen entfallen je nach Unterbereich, weil sie dort wirkungslos
 * waeren — und ein wirkungsloses Bedienelement ist schlimmer als keines:
 *
 * * die **Jahresauswahl** im Vergleich und im Breakdown, die ihre Zeitraeume
 *   selbst waehlen ({@link showYear});
 * * die **Depotauswahl** in der Entwicklung, die auf den Depotstaenden
 *   aufsetzt. Der Portfolio-Export fasst alle Depots zusammen und nennt keines
 *   (docs/PORTFOLIO_IMPORT.md §3); eine Depotauswahl traefe dort nur die
 *   erhaltenen Zahlungen und liesse die erwarteten unberuehrt — der Vergleich
 *   waere still falsch ({@link showDepot}).
 */
export function FilterBar({
  filter,
  setFilter,
  years,
  securities,
  depots,
  showYear = true,
  showDepot = true,
}: FilterBarProps) {
  const securityOptions = React.useMemo(() => toOptions(securities), [securities]);
  const depotOptions = React.useMemo(() => toOptions(depots), [depots]);
  const active = !isEmptyFilter(filter);
  const activeCount = [
    showYear ? filter.year : null,
    filter.securityId,
    showDepot ? filter.depotId : null,
  ].filter((value) => value !== null).length;

  return (
    <FilterBarShell activeCount={activeCount}>
      {showYear && (
        <FilterField id="stats-filter-year" label="Jahr">
          <Select
            id="stats-filter-year"
            value={filter.year !== null ? String(filter.year) : ""}
            onChange={(event) => {
              const value = event.target.value;
              setFilter({ ...filter, year: value ? Number.parseInt(value, 10) : null });
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
      )}

      <FilterField id="stats-filter-security" label="Unternehmen">
        <EntitySelect
          id="stats-filter-security"
          options={securityOptions}
          value={filter.securityId ?? ""}
          onChange={(value) => {
            setFilter({ ...filter, securityId: value || null });
          }}
          allLabel="Alle Unternehmen"
        />
      </FilterField>

      {showDepot && (
        <FilterField id="stats-filter-depot" label="Depot">
          <EntitySelect
            id="stats-filter-depot"
            options={depotOptions}
            value={filter.depotId ?? ""}
            onChange={(value) => {
              setFilter({ ...filter, depotId: value || null });
            }}
            allLabel="Alle Depots"
          />
        </FilterField>
      )}

      {active && (
        <FilterReset
          onClick={() => {
            setFilter(EMPTY_STATISTICS_FILTER);
          }}
        />
      )}
    </FilterBarShell>
  );
}
