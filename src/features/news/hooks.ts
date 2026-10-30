import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNewsItems,
  fetchNewsSyncStatus,
  triggerNewsSync,
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NEWS_KEY });
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
