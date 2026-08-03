import * as React from "react";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";

export type CalendarViewMode = "month" | "agenda";

const STORAGE_KEY = "dividend-tracker:calendar-view";

function readStored(): CalendarViewMode | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "month" || stored === "agenda" ? stored : null;
}

/**
 * Gewaehlte Darstellung des Kalenders.
 *
 * Ohne eigene Wahl entscheidet die Breite: Auf dem Telefon ist die Liste die
 * bessere Ansicht — ein Monatsraster mit sieben Spalten laesst dort weder
 * Firmennamen noch Bedienelemente in brauchbarer Groesse zu (Auftrag §10).
 * Trifft der Nutzer eine Wahl, gilt sie ueberall und bleibt erhalten; es ist
 * eine reine Oberflaechen-Einstellung ohne Finanzdatenbezug und darf deshalb
 * in localStorage liegen (wie das Theme).
 */
export function useCalendarViewMode(): [
  CalendarViewMode,
  (next: CalendarViewMode) => void,
] {
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  const [stored, setStored] = React.useState<CalendarViewMode | null>(readStored);

  const setMode = React.useCallback((next: CalendarViewMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setStored(next);
  }, []);

  return [stored ?? (isWide ? "month" : "agenda"), setMode];
}
