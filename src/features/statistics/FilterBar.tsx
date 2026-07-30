import * as React from "react";
import { X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { EntitySelect, type EntityOption } from "@/components/domain/EntitySelect";
import { FilterBar as FilterBarShell, FilterField } from "@/components/ui/filter-bar";
import { Button } from "@/components/ui/button";
import {
  isEmptyFilter,
  type PaymentSource,
  type PaymentType,
  type StatisticsFilter,
} from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { describeSource } from "@/features/dashboard/format";
import {
  describePaymentType,
  PAYMENT_SOURCE_VALUES,
  PAYMENT_TYPE_VALUES,
} from "./format";
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
}

function toOptions(map: Map<string, EntityInfo>): EntityOption[] {
  return [...map.entries()].map(([id, info]) => ({
    id,
    name: info.name,
    archived: info.archived,
  }));
}

/**
 * Globale, kombinierbare Statistikfilter (§11): Jahr, Unternehmen, Depot,
 * Datenquelle und Zahlungsstatus. Der Filter ist URL-gestuetzt (siehe
 * `useStatisticsFilter`) und wirkt auf alle Unterbereiche. Archivierte
 * Unternehmen/Depots bleiben waehlbar (gesondert gruppiert, aber nie
 * ausgeschlossen — {@link EntitySelect}).
 */
export function FilterBar({
  filter,
  setFilter,
  years,
  securities,
  depots,
  showYear = true,
}: FilterBarProps) {
  const securityOptions = React.useMemo(() => toOptions(securities), [securities]);
  const depotOptions = React.useMemo(() => toOptions(depots), [depots]);
  const active = !isEmptyFilter(filter);
  const activeCount = [
    showYear ? filter.year : null,
    filter.securityId,
    filter.depotId,
    filter.source,
    filter.paymentType,
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

      <FilterField id="stats-filter-source" label="Datenquelle">
        <Select
          id="stats-filter-source"
          value={filter.source ?? ""}
          onChange={(event) => {
            setFilter({
              ...filter,
              source: (event.target.value || null) as PaymentSource | null,
            });
          }}
        >
          <option value="">Alle Quellen</option>
          {PAYMENT_SOURCE_VALUES.map((source) => (
            <option key={source} value={source}>
              {describeSource(source)}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField id="stats-filter-type" label="Zahlungsart">
        <Select
          id="stats-filter-type"
          value={filter.paymentType ?? ""}
          onChange={(event) => {
            setFilter({
              ...filter,
              paymentType: (event.target.value || null) as PaymentType | null,
            });
          }}
        >
          <option value="">Alle Arten</option>
          {PAYMENT_TYPE_VALUES.map((type) => (
            <option key={type} value={type}>
              {describePaymentType(type)}
            </option>
          ))}
        </Select>
      </FilterField>

      {active && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11"
          onClick={() => {
            setFilter(EMPTY_STATISTICS_FILTER);
          }}
        >
          <X /> Filter zurücksetzen
        </Button>
      )}
    </FilterBarShell>
  );
}
