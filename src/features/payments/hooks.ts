import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archivePayment,
  createPayment,
  deletePayment,
  fetchAllPayments,
  fetchPaymentById,
  unarchivePayment,
  toListRow,
  updatePayment,
  type DividendPayment,
  type DividendPaymentInsert,
  type DividendPaymentUpdate,
  type PaymentListRow,
} from "@/lib/supabase/repositories/payments";
import {
  dismissDuplicate,
  fetchDuplicateDismissals,
  undismissDuplicate,
} from "@/lib/supabase/repositories/duplicateDismissals";
import {
  fetchAnomalyReviews,
  markAnomalyReviewed,
  unmarkAnomalyReviewed,
} from "@/lib/supabase/repositories/anomalyReviews";
import { anomalyKey, type AnomalyCode } from "@/lib/payments/dataQuality";

/**
 * Zentraler Query-Key-Namespace aller Zahlungsabfragen, sodass jede
 * datenverändernde Mutation über `invalidateQueries(["payments"])` Liste,
 * Detail, Dashboard und Statistik gemeinsam aktualisiert (§22).
 */
const PAYMENTS_KEY = ["payments"] as const;

/**
 * Die vollständige Historie — **ein** Cache-Eintrag für Liste,
 * Datenqualität und alle Auswertungen (`useDashboardPayments`).
 */
export const PAYMENT_HISTORY_KEY = [...PAYMENTS_KEY, "list"] as const;
const DUPLICATE_DISMISSALS_KEY = ["duplicate-dismissals"] as const;
const ANOMALY_REVIEWS_KEY = ["anomaly-reviews"] as const;

type QueryClient = ReturnType<typeof useQueryClient>;

/** Invalidiert alle von einer Zahlungsänderung betroffenen Caches (§22). */
function invalidateAll(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY });
  void queryClient.invalidateQueries({ queryKey: DUPLICATE_DISMISSALS_KEY });
}

/**
 * Schreibt eine geaenderte Zahlung direkt in die Caches, statt die ganze
 * Historie neu zu laden: Eine Korrektur oder ein Storno uebertrug sonst alle
 * Zeilen (bei 1.400 Zahlungen zwei Abrufe) — mobil spuerbar. Neu angelegte
 * Zahlungen laden weiter neu; dort ist die Position in der Sortierung Sache
 * des Servers.
 */
function patchPayment(queryClient: QueryClient, row: DividendPayment) {
  const listRow = toListRow(row);
  queryClient.setQueryData<PaymentListRow[]>(PAYMENT_HISTORY_KEY, (rows) =>
    rows?.map((existing) => (existing.id === row.id ? listRow : existing)),
  );
  queryClient.setQueryData([...PAYMENTS_KEY, "detail", row.id], row);
  void queryClient.invalidateQueries({ queryKey: DUPLICATE_DISMISSALS_KEY });
}

function removePayment(queryClient: QueryClient, id: string) {
  queryClient.setQueryData<PaymentListRow[]>(PAYMENT_HISTORY_KEY, (rows) =>
    rows?.filter((existing) => existing.id !== id),
  );
  queryClient.removeQueries({ queryKey: [...PAYMENTS_KEY, "detail", id] });
  // Pruefmarkierungen haengen per Kaskade an der Zahlung.
  void queryClient.invalidateQueries({ queryKey: ANOMALY_REVIEWS_KEY });
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

/** Je Depot die Assets, fuer die dort aktive (nicht stornierte) Dividenden gebucht sind. */
function securitiesByDepot(payments: PaymentListRow[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const payment of payments) {
    if (payment.archived_at || !payment.depot_id) continue;
    let set = result.get(payment.depot_id);
    if (!set) {
      set = new Set();
      result.set(payment.depot_id, set);
    }
    set.add(payment.security_id);
  }
  return result;
}

/**
 * Wo welches Asset gebucht ist (Depotfilter des Bestands). Derselbe
 * Cache-Eintrag wie die Historie; `enabled` haelt den Abruf aus, solange
 * niemand nach Depot filtert.
 */
export function useSecuritiesByDepot(enabled: boolean) {
  return useQuery({
    queryKey: PAYMENT_HISTORY_KEY,
    queryFn: fetchAllPayments,
    select: securitiesByDepot,
    enabled,
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
    onSuccess: (row) => {
      patchPayment(queryClient, row);
    },
  });
}

export function useArchivePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | undefined }) =>
      archivePayment(id, reason),
    onSuccess: (row) => {
      patchPayment(queryClient, row);
    },
  });
}

export function useUnarchivePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchivePayment(id),
    onSuccess: (row) => {
      patchPayment(queryClient, row);
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePayment(id),
    onSuccess: (_, id) => {
      removePayment(queryClient, id);
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

/** Als „geprüft, in Ordnung" markierte Auffälligkeiten (Schlüssel aus `anomalyKey`). */
export function useAnomalyReviews() {
  return useQuery({
    queryKey: ANOMALY_REVIEWS_KEY,
    queryFn: fetchAnomalyReviews,
  });
}

interface AnomalyRef {
  paymentId: string;
  code: AnomalyCode;
}

/**
 * Markiert eine Auffälligkeit als geprüft bzw. nimmt die Markierung zurück.
 *
 * Der Cache wird nach dem Erfolg direkt fortgeschrieben statt neu geladen: Die
 * Antwort des Servers bestätigt genau diese eine Änderung, ein erneutes Lesen
 * der ganzen Liste brächte nichts Neues.
 */
export function useReviewAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, code, reviewed }: AnomalyRef & { reviewed: boolean }) =>
      reviewed
        ? markAnomalyReviewed(paymentId, code)
        : unmarkAnomalyReviewed(paymentId, code),
    onSuccess: (_result, { paymentId, code, reviewed }) => {
      const key = anomalyKey(paymentId, code);
      queryClient.setQueryData<string[]>(ANOMALY_REVIEWS_KEY, (current = []) =>
        reviewed
          ? current.includes(key)
            ? current
            : [...current, key]
          : current.filter((entry) => entry !== key),
      );
    },
  });
}
