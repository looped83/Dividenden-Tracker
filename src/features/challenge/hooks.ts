import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseChallenge, toStoredChallenge, type Challenge } from "@/lib/challenge";
import {
  fetchSportChallenge,
  updateSportChallenge,
} from "@/lib/supabase/repositories/profiles";

const CHALLENGE_KEY = ["sport-challenge"] as const;

export function useChallenge() {
  return useQuery({
    queryKey: CHALLENGE_KEY,
    queryFn: fetchSportChallenge,
    select: parseChallenge,
  });
}

/**
 * Speichert die ganze Challenge (`null` beendet sie). Der Cache folgt sofort,
 * damit ein Tipp ohne Umlauf sichtbar wird; schlägt das Speichern fehl, lädt
 * die Abfrage neu.
 */
export function useSaveChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (challenge: Challenge | null) =>
      updateSportChallenge(toStoredChallenge(challenge)),
    onMutate: (challenge) => {
      queryClient.setQueryData(CHALLENGE_KEY, toStoredChallenge(challenge));
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: CHALLENGE_KEY }),
  });
}
