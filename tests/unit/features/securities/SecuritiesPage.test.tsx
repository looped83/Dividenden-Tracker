import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@/components/ui/toast";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { setViewportWide } from "../../support/viewport";

/**
 * Die Uebersicht des Depots.
 *
 * Geprueft wird, dass die Liste die Zahlen der Position zeigt, sobald ein
 * Depotstand vorliegt — und **nur** dann: Ohne Stand waeren es Spalten voller
 * Gedankenstriche. Ebenso, dass die Zeilenaktionen und der Weg zur Detailseite
 * in beiden Darstellungen (Tabelle und Karte) erhalten bleiben.
 */
const staende = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("@/features/securities/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/securities/hooks")>();
  return {
    ...original,
    useSecurities: () => ({
      data: [
        {
          id: "sec-a",
          name: "Alpha AG",
          ticker: "ALP",
          isin: "DE0001234567",
          sector: "Industrie",
          country: "DE",
          currency: "EUR",
          payout_months: [3, 9],
          default_depot_id: "dep-1",
          archived_at: null,
        },
        {
          id: "sec-b",
          name: "Beta SE",
          ticker: null,
          isin: null,
          sector: null,
          country: null,
          currency: "EUR",
          payout_months: [],
          default_depot_id: null,
          archived_at: null,
        },
      ],
      isLoading: false,
    }),
    useSecuritySnapshots: () => ({ data: staende.current, isLoading: false }),
    useArchiveSecurity: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteSecurity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({
    data: [{ id: "dep-1", name: "Hauptdepot", base_currency: "EUR", archived_at: null }],
  }),
}));

const { SecuritiesPage } = await import("@/features/securities/SecuritiesPage");

function snapshot(partial: Partial<SecuritySnapshot> = {}): SecuritySnapshot {
  return {
    id: "snap-1",
    user_id: "user-1",
    security_id: "sec-a",
    run_id: "run-1",
    as_of: "2026-08-03",
    quantity: "10.000000",
    buyin_per_share: null,
    buyin_total: "1000.00",
    price: null,
    market_value: "1200.00",
    gain_absolute: "200.00",
    gain_relative: "0.2",
    allocation: "0.045",
    dividend_yield: "0.05",
    dividend_yield_on_buyin: null,
    annual_dividend_total: "60.00",
    dividend_per_share: null,
    dividend_frequency: "quarterly",
    dividend_cagr: null,
    dividend_cagr_period: null,
    next_ex_date: null,
    next_pay_date: null,
    asset_type: "equity",
    currency: "EUR",
    created_at: "2026-08-04T10:00:00Z",
    ...partial,
  };
}

function renderPage(snapshots: SecuritySnapshot[] = []) {
  staende.current = snapshots;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={["/depot"]}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <SecuritiesPage />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setViewportWide(true);
});

describe("SecuritiesPage", () => {
  it("zeigt Wert, erwartete Ausschüttung und Gewinn, sobald ein Depotstand vorliegt", () => {
    renderPage([snapshot()]);

    expect(screen.getByRole("columnheader", { name: "Wert" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Erwartet p. a." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Gewinn" })).toBeInTheDocument();

    const zeile = screen.getByRole("row", { name: /Alpha AG/ });
    expect(within(zeile).getByText(/1\.200,00\s€/)).toBeInTheDocument();
    expect(within(zeile).getByText(/4,5\s%\sAnteil/)).toBeInTheDocument();
    expect(within(zeile).getByText(/60,00\s€/)).toBeInTheDocument();
    expect(within(zeile).getByText(/5,00\s%\sRendite/)).toBeInTheDocument();
    expect(within(zeile).getByText(/\+200,00\s€/)).toBeInTheDocument();

    // Ohne Position im jüngsten Stand bleiben die Zellen leer statt 0 zu behaupten.
    const ohne = screen.getByRole("row", { name: /Beta SE/ });
    expect(within(ohne).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("lässt die Positionsspalten ohne Depotstand ganz weg", () => {
    renderPage([]);

    expect(screen.queryByRole("columnheader", { name: "Wert" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Ausschüttung" }),
    ).toBeInTheDocument();
    // Stattdessen traegt die Branche die Zeile mit — sie sagt ohne Depotstand
    // als Einzige etwas ueber die Streuung.
    expect(screen.getByRole("columnheader", { name: "Branche" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Depotkonto" })).toBeInTheDocument();
  });

  it("führt vom Namen auf die Detailseite und behält die Zeilenaktionen", () => {
    renderPage([snapshot()]);

    expect(screen.getByRole("link", { name: "Alpha AG" })).toHaveAttribute(
      "href",
      "/depot/sec-a",
    );
    expect(
      screen.getByRole("button", { name: "Alpha AG bearbeiten" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Alpha AG archivieren" }),
    ).toBeInTheDocument();
    // Endgültig löschen gibt es weiterhin nur für archivierte Assets.
    expect(
      screen.queryByRole("button", { name: "Alpha AG endgültig löschen" }),
    ).not.toBeInTheDocument();
  });

  it("zeigt auf dem Telefon dieselben Zahlen als Zeile, die zur Detailseite fuehrt", () => {
    setViewportWide(false);
    renderPage([snapshot()]);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // Die Kennzahlkacheln nennen dieselben Betraege — geprueft wird die Zeile.
    const zeile = screen.getByRole("link", { name: /^Alpha AG/ });
    expect(zeile).toHaveAttribute("href", "/depot/sec-a");
    const inZeile = within(zeile);
    expect(inZeile.getByText(/1\.200,00\s€/)).toBeInTheDocument();
    expect(inZeile.getByText(/60,00\s€/)).toBeInTheDocument();
    expect(inZeile.getByText(/\+200,00\s€/)).toBeInTheDocument();
    // Bearbeiten und Archivieren stehen auf der Detailseite, nicht in der Zeile.
    expect(
      screen.queryByRole("button", { name: "Alpha AG archivieren" }),
    ).not.toBeInTheDocument();
  });

  it("bietet die Sortierung nach Wert nur mit Depotstand an", () => {
    const { unmount } = renderPage([]);
    expect(screen.queryByRole("option", { name: "Nach Wert" })).not.toBeInTheDocument();
    unmount();

    renderPage([snapshot()]);
    expect(screen.getByRole("option", { name: "Nach Wert" })).toBeInTheDocument();
  });
});
