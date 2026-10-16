import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Bearbeiten, Stornieren und Löschen schreiben die geänderte Zahlung direkt in
 * den Cache der Historie, statt sie komplett neu zu laden.
 */
const repo = vi.hoisted(() => ({
  fetchAllPayments: vi.fn(),
  updatePayment: vi.fn(),
  archivePayment: vi.fn(),
  deletePayment: vi.fn(),
}));

vi.mock("@/lib/supabase/repositories/payments", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...repo,
}));

const { PAYMENT_HISTORY_KEY, useArchivePayment, useDeletePayment, useUpdatePayment } =
  await import("@/features/payments/hooks");

const row = (id: string, net: string, archived: string | null = null) => ({
  id,
  security_id: "s1",
  depot_id: "d1",
  pay_date: "2026-03-10",
  net_amount: net,
  gross_amount: null,
  original_currency: null,
  payment_type: "regular",
  source: "manual",
  import_id: null,
  archived_at: archived,
  created_at: "2026-03-10T10:00:00Z",
  updated_at: "2026-03-10T10:00:00Z",
});

function setup() {
  const client = new QueryClient();
  client.setQueryData(PAYMENT_HISTORY_KEY, [row("p1", "3.00"), row("p2", "5.00")]);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}

const history = (client: QueryClient) =>
  client.getQueryData<ReturnType<typeof row>[]>(PAYMENT_HISTORY_KEY);

describe("Zahlungs-Mutationen", () => {
  it("trägt eine Korrektur ein, ohne die Historie neu zu laden", async () => {
    const { client, invalidate, wrapper } = setup();
    repo.updatePayment.mockResolvedValue({ ...row("p1", "4.00"), note: null });
    const { result } = renderHook(() => useUpdatePayment(), { wrapper });

    await act(() =>
      result.current.mutateAsync({ id: "p1", input: { net_amount: "4.00" } }),
    );

    expect(history(client)?.map((r) => r.net_amount)).toEqual(["4.00", "5.00"]);
    // Die Projektion bleibt die der Liste: kein `note` im Cache der Historie.
    expect(history(client)?.[0]).not.toHaveProperty("note");
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["payments"] });
  });

  it("trägt einen Storno ein", async () => {
    const { client, wrapper } = setup();
    repo.archivePayment.mockResolvedValue(row("p2", "5.00", "2026-04-01T00:00:00Z"));
    const { result } = renderHook(() => useArchivePayment(), { wrapper });

    await act(() => result.current.mutateAsync({ id: "p2" }));

    expect(history(client)?.[1]?.archived_at).toBe("2026-04-01T00:00:00Z");
  });

  it("entfernt eine gelöschte Zahlung", async () => {
    const { client, wrapper } = setup();
    repo.deletePayment.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeletePayment(), { wrapper });

    await act(() => result.current.mutateAsync("p1"));

    expect(history(client)?.map((r) => r.id)).toEqual(["p2"]);
  });
});
