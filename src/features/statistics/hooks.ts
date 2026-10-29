import * as React from "react";
import { useSearchParams } from "react-router";
import type { AnalyticsPayment, StatisticsFilter } from "@/lib/statistics";
import { buildEntityMap, type EntityInfo } from "@/features/dashboard/format";
import { useAnalyticsPayments } from "@/features/dashboard/hooks";
import { useSecuritySnapshots } from "@/features/securities/hooks";
import {
  buildPortfolioSeries,
  EMPTY_PORTFOLIO_SERIES,
  type PortfolioSeries,
} from "@/features/securities/snapshots";
import { useDepots } from "@/features/depots/hooks";
import {
  applyStatisticsFilter,
  EMPTY_STATISTICS_FILTER,
  statisticsFilterOf,
} from "./filterParams";

export interface StatisticsData {
  /** Alle aktiven Eingaenge nach Zahltag (§10), ungefiltert. */
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
 * Dashboard (`useDashboardPayments`, Schluessel `PAYMENT_HISTORY_KEY`) —
 * dadurch teilen sich Dashboard und Statistik **einen** Cache-Eintrag, es
 * entsteht keine zweite Uebertragung und keine parallele Aggregation. Alle
 * Kennzahlen laufen nach Zahltag (§10) ueber die Analytics-Schicht.
 */
export function useStatisticsData(
  filter: StatisticsFilter = EMPTY_STATISTICS_FILTER,
): StatisticsData {
  const { payments, paymentsQuery, securitiesQuery } = useAnalyticsPayments();
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
    return buildPortfolioSeries(relevant);
  }, [snapshotsQuery.data, filter.securityId]);

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
  // Nur die drei Filterwerte entscheiden ueber das Objekt. Andere Parameter
  // (Matrixsicht, Verlaufsebene, Vergleichsauswahl) aendern die URL ebenfalls;
  // ein neues Filterobjekt liesse dann jede Auswertung neu rechnen.
  const year = searchParams.get("year");
  const security = searchParams.get("security");
  const depot = searchParams.get("depot");
  const filter = React.useMemo(
    () => statisticsFilterOf(year, security, depot),
    [year, security, depot],
  );

  const setFilter = React.useCallback(
    (next: StatisticsFilter) => {
      setSearchParams((prev) => applyStatisticsFilter(prev, next), { replace: false });
    },
    [setSearchParams],
  );

  return { filter, setFilter };
}

export type { StatisticsContext } from "./context";
