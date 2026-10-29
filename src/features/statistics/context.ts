import { useOutletContext } from "react-router";
import type { AnalyticsPayment, StatisticsFilter } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";

/**
 * Kontext, den die Statistik-Layoutseite an alle Unterbereiche weitergibt:
 * bereits **gefilterte** Zahlungen (einmal berechnet) plus Namensaufloesung und
 * der aktive Filter. So aggregiert jede Unterseite dieselbe Datenbasis, ohne die
 * Query erneut auszufuehren.
 *
 * Bewusst frei von Supabase-/Query-Abhaengigkeiten, damit die Unterbereiche
 * (und ihre Tests) ohne Datenzugriffsschicht gerendert werden koennen.
 */
export interface StatisticsContext {
  /** Auf den aktiven Filter reduzierte Zahlungen. */
  payments: AnalyticsPayment[];
  /** Alle aktiven Zahlungen (ungefiltert) — z. B. fuer Filteroptionen. */
  allPayments: AnalyticsPayment[];
  securities: Map<string, EntityInfo>;
  depots: Map<string, EntityInfo>;
  filter: StatisticsFilter;
}

export function useStatisticsContext(): StatisticsContext {
  return useOutletContext<StatisticsContext>();
}
