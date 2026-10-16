/**
 * TanStack Query Client
 *
 * Singleton instance used for cache invalidation and mutation operations
 * throughout the application.
 */

import { QueryClient } from "@tanstack/react-query";

/**
 * Einmal wiederholen — ausser bei „nicht gefunden" (PostgREST `PGRST116`):
 * Ein geloeschter Eingang taucht auch beim zweiten Versuch nicht auf. Die
 * Wiederholung kostete eine Anfrage und verzoegerte die Meldung „nicht
 * gefunden" um eine Sekunde — etwa direkt nach dem Loeschen oder bei einem
 * alten Link.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const notFound =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST116";
  return !notFound && failureCount < 1;
}

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
      retry: shouldRetry,
    },
  },
});
