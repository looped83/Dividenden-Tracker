import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import { filterPayments } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { OverviewTab } from "@/features/statistics/OverviewTab";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";
import type { StatisticsContext } from "@/features/statistics/context";

let seq = 0;
function p(payDate: string, net: string, security = "sec-a"): AnalyticsPayment {
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

function renderOverview(payments: AnalyticsPayment[]) {
  const securities = new Map<string, EntityInfo>([
    ["sec-a", { name: "Alpha AG", archived: false }],
    ["sec-b", { name: "Beta SE", archived: true }],
  ]);
  const depots = new Map<string, EntityInfo>([
    ["dep-1", { name: "Hauptdepot", archived: false }],
  ]);
  const context: StatisticsContext = {
    payments: filterPayments(payments, EMPTY_STATISTICS_FILTER),
    allPayments: payments,
    securities,
    depots,
    filter: EMPTY_STATISTICS_FILTER,
  };
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route index element={<OverviewTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("OverviewTab (Render-Smoke)", () => {
  it("zeigt die historische Gesamtsumme und Kernkennzahlen", () => {
    renderOverview([
      p("2024-05-10", "100.00", "sec-a"),
      p("2025-05-10", "300.00", "sec-b"),
      p("2025-08-10", "50.00", "sec-a"),
    ]);
    expect(screen.getByText("Historische Gesamtsumme")).toBeInTheDocument();
    expect(screen.getAllByText(/450,00\s?€/).length).toBeGreaterThan(0);
    expect(screen.getByText("Bester Monat")).toBeInTheDocument();
    expect(screen.getByText("Bestes Jahr")).toBeInTheDocument();
  });

  it("zeigt die jährliche Datentabelle als Diagramm-Alternative", () => {
    renderOverview([p("2024-05-10", "100.00"), p("2025-05-10", "200.00")]);
    // Datentabelle des Jahresdiagramms enthält beide Jahre.
    expect(screen.getAllByText("2024").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2025").length).toBeGreaterThan(0);
  });
});
