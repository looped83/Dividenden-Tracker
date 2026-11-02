import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  parseChallenge,
  parseChallengeData,
  replaceCurrent,
  toStoredChallengeData,
  type Challenge,
} from "@/lib/challenge";
import {
  fetchSportChallenge,
  updateSportChallenge,
} from "@/lib/supabase/repositories/profiles";

const CHALLENGE_KEY = ["sport-challenge"] as const;

/** Die laufende (oder zuletzt beendete) Challenge. */
export function useChallenge() {
  return useQuery({
    queryKey: CHALLENGE_KEY,
    queryFn: fetchSportChallenge,
    select: parseChallenge,
  });
}

/** Challenge samt Bonus-Konto (frühere Monate mit investiertem Bonus). */
export function useChallengeData() {
  return useQuery({
    queryKey: CHALLENGE_KEY,
    queryFn: fetchSportChallenge,
    select: parseChallengeData,
  });
}

/**
 * Speichert die laufende Challenge (`null` beendet sie); das Bonus-Konto
 * führt {@link replaceCurrent} nach. Gerechnet wird auf dem jüngsten Stand
 * im Cache, damit schnelle Tipps hintereinander nichts überschreiben. Der
 * Cache folgt sofort; schlägt das Speichern fehl, lädt die Abfrage neu.
 */
export function useSaveChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (next: Challenge | null) => {
      const previous = parseChallengeData(queryClient.getQueryData(CHALLENGE_KEY));
      const stored = toStoredChallengeData(replaceCurrent(previous, next));
      queryClient.setQueryData(CHALLENGE_KEY, stored);
      return updateSportChallenge(stored);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: CHALLENGE_KEY }),
  });
}
