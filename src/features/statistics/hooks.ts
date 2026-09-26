import * as React from "react";
import { useSearchParams } from "react-router";
import type { AnalyticsPayment, StatisticsFilter } from "@/lib/statistics";
import { buildEntityMap, type EntityInfo } from "@/features/dashboard/format";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import { useSecuritySnapshots } from "@/features/securities/hooks";
import {
  buildPortfolioSeries,
  EMPTY_PORTFOLIO_SERIES,
  type PortfolioSeries,
  type SecurityFacets,
} from "@/features/securities/snapshots";
import { useDepots } from "@/features/depots/hooks";
import {
  applyStatisticsFilter,
  EMPTY_STATISTICS_FILTER,
  parseStatisticsFilter,
} from "./filterParams";

export interface StatisticsData {
  /** Alle aktiven Eingaenge mit effektivem Datum (§10), ungefiltert. */
  payments: AnalyticsPayment[];
  securities: Map<string, EntityInfo>;
  depots: Map<string, EntityInfo>;
  /** Depotstaende als Zeitreihe (docs/PORTFOLIO_IMPORT.md); leer ohne Import. */
  portfolio: PortfolioSeries;
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
export function useStatisticsData(
  filter: StatisticsFilter = EMPTY_STATISTICS_FILTER,
): StatisticsData {
  const { payments, paymentsQuery, securitiesQuery } = useEffectivePayments();
  const depotsQuery = useDepots();
  const snapshotsQuery = useSecuritySnapshots();

  const securities = React.useMemo(
    () => buildEntityMap(securitiesQuery.data ?? []),
    [securitiesQuery.data],
  );
  const depots = React.useMemo(
    () => buildEntityMap(depotsQuery.data ?? []),
    [depotsQuery.data],
  );

  // Branche und Land stehen in `securities`, nicht im Depotstand — die Serie
  // braucht beides, um die Aufteilung zu bilden.
  const facets = React.useMemo(() => {
    const map = new Map<string, SecurityFacets>();
    for (const security of securitiesQuery.data ?? []) {
      map.set(security.id, { sector: security.sector, country: security.country });
    }
    return map;
  }, [securitiesQuery.data]);

  /**
   * Die Serie folgt dem **Unternehmensfilter**, damit sie zu den ebenfalls
   * gefilterten Zahlungen passt. Ohne das stuende bei ausgewaehltem Unternehmen
   * dessen erhaltene Summe neben der erwarteten Jahresdividende des *ganzen*
   * Depots — zwei Zahlen aus verschiedenen Grundgesamtheiten, deren Differenz
   * nichts bedeutet.
   *
   * Der **Depotfilter** bleibt hier ohne Wirkung, und zwar zwangslaeufig: Der
   * Portfolio-Export von DivvyDiary fasst alle Depots zusammen und nennt
   * keines (docs/PORTFOLIO_IMPORT.md §3). Die Unterbereiche, die auf den
   * Staenden aufsetzen, blenden ihn deshalb aus, statt eine Auswahl anzubieten,
   * die nur eine Haelfte des Vergleichs traefe.
   */
  const portfolio = React.useMemo(() => {
    const snapshots = snapshotsQuery.data;
    if (!snapshots) return EMPTY_PORTFOLIO_SERIES;
    const relevant =
      filter.securityId === null
        ? snapshots
        : snapshots.filter((row) => row.security_id === filter.securityId);
    return buildPortfolioSeries(relevant, facets);
  }, [snapshotsQuery.data, facets, filter.securityId]);

  return {
    payments,
    securities,
    depots,
    portfolio,
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
