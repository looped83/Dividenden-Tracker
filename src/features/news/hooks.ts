import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSecurities, useSecuritySnapshots } from "@/features/securities/hooks";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import { fetchGdeltNews, type GdeltSecurity } from "@/lib/news/gdelt";
import {
  fetchNewsItems,
  fetchNewsSyncStatus,
  triggerNewsSync,
  type NewsItemRow,
} from "@/lib/supabase/repositories/news";

const NEWS_KEY = ["news"] as const;

/**
 * Wie beim Kalender (`useAutoCalendarSync`): Nach dieser Zeit stoesst das
 * Oeffnen einen Abruf an. Dieselben 12 Stunden prueft der Server
 * (`claim_news_sync`) — der Client fragt also nicht vergeblich an.
 */
const NEWS_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function useNewsItems() {
  return useQuery({ queryKey: [...NEWS_KEY, "items"], queryFn: fetchNewsItems });
}

export function useNewsSyncStatus() {
  return useQuery({ queryKey: [...NEWS_KEY, "status"], queryFn: fetchNewsSyncStatus });
}

/**
 * Einmal je Sitzung, und nur wenn der letzte Abruf veraltet ist. Ohne Besuch
 * im Bereich fragt die App keine Quelle an — ein Zeitplan auf dem Server
 * holte auch dann Meldungen, wenn sie niemand liest.
 */
let autoSyncAttempted = false;

export function useAutoNewsSync(): { isSyncing: boolean; isError: boolean } {
  const queryClient = useQueryClient();
  const status = useNewsSyncStatus();
  const { mutate, isPending, isError } = useMutation({
    mutationFn: triggerNewsSync,
    // Nur die gespeicherten Meldungen: GDELT fragt der Browser selbst und
    // höchstens alle fünf Sekunden (useGdeltNews).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [...NEWS_KEY, "items"] });
      void queryClient.invalidateQueries({ queryKey: [...NEWS_KEY, "status"] });
    },
  });
  const lastSuccessAt = status.data?.last_success_at;

  React.useEffect(() => {
    if (!status.isSuccess || autoSyncAttempted) return;
    const lastSuccess = lastSuccessAt ? Date.parse(lastSuccessAt) : 0;
    if (Number.isFinite(lastSuccess) && Date.now() - lastSuccess <= NEWS_STALE_AFTER_MS)
      return;
    autoSyncAttempted = true;
    mutate();
  }, [status.isSuccess, lastSuccessAt, mutate]);

  return { isSyncing: isPending, isError };
}

/** Innerhalb dieser Zeit fragt die Seite GDELT nicht erneut. */
const GDELT_STALE_MS = 60 * 60 * 1000;

/**
 * Assets im jüngsten Depotstand ohne gespeicherte Marketaux-Meldung — für sie
 * sucht der Browser bei GDELT (`lib/news/gdelt.ts`). `undefined`, solange
 * etwas davon noch lädt.
 */
function useGdeltCandidates(
  stored: readonly NewsItemRow[] | undefined,
): GdeltSecurity[] | undefined {
  const securities = useSecurities().data;
  const snapshots = useSecuritySnapshots().data;
  return React.useMemo(() => {
    if (!stored || !securities || !snapshots) return undefined;
    const covered = new Set(
      stored.filter((row) => row.provider === "marketaux").map((row) => row.security_id),
    );
    const held = new Set(
      snapshotsAt(snapshots, latestAsOf(snapshots))
        .filter((row) => Number.parseFloat(row.quantity) > 0)
        .map((row) => row.security_id),
    );
    return securities
      .filter(
        (security) =>
          held.has(security.id) && !covered.has(security.id) && !security.archived_at,
      )
      .map(({ id, name, ticker }) => ({ id, name, ticker }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [stored, securities, snapshots]);
}

/**
 * Ergänzende Meldungen von GDELT, direkt aus dem Browser und ohne Speichern.
 * Ein Fehler bleibt still: Die gespeicherten Meldungen stehen trotzdem da.
 */
export function useGdeltNews(stored: readonly NewsItemRow[] | undefined) {
  const candidates = useGdeltCandidates(stored);
  return useQuery({
    queryKey: [...NEWS_KEY, "gdelt", candidates?.map((security) => security.id)],
    queryFn: ({ signal }) => fetchGdeltNews(candidates ?? [], { signal }),
    enabled: candidates !== undefined && candidates.length > 0,
    staleTime: GDELT_STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
