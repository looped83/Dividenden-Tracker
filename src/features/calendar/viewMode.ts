import * as React from "react";

export type CalendarViewMode = "month" | "agenda";

const STORAGE_KEY = "dividend-tracker:calendar-view";

function readStored(): CalendarViewMode | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "month" || stored === "agenda" ? stored : null;
}

/**
 * Gewaehlte Darstellung des Kalenders.
 *
 * Standard ist die **Liste**, auf jeder Bildschirmbreite. Sie beantwortet die
 * Frage, mit der man den Kalender oeffnet — „was kommt als Naechstes" —
 * unmittelbar und in der Reihenfolge der Zeit. Das Monatsraster beantwortet
 * eine andere Frage („wie verteilt sich der Monat") und ist dafuer einen Klick
 * entfernt.
 *
 * Zuvor entschied die Bildschirmbreite. Das hiess: derselbe Nutzer sah auf dem
 * Telefon etwas anderes als am Schreibtisch, ohne je etwas gewaehlt zu haben.
 *
 * Trifft der Nutzer eine Wahl, gilt sie ueberall und bleibt erhalten; es ist
 * eine reine Oberflaechen-Einstellung ohne Finanzdatenbezug und darf deshalb in
 * localStorage liegen (wie das Theme).
 */
export function useCalendarViewMode(): [
  CalendarViewMode,
  (next: CalendarViewMode) => void,
] {
  const [stored, setStored] = React.useState<CalendarViewMode | null>(readStored);

  const setMode = React.useCallback((next: CalendarViewMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setStored(next);
  }, []);

  return [stored ?? "agenda", setMode];
}
