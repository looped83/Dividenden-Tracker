import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCalendarEvents,
  fetchCalendarSyncStatus,
  triggerCalendarSync,
} from "@/lib/supabase/repositories/calendarEvents";
import { mapCalendarEvent, type CalendarEvent } from "@/lib/calendar/types";

/**
 * Zentraler Query-Key-Namespace des Kalenders. Ein erfolgreicher Lauf
 * invalidiert `["calendar"]` und aktualisiert damit Termine und Statuszeile
 * gemeinsam.
 *
 * Bewusst getrennt von `["payments", …]`: Angekuendigte Termine und
 * tatsaechlich erhaltene Zahlungen sind zwei Datenarten und werden nicht
 * vermischt (Auftrag §18).
 */
export const CALENDAR_KEY = ["calendar"] as const;

/** Nach dieser Zeit gilt der Bestand als veraltet und wird erneuert. */
export const CALENDAR_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function useCalendarEvents() {
  return useQuery({
    queryKey: [...CALENDAR_KEY, "events"],
    queryFn: fetchCalendarEvents,
    select: (rows): CalendarEvent[] => rows.map(mapCalendarEvent),
  });
}

export function useCalendarSyncStatus() {
  return useQuery({
    queryKey: [...CALENDAR_KEY, "status"],
    queryFn: fetchCalendarSyncStatus,
  });
}

export function useSyncCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerCalendarSync,
    // Auch nach einem Fehlschlag: Die Statuszeile soll den Versuch zeigen, und
    // die vorhandenen Termine bleiben unveraendert stehen (Auftrag §13).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
    },
  });
}

/**
 * Einmal je Sitzung: Sind die Daten aelter als {@link CALENDAR_STALE_AFTER_MS}
 * — oder wurde nie synchronisiert —, stoesst das Oeffnen des Kalenders einen
 * serverseitigen Lauf an (Auftrag §6, Fallback-Logik).
 *
 * Der Merker steht auf Modulebene, nicht in einer Referenz der Komponente:
 * Sonst liefe bei jedem Wechsel zurueck in den Kalender erneut eine Anfrage.
 * Waehrend des Laufs bleiben die gespeicherten Termine sichtbar; ein Fehlschlag
 * wiederholt sich nicht von selbst, sondern erst auf Knopfdruck.
 */
let autoSyncAttempted = false;

/** Nur fuer Tests: setzt den Merker der automatischen Aktualisierung zurueck. */
export function resetAutoSyncForTests(): void {
  autoSyncAttempted = false;
}

export function useAutoCalendarSync(options: {
  lastSuccessAt: string | null | undefined;
  isStatusLoaded: boolean;
  isSyncing: boolean;
  sync: () => void;
}): void {
  const { lastSuccessAt, isStatusLoaded, isSyncing, sync } = options;

  React.useEffect(() => {
    if (!isStatusLoaded || isSyncing || autoSyncAttempted) return;

    const lastSuccess = lastSuccessAt ? new Date(lastSuccessAt).getTime() : 0;
    const isStale =
      !Number.isFinite(lastSuccess) || Date.now() - lastSuccess > CALENDAR_STALE_AFTER_MS;
    if (!isStale) return;

    autoSyncAttempted = true;
    sync();
  }, [isStatusLoaded, isSyncing, lastSuccessAt, sync]);
}
