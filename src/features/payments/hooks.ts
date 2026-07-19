import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archivePayment,
  createPayment,
  fetchPaymentById,
  fetchPayments,
  unarchivePayment,
  updatePayment,
  type DividendPaymentInsert,
  type DividendPaymentUpdate,
  type PaymentFilters,
} from "@/lib/supabase/repositories/payments";

const PAYMENTS_KEY = ["payments"] as const;

export function usePayments(filters: PaymentFilters) {
  return useQuery({
    queryKey: [...PAYMENTS_KEY, filters],
    queryFn: () => fetchPayments(filters),
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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY }),
  });
}

export function useUpdatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DividendPaymentUpdate }) =>
      updatePayment(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY }),
  });
}

export function useArchivePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | undefined }) =>
      archivePayment(id, reason),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY }),
  });
}

export function useUnarchivePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchivePayment(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY }),
  });
}
