import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@/components/ui/toast";
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";

// Die Seite haengt an drei Abfragen; sie werden hier durch Fixtures ersetzt,
// damit der Test die Ansicht prueft und nicht das Netz.
const zahlungen = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("@/features/payments/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/payments/hooks")>();
  return {
    ...original,
    useAllPayments: () => ({ data: zahlungen.current, isLoading: false }),
    useArchivePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUnarchivePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeletePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({
    data: [
      {
        id: "s1",
        name: "Apple Inc.",
        ticker: "AAPL",
        archived_at: null,
        payout_months: [],
      },
      {
        id: "s2",
        name: "Allianz SE",
        ticker: "ALV",
        archived_at: null,
        payout_months: [],
      },
    ],
  }),
}));

vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({
    data: [
      { id: "d1", name: "Depot A", base_currency: "EUR", archived_at: null },
      { id: "d2", name: "Depot B", base_currency: "EUR", archived_at: null },
    ],
  }),
}));

const { PaymentsPage } = await import("@/features/payments/PaymentsPage");

function zahlung(overrides: Partial<PaymentListRow> = {}): PaymentListRow {
  return {
    id: "p1",
    security_id: "s1",
    depot_id: "d1",
    pay_date: "2026-03-10",
    net_amount: "50.00",
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

function renderList(rows: PaymentListRow[], route = "/eingaenge") {
  zahlungen.current = rows;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <PaymentsPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("PaymentsPage", () => {
  beforeEach(() => {
    zahlungen.current = [];
  });

  it("zeigt die Eingaenge mit Unternehmen und Betrag", () => {
    renderList([
      zahlung({ id: "a", security_id: "s1", net_amount: "50.00" }),
      zahlung({
        id: "b",
        security_id: "s2",
        net_amount: "120.00",
        pay_date: "2026-05-02",
      }),
    ]);

    // Ueber die Rolle, nicht ueber den Text: Die Namen stehen auch in den
    // Auswahllisten der Filterleiste.
    expect(screen.getByRole("link", { name: "Apple Inc." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Allianz SE" })).toBeInTheDocument();
    expect(screen.getByText("50,00 €")).toBeInTheDocument();
    expect(screen.getByText("120,00 €")).toBeInTheDocument();
  });

  it("filtert nach Unternehmen und nennt die Trefferzahl", async () => {
    const user = userEvent.setup();
    renderList([
      zahlung({ id: "a", security_id: "s1" }),
      zahlung({ id: "b", security_id: "s2" }),
    ]);

    await user.selectOptions(screen.getByLabelText("Unternehmen"), "s1");

    expect(screen.getByText("1 Eingang gefunden.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apple Inc." })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Allianz SE" })).not.toBeInTheDocument();
  });

  it("blendet stornierte Eingaenge aus, bis man sie anfordert", async () => {
    const user = userEvent.setup();
    renderList([
      zahlung({ id: "a", security_id: "s1" }),
      zahlung({ id: "b", security_id: "s2", archived_at: "2026-04-01T00:00:00Z" }),
    ]);

    expect(screen.queryByRole("link", { name: "Allianz SE" })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Stornierte anzeigen"));

    expect(screen.getByRole("link", { name: "Allianz SE" })).toBeInTheDocument();
    expect(screen.getByText("Storniert")).toBeInTheDocument();
  });

  it("blaettert erst ab der zweiten Seite und zeigt die Spanne", async () => {
    const user = userEvent.setup();
    const viele = Array.from({ length: 30 }, (_, index) =>
      zahlung({
        id: `p${String(index)}`,
        pay_date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      }),
    );
    renderList(viele);

    expect(screen.getByText(/1–25 von 30/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByText(/26–30 von 30/)).toBeInTheDocument();
  });

  it("zeigt die Massenaktionen erst mit einer Auswahl", async () => {
    const user = userEvent.setup();
    renderList([zahlung({ id: "a" })]);

    expect(screen.queryByText(/ausgewählt/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Apple Inc. auswählen"));

    expect(screen.getByText("1 ausgewählt")).toBeInTheDocument();
    // „Depot zuweisen" gibt es nur in der Massenaktionsleiste; „Dauerhaft
    // loeschen" traegt auch die Karte.
    expect(screen.getByRole("button", { name: "Depot zuweisen" })).toBeInTheDocument();
  });

  it("erklaert den leeren Zustand ohne Eingaenge", () => {
    renderList([]);
    expect(screen.getByText("Noch kein Dividendeneingang erfasst")).toBeInTheDocument();
  });

  it("unterscheidet den leeren Bestand von einer leeren Auswahl", async () => {
    const user = userEvent.setup();
    renderList([zahlung({ id: "a", security_id: "s1" })]);

    await user.selectOptions(screen.getByLabelText("Unternehmen"), "s2");

    expect(
      screen.getByText("Keine Eingänge für die aktuelle Auswahl"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Noch kein Dividendeneingang erfasst"),
    ).not.toBeInTheDocument();
  });
});
