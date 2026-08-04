import * as React from "react";
import { useSearchParams } from "react-router";
import {
  normalizePayoutMonths,
  withEffectiveDates,
  type AnalyticsPayment,
  type StatisticsFilter,
} from "@/lib/statistics";
import { Money, toCurrencyCode } from "@/lib/money";
import type { EntityInfo } from "@/features/dashboard/format";
import { useDashboardPayments } from "@/features/dashboard/hooks";
import { useSecurities, useSecuritySnapshots } from "@/features/securities/hooks";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import { useDepots } from "@/features/depots/hooks";
import { applyStatisticsFilter, parseStatisticsFilter } from "./filterParams";

interface EntityRow {
  id: string;
  name: string;
  archived_at: string | null;
}

function buildEntityMap(rows: readonly EntityRow[]): Map<string, EntityInfo> {
  return new Map(
    rows.map((row) => [row.id, { name: row.name, archived: row.archived_at !== null }]),
  );
}

export interface StatisticsData {
  /** Alle aktiven Eingaenge mit effektivem Datum (§10), ungefiltert. */
  payments: AnalyticsPayment[];
  securities: Map<string, EntityInfo>;
  depots: Map<string, EntityInfo>;
  /** Erwartete Jahresdividende je Unternehmen aus dem juengsten Depotstand. */
  expectedAnnualDividend: Map<string, Money>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Zentrale Datenbasis des Statistikbereichs. Sie nutzt dieselbe Query wie das
 * Dashboard (`useDashboardPayments`, Schluessel `["payments","dashboard"]`) —
 * dadurch teilen sich Dashboard und Statistik **einen** Cache-Eintrag, es
 * entsteht keine zweite Uebertragung und keine parallele Aggregation. Der
 * Ausschuettungsplan je Unternehmen wird einmal auf das effektive Datum
 * angewandt (§10); alle Kennzahlen laufen anschliessend ueber die Analytics-
 * Schicht.
 */
export function useStatisticsData(): StatisticsData {
  const paymentsQuery = useDashboardPayments();
  const securitiesQuery = useSecurities();
  const depotsQuery = useDepots();
  const snapshotsQuery = useSecuritySnapshots();

  const rawPayments = React.useMemo(() => paymentsQuery.data ?? [], [paymentsQuery.data]);

  const payoutBySecurity = React.useMemo(() => {
    const map = new Map<string, number[]>();
    for (const security of securitiesQuery.data ?? []) {
      const months = normalizePayoutMonths(security.payout_months);
      if (months.length > 0) map.set(security.id, months);
    }
    return map;
  }, [securitiesQuery.data]);

  const payments = React.useMemo(
    () => withEffectiveDates(rawPayments, payoutBySecurity),
    [rawPayments, payoutBySecurity],
  );

  const securities = React.useMemo(
    () => buildEntityMap(securitiesQuery.data ?? []),
    [securitiesQuery.data],
  );
  const depots = React.useMemo(
    () => buildEntityMap(depotsQuery.data ?? []),
    [depotsQuery.data],
  );

  // Nur der **juengste** Stand: Eine aeltere Stueckzahl beschriebe eine
  // Position, die es so nicht mehr gibt.
  const expectedAnnualDividend = React.useMemo(() => {
    const map = new Map<string, Money>();
    const snapshots = snapshotsQuery.data ?? [];
    for (const snapshot of snapshotsAt(snapshots, latestAsOf(snapshots))) {
      if (snapshot.annual_dividend_total === null) continue;
      map.set(
        snapshot.security_id,
        Money.fromString(
          snapshot.annual_dividend_total,
          toCurrencyCode(snapshot.currency),
        ),
      );
    }
    return map;
  }, [snapshotsQuery.data]);

  return {
    payments,
    securities,
    depots,
    expectedAnnualDividend,
    isLoading: paymentsQuery.isLoading,
    isError: paymentsQuery.isError,
    error: paymentsQuery.error,
    refetch: () => void paymentsQuery.refetch(),
  };
}

/**
 * Statistikfilter als URL-Zustand (§11). Steuerbar ueber `?year=&security=&depot=
 * &source=&type=`; bleibt nach Reload erhalten und funktioniert mit Browser-
 * Zurueck/-Vorwaerts. Der Filter wird als reine, isoliert getestete Funktion aus
 * den Suchparametern abgeleitet.
 */
export function useStatisticsFilter(): {
  filter: StatisticsFilter;
  setFilter: (next: StatisticsFilter) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = React.useMemo(() => parseStatisticsFilter(searchParams), [searchParams]);

  const setFilter = React.useCallback(
    (next: StatisticsFilter) => {
      setSearchParams((prev) => applyStatisticsFilter(prev, next), { replace: false });
    },
    [setSearchParams],
  );

  return { filter, setFilter };
}

export { useStatisticsContext, type StatisticsContext } from "./context";
