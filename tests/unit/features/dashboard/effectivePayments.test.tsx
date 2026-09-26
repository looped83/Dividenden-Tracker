import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDashboardPayments, useEffectivePayments } from "@/features/dashboard/hooks";
import type { DashboardPaymentRow } from "@/lib/supabase/repositories/payments";

const ROWS: DashboardPaymentRow[] = [
  {
    id: "p1",
    pay_date: "2026-04-02",
    net_amount: "10.00",
    gross_amount: "12.00",
    security_id: "s1",
    depot_id: "d1",
    payment_type: "regular",
    source: "manual",
    created_at: "2026-04-02T10:00:00.000000+00:00",
  },
];

/**
 * Vorbefuellter Cache ohne Ablauf: Die Hooks lesen nur, es geht keine Anfrage
 * hinaus.
 */
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(["payments", "dashboard"], ROWS);
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

  it("wendet den Ausschuettungsplan an und bleibt ueber Renderzyklen stabil", () => {
    const { result, rerender } = renderHook(() => useEffectivePayments(), {
      wrapper: wrapper(),
    });
    const first = result.current.payments;
    // Zahlung am 2. April bei Quartalsplan zaehlt zum Maerz (§10).
    expect(first.map((payment) => payment.payDate)).toEqual(["2026-03-02"]);
    expect(first[0]?.actualPayDate).toBe("2026-04-02");
    rerender();
    expect(result.current.payments).toBe(first);
  });
});
