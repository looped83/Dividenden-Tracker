import * as React from "react";
import { X } from "lucide-react";
import { Select } from "@/components/ui/select";
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
}

interface OptionEntry {
  id: string;
  name: string;
  archived: boolean;
}

function sortedEntries(map: Map<string, EntityInfo>): OptionEntry[] {
  return [...map.entries()]
    .map(([id, info]) => ({ id, name: info.name, archived: info.archived }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-40 flex-1 space-y-1.5">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Globale, kombinierbare Statistikfilter (§11): Jahr, Unternehmen, Depot,
 * Datenquelle und Zahlungsstatus. Der Filter ist URL-gestuetzt (siehe
 * `useStatisticsFilter`) und wirkt auf alle Unterbereiche. Archivierte
 * Unternehmen/Depots bleiben waehlbar (sie werden als „(archiviert)"
 * gekennzeichnet, aber nie ausgeschlossen).
 */
export function FilterBar({
  filter,
  setFilter,
  years,
  securities,
  depots,
}: FilterBarProps) {
  const securityOptions = React.useMemo(() => sortedEntries(securities), [securities]);
  const depotOptions = React.useMemo(() => sortedEntries(depots), [depots]);
  const active = !isEmptyFilter(filter);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
      <Field id="stats-filter-year" label="Jahr">
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
      </Field>

      <Field id="stats-filter-security" label="Unternehmen">
        <Select
          id="stats-filter-security"
          value={filter.securityId ?? ""}
          onChange={(event) => {
            setFilter({ ...filter, securityId: event.target.value || null });
          }}
        >
          <option value="">Alle Unternehmen</option>
          {securityOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.archived ? " (archiviert)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="stats-filter-depot" label="Depot">
        <Select
          id="stats-filter-depot"
          value={filter.depotId ?? ""}
          onChange={(event) => {
            setFilter({ ...filter, depotId: event.target.value || null });
          }}
        >
          <option value="">Alle Depots</option>
          {depotOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.archived ? " (archiviert)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="stats-filter-source" label="Datenquelle">
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
      </Field>

      <Field id="stats-filter-type" label="Zahlungsart">
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
      </Field>

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
    </div>
  );
}
