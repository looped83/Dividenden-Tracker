/**
 * TanStack Query Client
 *
 * Singleton instance used for cache invalidation and mutation operations
 * throughout the application.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Fuenf Minuten statt dreissig Sekunden: Liste, Uebersicht und Statistik
      // laden jeweils die gesamte Historie (DECISIONS.md ADR-001). Mit der
      // kurzen Frist holte schon ein Wechsel zwischen zwei Bereichen alles
      // erneut. Aktualitaet leidet nicht — jede Mutation invalidiert gezielt
      // (ARCHITECTURE.md "Cache-Invalidierung").
      staleTime: 5 * 60_000,
      // Kein erneutes Laden, nur weil das Fenster wieder den Fokus hat: Auf dem
      // iPhone passiert das bei jedem Zurueckholen der App und zog die
      // vollstaendige Historie ueber die Mobilverbindung. Nach einem
      // Verbindungsabbruch wird weiterhin nachgeladen (`refetchOnReconnect`
      // bleibt an), und beim Navigieren greift die Frist oben.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
