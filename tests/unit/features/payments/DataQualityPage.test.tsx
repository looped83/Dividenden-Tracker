import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@/components/ui/toast";
import { anomalyKey, pairKey } from "@/lib/payments/dataQuality";
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";

/**
 * „Keine Dublette" und „In Ordnung" sind keine Einbahnstrassen: Markierte
 * Paare und geprüfte Auffälligkeiten stehen eingeklappt unter den offenen und
 * lassen sich zuruecknehmen.
 */
const markiert = vi.hoisted(() => ({ current: [] as string[] }));
const geprueft = vi.hoisted(() => ({ current: [] as string[] }));
const zuruecknehmen = vi.hoisted(() => vi.fn());
const pruefen = vi.hoisted(() => vi.fn());

vi.mock("@/features/payments/hooks", () => ({
  useAllPayments: () => ({ data: zahlungen, isLoading: false }),
  useDuplicateDismissals: () => ({ data: markiert.current }),
  useDismissDuplicate: () => ({ mutate: vi.fn() }),
  useUndismissDuplicate: () => ({ mutate: zuruecknehmen, isPending: false }),
  useAnomalyReviews: () => ({ data: geprueft.current }),
  useReviewAnomaly: () => ({ mutate: pruefen, isPending: false }),
  useArchivePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({
    data: [
      { id: "s1", name: "Apple Inc.", archived_at: null },
      // Archiviert, mit mehreren Eingängen: Die Übersicht zählt das Asset, nicht
      // seine Eingänge.
      { id: "s2", name: "Verkauft AG", archived_at: "2026-01-01T00:00:00Z" },
    ],
  }),
}));
vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({
    data: [{ id: "d1", name: "Depot A", base_currency: "EUR", archived_at: null }],
  }),
}));

function zahlung(id: string, overrides: Partial<PaymentListRow> = {}): PaymentListRow {
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
    ...overrides,
  };
}

const zahlungen = [
  zahlung("p1"),
  zahlung("p2"),
  // Nullbetrag: eine Auffälligkeit, die sich als geprüft markieren lässt.
  zahlung("p3", { security_id: "s2", pay_date: "2025-06-02", net_amount: "0.00" }),
  zahlung("p4", { security_id: "s2", pay_date: "2025-09-02", net_amount: "12.00" }),
];

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
  pruefen.mockReset();
  markiert.current = [];
  geprueft.current = [];
});

describe("DataQualityPage – Übersicht", () => {
  it("zählt archivierte Assets, nicht deren Eingänge", () => {
    renderPage();

    const wert = screen.getByText("Archivierte Assets").nextElementSibling;
    expect(wert).toHaveTextContent("1");
  });
});

describe("DataQualityPage – Auffälligkeiten", () => {
  it("markiert eine Auffälligkeit als geprüft", async () => {
    renderPage();

    await userEvent.click(
      screen.getByRole("button", {
        name: /^Verkauft AG vom 02\.06\.2025 \(.+\) als geprüft markieren$/,
      }),
    );

    expect(pruefen).toHaveBeenCalledWith(
      { paymentId: "p3", code: "zero_amount", reviewed: true },
      expect.anything(),
    );
    expect(screen.queryByText(/Als geprüft markiert/)).not.toBeInTheDocument();
  });

  it("führt eine geprüfte Auffälligkeit eingeklappt und nimmt die Markierung zurück", async () => {
    geprueft.current = [anomalyKey("p3", "zero_amount")];
    renderPage();

    expect(screen.getByText("Keine offenen Auffälligkeiten")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Als geprüft markiert (1)"));
    await userEvent.click(
      screen.getByRole("button", {
        name: /^Markierung für Verkauft AG vom 02\.06\.2025 \(.+\) zurücknehmen$/,
      }),
    );

    expect(pruefen).toHaveBeenCalledWith(
      { paymentId: "p3", code: "zero_amount", reviewed: false },
      expect.anything(),
    );
  });
});

describe("DataQualityPage – markierte Paare", () => {
  it("zeigt ein offenes Paar ohne Abschnitt fuer Markierte", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /Keine Dublette/ })).toBeInTheDocument();
    expect(screen.queryByText(/Als keine Dublette markiert/)).not.toBeInTheDocument();
  });

  it("fuehrt ein markiertes Paar eingeklappt und nimmt die Markierung zurueck", async () => {
    markiert.current = [pairKey("p1", "p2")];
    renderPage();

    // Erledigt, nicht „keine vorhanden": Das markierte Paar gibt es ja.
    expect(screen.getByText("Keine offenen Dubletten")).toBeInTheDocument();
    expect(screen.queryByText(/Keine Dividenden mit gleichem/)).not.toBeInTheDocument();
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

describe("DataQualityPage – lange Listen", () => {
  it("zeigt Dubletten schrittweise statt alle auf einmal", async () => {
    // Acht Eingänge am selben Tag: 28 Paare, dazu das Paar p1/p2 — 29.
    const extra = Array.from({ length: 8 }, (_, index) =>
      zahlung(`x${String(index)}`, { pay_date: "2026-04-01" }),
    );
    zahlungen.push(...extra);
    try {
      renderPage();
      expect(screen.getAllByRole("button", { name: "Keine Dublette" })).toHaveLength(20);
      expect(screen.getByText("20 von 29 angezeigt")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Weitere anzeigen" }));

      expect(screen.getAllByRole("button", { name: "Keine Dublette" })).toHaveLength(29);
      expect(screen.queryByRole("button", { name: "Weitere anzeigen" })).toBeNull();
    } finally {
      zahlungen.splice(-extra.length);
    }
  });
});
