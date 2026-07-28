import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BulkBar } from "@/features/payments/BulkBar";
import type { Database } from "@/lib/supabase/database.types";

type DividendPayment = Database["public"]["Tables"]["dividend_payments"]["Row"];

const basePayment: DividendPayment = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "00000000-0000-0000-0000-000000000004",
  security_id: "00000000-0000-0000-0000-000000000002",
  depot_id: "00000000-0000-0000-0000-000000000003",
  pay_date: "2026-03-15",
  payment_type: "regular",
  gross_amount: "73.63",
  net_amount: "73.63",
  withholding_tax: "0",
  domestic_tax: "0",
  solidarity_surcharge: null,
  church_tax: null,
  fees: null,
  original_currency: "EUR",
  original_gross: null,
  original_net: null,
  fx_rate: null,
  quantity: null,
  amount_per_share: null,
  source: "manual",
  import_id: null,
  source_file_name: null,
  source_row_number: null,
  row_fingerprint: null,
  note: null,
  archived_at: null,
  archive_reason: null,
  business_fingerprint: "fingerprint",
  created_at: "2026-03-15T00:00:00Z",
  updated_at: "2026-03-15T00:00:00Z",
};

function row(id: string, archived: boolean) {
  return {
    id,
    payment: {
      ...basePayment,
      id,
      archived_at: archived ? "2026-03-16T00:00:00Z" : null,
    },
  };
}

function renderBar(rows: ReturnType<typeof row>[]) {
  // Depot-/Unternehmenslisten der Zuweisungsdialoge laufen ueber React Query;
  // ohne Server bleiben sie leer, was die Schaltflaechen nicht beruehrt.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BulkBar selectedRows={rows} onClear={() => undefined} />
    </QueryClientProvider>,
  );
}

/**
 * Angeboten wird nur, was die Auswahl hergibt — wie in der Tabellenzeile, die
 * entweder stornieren oder reaktivieren anbietet, nie beides.
 */
describe("BulkBar", () => {
  it("bietet bei aktiven Eingaengen kein Reaktivieren an", () => {
    renderBar([row("a", false), row("b", false)]);
    expect(screen.getByRole("button", { name: "Stornieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Depot zuweisen" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reaktivieren" }),
    ).not.toBeInTheDocument();
  });

  it("bietet bei stornierten Eingaengen nur Reaktivieren und Loeschen an", () => {
    renderBar([row("a", true)]);
    expect(screen.getByRole("button", { name: "Reaktivieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dauerhaft löschen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stornieren" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Depot zuweisen" }),
    ).not.toBeInTheDocument();
  });

  it("bietet bei gemischter Auswahl beides an", () => {
    renderBar([row("a", false), row("b", true)]);
    expect(screen.getByRole("button", { name: "Stornieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reaktivieren" })).toBeInTheDocument();
  });

  it("nennt die Anzahl der ausgewaehlten Eingaenge", () => {
    renderBar([row("a", false), row("b", true)]);
    expect(screen.getByText("2 ausgewählt")).toBeInTheDocument();
  });
});
