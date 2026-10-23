import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveDepot,
  createDepot,
  fetchDepots,
  unarchiveDepot,
  updateDepot,
  type DepotInsert,
  type DepotUpdate,
} from "@/lib/supabase/repositories/depots";

const DEPOTS_KEY = ["depots"] as const;

export function useDepots() {
  return useQuery({ queryKey: DEPOTS_KEY, queryFn: fetchDepots });
}

export function useCreateDepot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DepotInsert) => createDepot(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DEPOTS_KEY }),
  });
}

export function useUpdateDepot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DepotUpdate }) =>
      updateDepot(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DEPOTS_KEY }),
  });
}

export function useArchiveDepot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? unarchiveDepot(id) : archiveDepot(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DEPOTS_KEY }),
  });
}
