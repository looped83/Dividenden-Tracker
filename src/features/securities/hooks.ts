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
import { fetchSecurityAliases } from "@/lib/supabase/repositories/imports";

const SECURITIES_KEY = ["securities"] as const;
const SECURITY_ALIASES_KEY = ["security-aliases"] as const;

export function useSecurities() {
  return useQuery({ queryKey: SECURITIES_KEY, queryFn: fetchSecurities });
}

/**
 * Beim Import bestaetigte Schreibweisen („Coca-Cola Company" meint das eigene
 * „Coca-Cola"). Sie gelten ueber den Import hinaus: Wer eine Schreibweise
 * einmal zugeordnet hat, soll sie nicht an jeder anderen Stelle erneut
 * erklaeren muessen.
 */
export function useSecurityAliases() {
  return useQuery({ queryKey: SECURITY_ALIASES_KEY, queryFn: fetchSecurityAliases });
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
