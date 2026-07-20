import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveSecurity,
  createSecurity,
  deleteSecurity,
  fetchSecurities,
  unarchiveSecurity,
  updateSecurity,
  type SecurityInsert,
  type SecurityUpdate,
} from "@/lib/supabase/repositories/securities";

const SECURITIES_KEY = ["securities"] as const;

export function useSecurities() {
  return useQuery({ queryKey: SECURITIES_KEY, queryFn: fetchSecurities });
}

export function useCreateSecurity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SecurityInsert) => createSecurity(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SECURITIES_KEY }),
  });
}

export function useUpdateSecurity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SecurityUpdate }) =>
      updateSecurity(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SECURITIES_KEY }),
  });
}

export function useArchiveSecurity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? unarchiveSecurity(id) : archiveSecurity(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SECURITIES_KEY }),
  });
}

export function useDeleteSecurity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSecurity(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SECURITIES_KEY }),
  });
}
