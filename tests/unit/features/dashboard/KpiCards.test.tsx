import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import type { RefDate } from "@/lib/statistics/dates";
import { KpiCards } from "@/features/dashboard/KpiCards";

let seq = 0;
function payment(payDate: string, net: string, security = "sec-a"): AnalyticsPayment {
  seq += 1;
  return {
    id: `id-${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: security,
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

const TODAY: RefDate = { year: 2026, month: 7, day: 20 };

function renderCards(selection: number | "all", payments: AnalyticsPayment[]) {
  return render(
    <MemoryRouter>
      <KpiCards payments={payments} selection={selection} today={TODAY} />
    </MemoryRouter>,
  );
}

describe("KpiCards (Render-Smoke)", () => {
  it("rendert die historische Gesamtsumme aus den echten Daten", () => {
    renderCards(2026, [
      payment("2026-03-10", "50.00"),
      payment("2020-05-10", "70.00", "sec-b"),
    ]);
    expect(screen.getByText("Historisch erhaltene Dividenden")).toBeInTheDocument();
    // Summe 120,00 € erscheint als historischer Gesamtwert.
    expect(screen.getAllByText(/120,00\s?€/).length).toBeGreaterThan(0);
  });

  it("zeigt bei Einzeljahr die Ø-pro-Monat-Karte, bei 'Alle Jahre' nicht", () => {
    const data = [payment("2026-03-10", "50.00")];
    const single = renderCards(2026, data);
    expect(screen.getByText("Ø pro Monat")).toBeInTheDocument();
    single.unmount();

    renderCards("all", data);
    expect(screen.queryByText("Ø pro Monat")).not.toBeInTheDocument();
  });

  it("zeigt die Anzahl ausschüttender Unternehmen im Zeitraum", () => {
    renderCards(2026, [
      payment("2026-03-10", "50.00", "sec-a"),
      payment("2026-04-10", "30.00", "sec-b"),
    ]);
    expect(screen.getByText("Ausschüttende Unternehmen")).toBeInTheDocument();
  });
});
