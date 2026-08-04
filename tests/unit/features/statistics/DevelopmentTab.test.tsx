import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { DevelopmentTab } from "@/features/statistics/DevelopmentTab";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";
import {
  EMPTY_PORTFOLIO_SERIES,
  type PortfolioSeries,
} from "@/features/securities/snapshots";
import type { StatisticsContext } from "@/features/statistics/context";

/**
 * Unterbereich „Entwicklung".
 *
 * Der Kern ist der Soll-Ist-Vergleich zweier **Zwoelfmonatszeitraeume**: die
 * erwartete Jahresdividende gegen das, was in den zwoelf Monaten bis zum
 * Stichtag tatsaechlich hereinkam. Genau daran haengen diese Tests — plus die
 * Frage, was der Bereich zeigt, solange es nur einen Stand gibt.
 */
let seq = 0;
function payment(payDate: string, net: string, securityId = "sec-a"): AnalyticsPayment {
  seq += 1;
  return {
    id: `pay-${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId,
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

function money(value: string): Money {
  return Money.fromString(value, EUR);
}

const SERIES: PortfolioSeries = {
  points: [
    {
      asOf: "2026-02-02",
      marketValue: money("800.00"),
      buyinTotal: money("700.00"),
      annualDividend: money("28.00"),
      positions: 2,
    },
    {
      asOf: "2026-08-03",
      marketValue: money("1500.00"),
      buyinTotal: money("1300.00"),
      annualDividend: money("50.00"),
      positions: 2,
    },
  ],
  latest: {
    asOf: "2026-08-03",
    marketValue: money("1500.00"),
    buyinTotal: money("1300.00"),
    annualDividend: money("50.00"),
    positions: 2,
  },
  expectedBySecurity: new Map([
    ["sec-a", money("40.00")],
    ["sec-b", money("10.00")],
  ]),
  yieldOnBuyinBySecurity: new Map(),
  bySector: [],
  byCountry: [],
};

function renderTab(
  portfolio: PortfolioSeries = SERIES,
  payments: AnalyticsPayment[] = [
    // Innerhalb der zwoelf Monate bis zum 03.08.2026.
    payment("2025-09-15", "30.00"),
    payment("2026-07-15", "12.00"),
    // Genau einen Tag zu alt: Das Fenster beginnt am 04.08.2025.
    payment("2025-08-03", "999.00"),
  ],
) {
  const context: StatisticsContext = {
    payments,
    allPayments: payments,
    securities: new Map<string, EntityInfo>([
      ["sec-a", { name: "Alpha AG", archived: false }],
      ["sec-b", { name: "Beta SE", archived: false }],
    ]),
    depots: new Map<string, EntityInfo>([
      ["dep-1", { name: "Hauptdepot", archived: false }],
    ]),
    filter: EMPTY_STATISTICS_FILTER,
    portfolio,
  };
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route index element={<DevelopmentTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("DevelopmentTab", () => {
  it("verweist auf den Import, solange kein Depotstand vorliegt", () => {
    renderTab(EMPTY_PORTFOLIO_SERIES);
    expect(screen.getByText("Noch kein Depotstand importiert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zu den Unternehmen" })).toHaveAttribute(
      "href",
      "/unternehmen",
    );
  });

  it("zählt nur die zwölf Monate bis zum Stichtag", () => {
    // 30 + 12 = 42 €. Die Zahlung vom 03.08.2025 liegt einen Tag ausserhalb;
    // zaehlte sie mit, staende hier 1.041 €.
    // „42,00 €" steht sowohl in der Kachel als auch in der Tabellenzeile.
    renderTab();
    expect(screen.getAllByText(/^42,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1\.041,00/)).not.toBeInTheDocument();
  });

  it("nennt das Fenster, aus dem die erhaltene Summe stammt", () => {
    renderTab();
    expect(screen.getByText("04.08.2025 – 03.08.2026")).toBeInTheDocument();
  });

  it("weist die Abweichung mit Vorzeichen aus", () => {
    // Erwartet 50 €, erhalten 42 € — acht Euro darunter.
    renderTab();
    expect(screen.getByText(/^-8,00/)).toBeInTheDocument();
    expect(screen.getByText(/-16,0 % gegenüber der Erwartung/)).toBeInTheDocument();
  });

  it("stellt je Unternehmen erwartet und erhalten gegenüber", () => {
    renderTab();
    const zeile = screen.getByRole("row", { name: /Alpha AG/ });
    // Alpha: 40 € erwartet, 42 € erhalten, also +2 €.
    expect(within(zeile).getByText(/^40,00/)).toBeInTheDocument();
    expect(within(zeile).getByText(/^42,00/)).toBeInTheDocument();
    expect(within(zeile).getByText(/^\+2,00/)).toBeInTheDocument();
  });

  it("führt auch Unternehmen ohne Zahlung im Zeitraum auf", () => {
    // Beta hat eine Erwartung, aber nichts gezahlt — genau das soll auffallen.
    renderTab();
    const zeile = screen.getByRole("row", { name: /Beta SE/ });
    expect(within(zeile).getByText(/^10,00/)).toBeInTheDocument();
    expect(within(zeile).getByText(/^-10,00/)).toBeInTheDocument();
  });

  it("zeigt statt einer Kurve einen Hinweis, solange es nur einen Stand gibt", () => {
    // Eine Linie durch einen Punkt waere eine Behauptung ueber einen Verlauf,
    // den es noch nicht gibt.
    renderTab({ ...SERIES, points: [SERIES.points[1]] });
    expect(screen.getByText(/ab dem zweiten Depotstand/)).toBeInTheDocument();
  });

  it("zeichnet den Verlauf, sobald zwei Stände vorliegen", () => {
    renderTab();
    expect(
      screen.getByRole("img", {
        name: "Erwartete und tatsächlich erhaltene Dividenden je Stichtag",
      }),
    ).toBeInTheDocument();
  });
});
