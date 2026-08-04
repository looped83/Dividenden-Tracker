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
import {
  deleteSnapshotRun,
  fetchSecuritySnapshots,
  fetchSnapshotRuns,
  importSnapshotRun,
  type SnapshotImportInput,
} from "@/lib/supabase/repositories/securitySnapshots";

const SECURITIES_KEY = ["securities"] as const;
const SECURITY_ALIASES_KEY = ["security-aliases"] as const;
const SNAPSHOTS_KEY = ["security-snapshots"] as const;
const SNAPSHOT_RUNS_KEY = ["security-snapshot-runs"] as const;

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

/**
 * Depotstaende aus dem Portfolio-Export (docs/PORTFOLIO_IMPORT.md).
 *
 * Eine Abfrage fuer alle Stichtage: Unternehmensliste, Detailseite und
 * Statistik lesen denselben Bestand, sodass ihre Zahlen zwangslaeufig
 * uebereinstimmen statt nur zufaellig — dieselbe Ueberlegung wie bei
 * `useStatisticsData` (ARCHITECTURE.md §4.5).
 */
export function useSecuritySnapshots() {
  return useQuery({ queryKey: SNAPSHOTS_KEY, queryFn: fetchSecuritySnapshots });
}

/** Die Uploads selbst — fuer die Standsverwaltung. */
export function useSnapshotRuns() {
  return useQuery({ queryKey: SNAPSHOT_RUNS_KEY, queryFn: fetchSnapshotRuns });
}

/**
 * Der Import beruehrt auch `securities` (uebernommene Stammdaten) und
 * ueberlappt mit den Zahlungsauswertungen, die Unternehmensnamen anzeigen —
 * deshalb werden alle betroffenen Abfragen ungueltig, nicht nur die Staende.
 */
function invalidateSnapshotQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: SNAPSHOTS_KEY });
  void queryClient.invalidateQueries({ queryKey: SNAPSHOT_RUNS_KEY });
  void queryClient.invalidateQueries({ queryKey: SECURITIES_KEY });
}

export function useImportSnapshotRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SnapshotImportInput) => importSnapshotRun(input),
    onSuccess: () => {
      invalidateSnapshotQueries(queryClient);
    },
  });
}

export function useDeleteSnapshotRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asOf: string) => deleteSnapshotRun(asOf),
    onSuccess: () => {
      invalidateSnapshotQueries(queryClient);
    },
  });
}
