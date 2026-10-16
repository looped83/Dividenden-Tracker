import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, YearSelection } from "@/lib/statistics";
import { HistoricalOverview } from "@/features/dashboard/HistoricalOverview";

let seq = 0;
function payment(payDate: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `id-${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "sec-a",
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

const PAYMENTS = [
  payment("2019-03-14", "100.00"),
  payment("2025-06-10", "200.00"),
  payment("2026-02-10", "50.00"),
];

function renderRow(selection: YearSelection) {
  return render(
    <MemoryRouter>
      <HistoricalOverview payments={PAYMENTS} selection={selection} />
    </MemoryRouter>,
  );
}

describe("HistoricalOverview", () => {
  it("zeigt die Summe seit Beginn als eine Zeile, die zur Statistik fuehrt", () => {
    renderRow(2026);
    const link = screen.getByRole("link", { name: /Gesamt seit März 2019/ });
    expect(link).toHaveAttribute("href", "/statistiken");
    // Unabhaengig vom gewaehlten Jahr: alle drei Eingaenge.
    expect(link).toHaveTextContent(/350,00\s€/);
    expect(link).toHaveTextContent("3 Zahlungen");
  });

  it('entfällt bei „Alle Jahre"', () => {
    // Die Kennzahlen oben nennen dann dieselbe Summe.
    const { container } = renderRow("all");
    expect(container).toBeEmptyDOMElement();
  });
});
