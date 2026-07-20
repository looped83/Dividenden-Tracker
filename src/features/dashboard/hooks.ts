import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  fetchDashboardPayments,
  type DashboardPaymentRow,
} from "@/lib/supabase/repositories/payments";
import {
  mapAnalyticsPayment,
  type AnalyticsPayment,
  type YearSelection,
} from "@/lib/statistics";
import { parseYearSelection, serializeYearSelection } from "./yearParam";

/**
 * Schluessel unter dem `payments`-Namespace: dadurch invalidieren alle
 * bestehenden Zahlungs-Mutationen (Anlegen, Bearbeiten, Storno, Reaktivierung)
 * sowie Import-Commit/-Rollback ueber `invalidateQueries(["payments"])` auch die
 * Dashboard-Daten (ARCHITECTURE.md, Cache-Invalidierung 5A).
 */
const DASHBOARD_PAYMENTS_KEY = ["payments", "dashboard"] as const;

/**
 * Laedt die aktive Dividendenhistorie **einmal** und liefert sie als bereits
 * geparste, decimal-sichere Analytics-Datensaetze. Die Jahresauswahl wird
 * ausschliesslich clientseitig angewandt, sodass ein Jahreswechsel keine neue
 * Abfrage ausloest (schnelle Jahresumschaltung, §18).
 */
export function useDashboardPayments() {
  return useQuery<DashboardPaymentRow[], Error, AnalyticsPayment[]>({
    queryKey: DASHBOARD_PAYMENTS_KEY,
    queryFn: fetchDashboardPayments,
    select: (rows) => rows.map(mapAnalyticsPayment),
  });
}

/**
 * Jahresauswahl als URL-Zustand (§3): steuerbar ueber `?year=`, bleibt nach
 * Reload erhalten und funktioniert mit Browser-Zurueck/-Vorwaerts (Push-Historie).
 */
export function useDashboardYear(): {
  selection: YearSelection;
  setSelection: (next: YearSelection) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = parseYearSelection(searchParams.get("year"));

  const setSelection = React.useCallback(
    (next: YearSelection) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("year", serializeYearSelection(next));
          return params;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  return { selection, setSelection };
}
