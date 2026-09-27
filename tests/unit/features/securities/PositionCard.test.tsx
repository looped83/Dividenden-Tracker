import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EUR, Money } from "@/lib/money";
import type { YearBucket } from "@/lib/statistics";
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

const PER_YEAR: YearBucket[] = [
  { year: 2025, net: Money.fromString("351.84", EUR), count: 12 },
  { year: 2026, net: Money.fromString("280.00", EUR), count: 9 },
];

describe("PositionCard", () => {
  it("nennt oben Erwartung und das letzte abgeschlossene Jahr nebeneinander", () => {
    render(
      <PositionCard
        status={{ snapshot: snapshot(), current: true }}
        perYear={PER_YEAR}
      />,
    );
    expect(screen.getByText("Erwartet p. a.")).toBeInTheDocument();
    expect(screen.getByText(/^372,00\s€$/)).toBeInTheDocument();
    // 2026 laeuft noch — verglichen wird mit 2025.
    expect(screen.getByText("Erhalten 2025")).toBeInTheDocument();
    expect(screen.getByText(/^351,84\s€$/)).toBeInTheDocument();
    expect(screen.getByText("Marktwert")).toBeInTheDocument();
    expect(screen.getByText(/^\+888,00\s€$/)).toBeInTheDocument();
    expect(screen.getByText(/^auf Einstand 6,08\s%$/)).toBeInTheDocument();
  });

  it("legt die uebrigen Werte unter „Alle Kennzahlen“", () => {
    render(
      <PositionCard
        status={{ snapshot: snapshot(), current: true }}
        perYear={PER_YEAR}
      />,
    );
    const details = screen.getByText("Alle Kennzahlen").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("Stückzahl");
    expect(details).toHaveTextContent("monatlich");
    expect(details?.textContent).toMatch(/4,2\s% p\. a\. über 5 Jahre/);
  });

  it("sagt ohne abgeschlossenes Jahr, dass der Vergleich noch fehlt", () => {
    render(
      <PositionCard
        status={{ snapshot: snapshot(), current: true }}
        perYear={[{ year: 2026, net: Money.fromString("280.00", EUR), count: 9 }]}
      />,
    );
    expect(screen.getByText("Erhalten")).toBeInTheDocument();
    expect(screen.getByText("noch kein volles Jahr")).toBeInTheDocument();
  });

  it("kennzeichnet einen verkauften Bestand ohne zusaetzlichen Erklaersatz", () => {
    render(
      <PositionCard
        status={{ snapshot: snapshot({ as_of: "2026-03-31" }), current: false }}
        perYear={PER_YEAR}
      />,
    );
    expect(
      screen.getByRole("heading", {
        // Die Datumsmarke gehoert zur Ueberschrift, weil jede Zahl nur an diesem Tag galt.
        name: /^Letzter bekannter Bestand\s*Stand 31\.03\.2026$/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/nicht mehr vor/)).not.toBeInTheDocument();
  });
});
