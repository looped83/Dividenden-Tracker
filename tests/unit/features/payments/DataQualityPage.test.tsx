import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@/components/ui/toast";
import { pairKey } from "@/lib/payments/dataQuality";
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";

/**
 * „Keine Dublette" ist keine Einbahnstrasse: Markierte Paare stehen eingeklappt
 * unter den offenen und lassen sich zuruecknehmen.
 */
const markiert = vi.hoisted(() => ({ current: [] as string[] }));
const zuruecknehmen = vi.hoisted(() => vi.fn());

vi.mock("@/features/payments/hooks", () => ({
  useAllPayments: () => ({ data: zahlungen, isLoading: false }),
  useDuplicateDismissals: () => ({ data: markiert.current }),
  useDismissDuplicate: () => ({ mutate: vi.fn() }),
  useUndismissDuplicate: () => ({ mutate: zuruecknehmen, isPending: false }),
  useArchivePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({ data: [{ id: "s1", name: "Apple Inc.", archived_at: null }] }),
}));
vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({
    data: [{ id: "d1", name: "Depot A", base_currency: "EUR", archived_at: null }],
  }),
}));

function zahlung(id: string): PaymentListRow {
  return {
    id,
    security_id: "s1",
    depot_id: "d1",
    pay_date: "2026-03-10",
    net_amount: "50.00",
    gross_amount: "50.00",
    original_currency: "EUR",
    payment_type: "regular",
    source: "manual",
    import_id: null,
    archived_at: null,
    created_at: "2026-03-10T00:00:00Z",
    updated_at: "2026-03-10T00:00:00Z",
  };
}

const zahlungen = [zahlung("p1"), zahlung("p2")];

const { DataQualityPage } = await import("@/features/payments/DataQualityPage");

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DataQualityPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  zuruecknehmen.mockReset();
});

describe("DataQualityPage – markierte Paare", () => {
  it("zeigt ein offenes Paar ohne Abschnitt fuer Markierte", () => {
    markiert.current = [];
    renderPage();

    expect(screen.getByRole("button", { name: /Keine Dublette/ })).toBeInTheDocument();
    expect(screen.queryByText(/Als keine Dublette markiert/)).not.toBeInTheDocument();
  });

  it("fuehrt ein markiertes Paar eingeklappt und nimmt die Markierung zurueck", async () => {
    markiert.current = [pairKey("p1", "p2")];
    renderPage();

    expect(screen.getByText("Keine möglichen Dubletten")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Als keine Dublette markiert (1)"));
    await userEvent.click(
      screen.getByRole("button", {
        name: "Markierung für Apple Inc. vom 10.03.2026 zurücknehmen",
      }),
    );

    expect(zuruecknehmen).toHaveBeenCalledWith(
      { idA: "p1", idB: "p2" },
      expect.anything(),
    );
  });
});
