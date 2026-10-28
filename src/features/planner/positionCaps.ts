import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  fetchPositionCaps,
  updatePositionCaps,
} from "@/lib/supabase/repositories/profiles";

/**
 * Positionsgrenze je Asset (CALCULATION_RULES.md §16, seit 2.22.0): Grenzen,
 * die vom Standard des Nachkaufs abweichen, als { Asset: Prozent } am Profil
 * (Migration 0043). Ein Asset ohne Eintrag folgt dem Standard.
 */

export type PositionCaps = ReadonlyMap<string, number>;

/**
 * Gewichtung für Assets ohne eigene: 0 % (seit 2.25.0; 2.24.0 1 %, zuvor
 * 8 %). Nachkauf und Lücken-Füller schlagen nur Assets vor, denen eine
 * Gewichtung gegeben ist — sie wird je Asset auf seiner Seite festgelegt.
 */
export const POSITION_CAP_DEFAULT = 0;

/**
 * Eigene Gewichtung je Asset in Prozent, auf eine Nachkommastelle (seit
 * 2.24.0; zuvor eine Auswahl ganzer Werte von 2 bis 50). Dazu 0 als bewusste
 * Angabe „nicht aufstocken" (seit 2.41.0): Sie bleibt gespeichert und ist so
 * von „nicht gesetzt" zu unterscheiden, wirkt im Nachkauf aber wie der Standard.
 */
export const POSITION_CAP_MIN = 0.5;
export const POSITION_CAP_MAX = 50;

/** Gültige eigene Gewichtung: 0 oder 0,5–50 (gelesen wird großzügig bis 100). */
export function isPositionCap(value: number): boolean {
  return value === 0 || (value >= POSITION_CAP_MIN && value <= POSITION_CAP_MAX);
}

const capSchema = z
  .number()
  .max(100)
  .refine((value) => value === 0 || value >= POSITION_CAP_MIN);

/** Liest die gespeicherten Grenzen; ungültige Einträge fallen weg. */
export function parsePositionCaps(raw: unknown): Map<string, number> {
  const caps = new Map<string, number>();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return caps;
  for (const [id, value] of Object.entries(raw)) {
    if (!z.guid().safeParse(id).success) continue;
    const parsed = capSchema.safeParse(value);
    if (parsed.success) caps.set(id, parsed.data);
  }
  return caps;
}

/** Leer wird `null` (wie Fixkosten und Sparpläne). */
export function toStoredPositionCaps(caps: PositionCaps): Record<string, number> | null {
  return caps.size === 0 ? null : Object.fromEntries(caps);
}

const POSITION_CAPS_KEY = ["position-caps"] as const;

export function usePositionCaps() {
  return useQuery({
    queryKey: POSITION_CAPS_KEY,
    queryFn: fetchPositionCaps,
    select: parsePositionCaps,
  });
}

/** Speichert alle eigenen Grenzen; ein Asset ohne Eintrag folgt dem Standard. */
export function useSavePositionCap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caps }: { caps: PositionCaps }) =>
      updatePositionCaps(toStoredPositionCaps(caps)),
    onMutate: ({ caps }) => {
      queryClient.setQueryData(POSITION_CAPS_KEY, toStoredPositionCaps(caps));
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: POSITION_CAPS_KEY }),
  });
}
