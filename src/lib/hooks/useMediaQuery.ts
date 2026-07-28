import * as React from "react";

/**
 * Beobachtet eine Media Query. Der Treffer ist ein extern veraenderlicher Wert
 * (Browser-API) und wird deshalb ueber `useSyncExternalStore` gelesen, statt in
 * einem Effect per setState nachgezogen zu werden — dieselbe Herangehensweise
 * wie beim System-Theme.
 *
 * Gedacht fuer Faelle, in denen sich zwei Darstellungen gegenseitig
 * ausschliessen und beide im DOM zu haben etwas kostet (doppelte Zeilen,
 * doppelte Objekte). Rein optische Unterschiede gehoeren weiterhin in CSS.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => {
        media.removeEventListener("change", onChange);
      };
    },
    [query],
  );

  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query]);

  // Ohne Browser (Tests, Vorab-Rendern) gilt die schmale Darstellung.
  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Tailwind-Haltepunkt `md` (>= 768px) — Tabelle statt Karten. */
export const MD_BREAKPOINT_QUERY = "(min-width: 768px)";
