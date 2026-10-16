import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  commitImport,
  discardImport,
  fetchImports,
  rollbackImport,
  type Import,
} from "@/lib/supabase/repositories/imports";
import type { CommitPayload } from "@/lib/import/buildCommitPayload";

const IMPORTS_KEY = ["imports"] as const;

export function useImports() {
  return useQuery({ queryKey: IMPORTS_KEY, queryFn: fetchImports });
}

/**
 * Invalidiert nach einem Import/Rollback alle betroffenen Datenquellen, damit
 * Zahlungen, Wertpapiere, Depots und Statistiken sofort konsistent sind.
 */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      ["imports"],
      ["payments"],
      ["securities"],
      ["depots"],
      ["statistics"],
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useCommitImport() {
  const invalidate = useInvalidateAll();
  return useMutation<Import, Error, { importId: string; payload: CommitPayload }>({
    mutationFn: ({ importId, payload }) => commitImport(importId, payload),
    onSuccess: invalidate,
  });
}

export function useRollbackImport() {
  const invalidate = useInvalidateAll();
  return useMutation<Import, Error, string>({
    mutationFn: (importId) => rollbackImport(importId),
    onSuccess: invalidate,
  });
}

/**
 * Loescht einen nicht abgeschlossenen Import-Entwurf. Er traegt keine
 * Zahlungen, deshalb betrifft das nur die Importuebersicht.
 */
export function useDiscardImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (importId: string) => discardImport(importId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: IMPORTS_KEY }),
  });
}
