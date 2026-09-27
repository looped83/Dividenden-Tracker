import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archivePayment,
  createPayment,
  deletePayment,
  fetchAllPayments,
  fetchPaymentById,
  unarchivePayment,
  updatePayment,
  type DividendPaymentInsert,
  type DividendPaymentUpdate,
} from "@/lib/supabase/repositories/payments";
import {
  dismissDuplicate,
  fetchDuplicateDismissals,
  undismissDuplicate,
} from "@/lib/supabase/repositories/duplicateDismissals";

/**
 * Zentraler Query-Key-Namespace aller Zahlungsabfragen, sodass jede
 * datenverändernde Mutation über `invalidateQueries(["payments"])` Liste,
 * Detail, Dashboard und Statistik gemeinsam aktualisiert (§22).
 */
export const PAYMENTS_KEY = ["payments"] as const;

/**
 * Die vollständige Historie — **ein** Cache-Eintrag für Liste,
 * Datenqualität und alle Auswertungen (`useDashboardPayments`).
 */
export const PAYMENT_HISTORY_KEY = [...PAYMENTS_KEY, "list"] as const;
export const DUPLICATE_DISMISSALS_KEY = ["duplicate-dismissals"] as const;

/** Invalidiert alle von einer Zahlungsänderung betroffenen Caches (§22). */
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
  void queryClient.invalidateQueries({ queryKey: DUPLICATE_DISMISSALS_KEY });
}

/**
 * Vollstaendige Historie, stornierte eingeschlossen — derselbe Cache-Eintrag
 * wie die Auswertungen. Status-, Zeitraumfilter und Sortierung erfolgen
 * clientseitig ueber den effektiven Monat.
 */
export function useAllPayments() {
  return useQuery({
    queryKey: PAYMENT_HISTORY_KEY,
    queryFn: fetchAllPayments,
  });
}

export function usePayment(id: string | undefined) {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, "detail", id],
    queryFn: () => fetchPaymentById(id ?? ""),
    enabled: Boolean(id),
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DividendPaymentInsert) => createPayment(input),
    onSuccess: () => {
      invalidateAll(queryClient);
    },
  });
}

export function useUpdatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
      expectedUpdatedAt,
    }: {
      id: string;
      input: DividendPaymentUpdate;
      expectedUpdatedAt?: string;
    }) => updatePayment(id, input, expectedUpdatedAt),
    onSuccess: () => {
      invalidateAll(queryClient);
    },
  });
}

export function useArchivePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | undefined }) =>
      archivePayment(id, reason),
    onSuccess: () => {
      invalidateAll(queryClient);
    },
  });
}

export function useUnarchivePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchivePayment(id),
    onSuccess: () => {
      invalidateAll(queryClient);
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePayment(id),
    onSuccess: () => {
      invalidateAll(queryClient);
    },
  });
}

export function useDuplicateDismissals() {
  return useQuery({
    queryKey: DUPLICATE_DISMISSALS_KEY,
    queryFn: fetchDuplicateDismissals,
  });
}

export function useDismissDuplicate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idA, idB }: { idA: string; idB: string }) =>
      dismissDuplicate(idA, idB),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: DUPLICATE_DISMISSALS_KEY }),
  });
}

/** Nimmt eine „keine Dublette"-Markierung zurueck (Datenqualitaet). */
export function useUndismissDuplicate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idA, idB }: { idA: string; idB: string }) =>
      undismissDuplicate(idA, idB),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: DUPLICATE_DISMISSALS_KEY }),
  });
}
