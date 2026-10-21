import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import { PositionCard } from "@/features/securities/PositionCard";

function snapshot(overrides: Partial<SecuritySnapshot> = {}): SecuritySnapshot {
  return {
    id: "snap-1",
    user_id: "user-1",
    security_id: "sec-1",
    run_id: "run-1",
    as_of: "2026-09-26",
    quantity: "120.000000",
    buyin_per_share: "51.00",
    buyin_total: "6120.00",
    price: "58.40",
    market_value: "7008.00",
    gain_absolute: "888.00",
    gain_relative: "0.1451",
    allocation: null,
    dividend_yield: "0.0531",
    dividend_yield_on_buyin: "0.0608",
    annual_dividend_total: "372.00",
    dividend_per_share: "3.10",
    dividend_frequency: "monthly",
    dividend_cagr: "0.042",
    dividend_cagr_period: "5Y",
    next_ex_date: null,
    next_pay_date: null,
    asset_type: null,
    currency: "EUR",
    created_at: "2026-09-26T10:00:00Z",
    ...overrides,
  };
}

describe("PositionCard", () => {
  it("zeigt Marktwert und Rendite als Kennzahlen", () => {
    render(
      <PositionCard status={{ snapshot: snapshot(), current: true }} payoutMonths={[]} />,
    );
    expect(screen.getByText("Marktwert")).toBeInTheDocument();
    expect(screen.getByText(/^\+888,00\s€$/)).toBeInTheDocument();
    expect(screen.getByText(/^auf Einstand 6,08\s%$/)).toBeInTheDocument();
    // Die Erwartung steht seit 1.30.0 im Kopf der Seite, nicht mehr hier.
    expect(screen.queryByText("Erwartet p. a.")).not.toBeInTheDocument();
  });

  it("zeigt die uebrigen Werte offen als Zeilen", () => {
    const { container } = render(
      <PositionCard status={{ snapshot: snapshot(), current: true }} payoutMonths={[]} />,
    );
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("Stückzahl")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("monatlich")).toBeInTheDocument();
    expect(screen.getByText(/4,2\s% p\. a\. über 5 Jahre/)).toBeInTheDocument();
  });

  it("nennt den Rhythmus nach den gepflegten Ausschuettungsmonaten", () => {
    render(
      <PositionCard
        status={{ snapshot: snapshot(), current: true }}
        payoutMonths={[3, 6, 9, 12]}
      />,
    );
    expect(screen.getByText("vierteljährlich")).toBeInTheDocument();
    expect(screen.queryByText("monatlich")).not.toBeInTheDocument();
  });

  it("kennzeichnet einen verkauften Bestand in der Ueberschrift", () => {
    render(
      <PositionCard
        status={{ snapshot: snapshot({ as_of: "2026-03-31" }), current: false }}
        payoutMonths={[]}
      />,
    );
    expect(
      screen.getByRole("heading", {
        // Die Datumsmarke gehoert zur Ueberschrift, weil jede Zahl nur an diesem Tag galt.
        name: /^Letzter bekannter Bestand\s*Stand 31\.03\.2026$/,
      }),
    ).toBeInTheDocument();
  });
});
