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

/** Wählbare Grenzen auf der Seite des Assets. */
export const POSITION_CAP_CHOICES = [
  2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50,
] as const;

const capSchema = z.number().int().min(1).max(100);

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
