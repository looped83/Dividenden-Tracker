import * as React from "react";
import { isoFromRef, refDateFromDate, type RefDate } from "@/lib/statistics/dates";

/** Der heutige lokale Kalendertag als „YYYY-MM-DD" — ein vergleichbarer Schnappschuss. */
function todayIso(): string {
  return isoFromRef(refDateFromDate());
}

/**
 * Meldet, wann sich der Kalendertag geaendert haben koennte: wenn die App
 * wieder in den Vordergrund kommt — ein Zeitgeber laeuft im Hintergrund auf
 * dem iPhone nicht weiter — und um Mitternacht, falls sie sichtbar bleibt.
 */
function subscribe(onChange: () => void): () => void {
  let timer: number | undefined;
  const scheduleMidnight = () => {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = window.setTimeout(
      () => {
        onChange();
        scheduleMidnight();
      },
      // Eine Sekunde Puffer: Ein Zeitgeber darf frueher feuern als verlangt.
      nextDay.getTime() - now.getTime() + 1000,
    );
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") onChange();
  };

  scheduleMidnight();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * Der heutige Kalendertag, der mit der Uhr Schritt haelt.
 *
 * Zuvor rechnete jede Seite „heute" einmal beim Aufbau aus. Eine installierte
 * App bleibt auf dem iPhone aber oft tagelang im Speicher: Am Morgen nach
 * einem Monatswechsel zeigte die Uebersicht noch die Kachel des Vormonats,
 * bis man die Seite wechselte.
 *
 * Gelesen ueber `useSyncExternalStore` wie `useMediaQuery`: Der Schnappschuss
 * ist ein String, neu gezeichnet wird also nur, wenn der Tag wirklich
 * wechselt.
 */
export function useToday(): RefDate {
  const iso = React.useSyncExternalStore(subscribe, todayIso, todayIso);
  return React.useMemo(
    () => ({
      year: Number.parseInt(iso.slice(0, 4), 10),
      month: Number.parseInt(iso.slice(5, 7), 10),
      day: Number.parseInt(iso.slice(8, 10), 10),
    }),
    [iso],
  );
}
