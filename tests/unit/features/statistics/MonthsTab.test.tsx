import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, StatisticsFilter } from "@/lib/statistics";
import { filterPayments } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { MonthsTab } from "@/features/statistics/MonthsTab";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";
import type { StatisticsContext } from "@/features/statistics/context";

let seq = 0;
function p(payDate: string, net: string): AnalyticsPayment {
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

// März in beiden Jahren, Mai nur 2024 — genau der Fall, in dem eine Zeile
// ohne gemeinsame Jahresachse weniger Balken hätte als die andere.
const PAYMENTS = [
  p("2024-03-10", "100.00"),
  p("2024-05-10", "200.00"),
  p("2025-03-10", "150.00"),
];

function renderMonths(filter: StatisticsFilter = EMPTY_STATISTICS_FILTER) {
  const context: StatisticsContext = {
    payments: filterPayments(PAYMENTS, filter),
    allPayments: PAYMENTS,
    securities: new Map<string, EntityInfo>([
      ["sec-a", { name: "Alpha AG", archived: false }],
    ]),
    depots: new Map<string, EntityInfo>([
      ["dep-1", { name: "Hauptdepot", archived: false }],
    ]),
    filter,
  };
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route index element={<MonthsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("MonthsTab — Entwicklung über die Jahre", () => {
  it("stellt jede Zeile auf dieselbe Jahresachse", () => {
    renderMonths();
    const tabelle = screen.getByRole("table", {
      name: /Kennzahlen je Kalendermonat/,
    });
    expect(
      within(tabelle).getByRole("columnheader", { name: "Entwicklung 2024–2025" }),
    ).toBeInTheDocument();

    // Mai hat nur 2024 eine Zahlung — 2025 erscheint trotzdem, als 0 €.
    expect(
      screen.getByRole("img", { name: /^2024: 200,00\s?€, 2025: 0,00\s?€$/ }),
    ).toBeInTheDocument();
    // März trägt in beiden Jahren, in derselben Reihenfolge.
    expect(
      screen.getByRole("img", { name: /^2024: 100,00\s?€, 2025: 150,00\s?€$/ }),
    ).toBeInTheDocument();
  });

  it("lässt die Spalte weg, wenn der Jahresfilter nur ein Jahr übrig lässt", () => {
    renderMonths({ ...EMPTY_STATISTICS_FILTER, year: 2025 });
    expect(
      screen.queryByRole("columnheader", { name: /Entwicklung/ }),
    ).not.toBeInTheDocument();
    // Die übrigen Kennzahlen des Monats bleiben selbstverständlich stehen.
    expect(screen.getByRole("columnheader", { name: /Summe/ })).toBeInTheDocument();
  });
});
