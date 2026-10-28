import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { MoneyDecimal, type DecimalInstance } from "@/lib/money";
import { useSecuritySnapshots } from "@/features/securities/hooks";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
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
 * Gewichtung gegeben ist — sie wird je Asset unter „Bearbeiten" festgelegt.
 */
export const POSITION_CAP_DEFAULT = 0;

/**
 * Eigene Gewichtung je Asset in Prozent, auf eine Nachkommastelle (seit
 * 2.24.0; zuvor eine Auswahl ganzer Werte von 2 bis 50). Dazu 0 als bewusste
 * Angabe „nicht aufstocken" (seit 2.42.0): Sie bleibt gespeichert und ist so
 * von „nicht gesetzt" zu unterscheiden, wirkt im Nachkauf aber wie der Standard.
 */
const POSITION_CAP_MIN = 0.5;
const POSITION_CAP_MAX = 50;

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

/**
 * Anteil des Assets am Marktwert des jüngsten Depotstands in Prozent; `null`,
 * wenn es darin nicht vorkommt. Neben der Zielgewichtung auf der Asset-Seite
 * und im Formular „Asset bearbeiten".
 */
export function useDepotShare(securityId: string | undefined): DecimalInstance | null {
  const { data: snapshots = [] } = useSecuritySnapshots();
  return React.useMemo(() => {
    if (securityId === undefined) return null;
    let total = new MoneyDecimal(0);
    let own: DecimalInstance | null = null;
    for (const row of snapshotsAt(snapshots, latestAsOf(snapshots))) {
      if (row.market_value === null) continue;
      const value = new MoneyDecimal(row.market_value);
      total = total.plus(value);
      if (row.security_id === securityId) own = value;
    }
    return own && total.greaterThan(0) ? own.dividedBy(total).times(100) : null;
  }, [snapshots, securityId]);
}
