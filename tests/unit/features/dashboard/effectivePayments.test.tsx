import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDashboardPayments, useEffectivePayments } from "@/features/dashboard/hooks";
import { useAllPayments } from "@/features/payments/hooks";
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";

const ACTIVE: PaymentListRow = {
  id: "p1",
  pay_date: "2026-04-02",
  net_amount: "10.00",
  gross_amount: "12.00",
  original_currency: "EUR",
  security_id: "s1",
  depot_id: "d1",
  payment_type: "regular",
  source: "manual",
  import_id: null,
  archived_at: null,
  created_at: "2026-04-02T10:00:00.000000+00:00",
  updated_at: "2026-04-02T10:00:00.000000+00:00",
};

const CANCELLED: PaymentListRow = {
  ...ACTIVE,
  id: "p2",
  net_amount: "999.00",
  archived_at: "2026-04-03T10:00:00.000000+00:00",
};

const ROWS = [ACTIVE, CANCELLED];

/**
 * Vorbefuellter Cache ohne Ablauf: Die Hooks lesen nur, es geht keine Anfrage
 * hinaus.
 */
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(["payments", "list"], ROWS);
  client.setQueryData(
    ["securities"],
    [{ id: "s1", name: "Alpha", archived_at: null, payout_months: [3, 6, 9, 12] }],
  );
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("Datenbasis der Auswertungen", () => {
  it("parst die Historie nicht bei jedem Rendern neu", () => {
    const { result, rerender } = renderHook(() => useDashboardPayments(), {
      wrapper: wrapper(),
    });
    const first = result.current.data;
    rerender();
    // Dieselbe Referenz: Nachgelagerte `useMemo`-Auswertungen bleiben gueltig.
    expect(first).toBeDefined();
    expect(result.current.data).toBe(first);
  });

  it("teilt den Abruf mit der Eingangsliste und zaehlt nur aktive Eingaenge", () => {
    const { result } = renderHook(
      () => ({ list: useAllPayments(), analytics: useDashboardPayments() }),
      { wrapper: wrapper() },
    );
    // Die Liste sieht auch die stornierte Zeile, die Auswertungen nicht —
    // aus demselben Cache-Eintrag, ohne zweite Abfrage.
    expect(result.current.list.data?.map((row) => row.id)).toEqual(["p1", "p2"]);
    expect(result.current.analytics.data?.map((payment) => payment.id)).toEqual(["p1"]);
  });

  it("wendet den Ausschuettungsplan an und bleibt ueber Renderzyklen stabil", () => {
    const { result, rerender } = renderHook(() => useEffectivePayments(), {
      wrapper: wrapper(),
    });
    const first = result.current.payments;
    // Zahlung am 2. April bei Quartalsplan zaehlt zum Maerz (§10).
    expect(first.map((payment) => payment.payDate)).toEqual(["2026-03-31"]);
    expect(first[0]?.actualPayDate).toBe("2026-04-02");
    rerender();
    expect(result.current.payments).toBe(first);
  });
});
