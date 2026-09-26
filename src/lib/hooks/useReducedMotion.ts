import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

/**
 * `prefers-reduced-motion: reduce` als React-Zustand.
 *
 * Die Diagramme schalten damit ihre Einblendanimation ab
 * (UX_AND_DESIGN_SYSTEM.md §1: „`prefers-reduced-motion` schaltet alles ab").
 * Gelesen ueber `useMediaQuery` (`useSyncExternalStore`): Der Wert stimmt schon
 * beim ersten Rendern. Zuvor zog ein Effect ihn nach — ein zweites Rendern je
 * Diagramm, und das erste lief mit Animation an, bevor sie abgeschaltet wurde.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
