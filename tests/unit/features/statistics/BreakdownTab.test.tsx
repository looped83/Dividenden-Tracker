import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import { filterPayments } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { BreakdownTab } from "@/features/statistics/BreakdownTab";
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

// Fester Stichtag: Der Bereich kappt laufende Zeitraeume am heutigen Tag —
// ohne feste Zeit waeren die Erwartungen ab dem naechsten Monatswechsel falsch.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
});
afterAll(() => {
  vi.useRealTimers();
});

const PAYMENTS = [
  p("2024-03-10", "100.00"),
  p("2024-12-05", "300.00"),
  p("2025-03-10", "150.00"),
  p("2026-03-10", "180.00"),
];

function renderBreakdown(
  payments: AnalyticsPayment[] = PAYMENTS,
  filter = EMPTY_STATISTICS_FILTER,
) {
  const context: StatisticsContext = {
    expectedAnnualDividend: new Map(),
    payments: filterPayments(payments, filter),
    allPayments: payments,
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
          <Route index element={<BreakdownTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("BreakdownTab", () => {
  it("stellt alle Jahre als Zeilen dar, neueste zuerst", () => {
    renderBreakdown();
    const table = screen.getByRole("table");
    const jahre = within(table)
      .getAllByRole("rowheader")
      .map((zelle) => zelle.textContent);
    expect(jahre).toEqual(["2026* (laufendes Jahr)", "2025", "2024", "Gesamt"]);
  });

  it("stellt die zwölf Monate als Spalten dar", () => {
    renderBreakdown();
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Januar" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Dezember" }),
    ).toBeInTheDocument();
    // Jahr + zwölf Monate + Gesamt.
    expect(within(table).getAllByRole("columnheader")).toHaveLength(14);
    // Drei Jahreszeilen plus Kopf- und Summenzeile.
    expect(within(table).getAllByRole("row")).toHaveLength(5);
  });

  it("verlinkt jeden Betrag in die zugehörigen Dividendeneingänge", () => {
    renderBreakdown();
    const link = screen.getByRole("link", { name: /März 2025/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("year=2025"));
    expect(link).toHaveAttribute("href", expect.stringContaining("month=3"));
  });

  it("zeigt Jahressummen am Zeilenende und Monatssummen in der Fußzeile", () => {
    renderBreakdown();
    const table = screen.getByRole("table");
    // 2024: 100 + 300 = 400 €.
    expect(within(table).getAllByText(/400,00\s?€/).length).toBeGreaterThan(0);
    // März über alle Jahre: 100 + 150 + 180 = 430 €.
    expect(within(table).getAllByText(/430,00\s?€/).length).toBeGreaterThan(0);
  });

  it("wechselt die Ansicht auf die Veränderung zum Vorjahresmonat", () => {
    renderBreakdown();
    fireEvent.change(screen.getByLabelText("Ansicht"), {
      target: { value: "veraenderung" },
    });
    // März 2025: 150 gegen 100 € im Vorjahr.
    expect(screen.getByText("+50,0 %")).toBeInTheDocument();
    // Der Rand bleibt bei Summen: die Jahressumme 2024 steht weiterhin da.
    expect(screen.getAllByText(/400,00\s?€/).length).toBeGreaterThan(0);
  });

  it('summiert in der Ansicht „Aufgelaufen" über das Jahr', () => {
    renderBreakdown();
    fireEvent.change(screen.getByLabelText("Ansicht"), {
      target: { value: "kumuliert" },
    });
    // Dezember 2024: 100 € (März) + 300 € = 400 €.
    expect(screen.getAllByText(/400,00\s?€/).length).toBeGreaterThan(0);
  });

  it("ignoriert den Jahresfilter und sagt das ausdrücklich", () => {
    renderBreakdown(PAYMENTS, { ...EMPTY_STATISTICS_FILTER, year: 2025 });
    const table = screen.getByRole("table");
    expect(within(table).getByRole("rowheader", { name: /2024/ })).toBeInTheDocument();
    expect(
      screen.getByText(/Jahresfilter \(2025\) wirkt in diesem Bereich nicht/),
    ).toBeInTheDocument();
  });

  it("zeigt ohne Daten einen leeren Zustand statt einer leeren Tabelle", () => {
    renderBreakdown([]);
    expect(screen.getByText("Keine Daten für den Breakdown")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
