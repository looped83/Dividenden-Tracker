import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { CompaniesTab } from "@/features/statistics/CompaniesTab";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";
import type { StatisticsContext } from "@/features/statistics/context";
import { setViewportWide } from "../../support/viewport";

let seq = 0;
function p(securityId: string, payDate: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `id-${String(seq)}`,
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

const PAYMENTS = [p("sec-a", "2025-03-10", "100.00"), p("sec-b", "2025-04-10", "300.00")];

function renderCompanies(payments: AnalyticsPayment[] = PAYMENTS) {
  const context: StatisticsContext = {
    payments,
    allPayments: payments,
    securities: new Map<string, EntityInfo>([
      ["sec-a", { name: "Alpha AG", archived: false }],
      ["sec-b", { name: "Beta AG", archived: true }],
    ]),
    depots: new Map<string, EntityInfo>([
      ["dep-1", { name: "Hauptdepot", archived: false }],
    ]),
    filter: EMPTY_STATISTICS_FILTER,
  };
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route index element={<CompaniesTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Zeilen der Unternehmensstatistik (die Kachel darüber ist keine Tabelle). */
function tableNames() {
  return within(screen.getByRole("table"))
    .getAllByRole("link")
    .map((link) => link.textContent);
}

// Die Tabelle ab `md`; die Listenfassung des Telefons prueft StatTable.test.tsx.
beforeEach(() => {
  setViewportWide(true);
});

describe("CompaniesTab", () => {
  it("blendet archivierte Assets in der Statistik zunächst aus", () => {
    renderCompanies();
    expect(tableNames()).toEqual(["Alpha AG"]);
  });

  it("blendet archivierte Assets auf Wunsch ein", () => {
    renderCompanies();
    fireEvent.click(screen.getByLabelText("Archivierte anzeigen"));
    expect(tableNames()).toEqual(["Beta AG", "Alpha AG"]);
  });

  it("führt in der Rangliste nur aktive Assets", () => {
    renderCompanies();
    // „Beta AG" zahlte mehr (300 € gegen 100 €) und stand deshalb ganz oben —
    // als geschlossene Position verdrängte sie die laufenden Zahler.
    const ranking = screen.getByLabelText("Aktive Assets nach Nettodividende");
    expect(within(ranking).getByText("Alpha AG")).toBeInTheDocument();
    expect(within(ranking).queryByText("Beta AG")).not.toBeInTheDocument();
  });

  it("sagt es, wenn die Rangliste ohne archivierte leer bliebe", () => {
    renderCompanies([p("sec-b", "2025-04-10", "300.00")]);
    expect(screen.getByText(/Kein aktives Asset in dieser Auswahl/)).toBeInTheDocument();
  });

  it("erklärt eine leere Tabelle, wenn nur archivierte Assets übrig sind", () => {
    renderCompanies([p("sec-b", "2025-04-10", "300.00")]);
    expect(
      screen.getByText(/Nur archivierte Assets in dieser Auswahl/),
    ).toBeInTheDocument();
  });
});

describe("Spalten der Statistik je Asset", () => {
  it("fasst erste und letzte Zahlung zu einem Zeitraum zusammen", () => {
    renderCompanies([
      p("sec-a", "2025-03-10", "100.00"),
      p("sec-a", "2025-09-12", "120.00"),
    ]);

    // Zwei Spalten fuer zwei Daten liessen die Tabelle rechts aus dem Bild
    // laufen; als Zeitraum stehen beide weiterhin da.
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: /Zeitraum/ }),
    ).toBeInTheDocument();
    expect(within(table).getByText("10.03.2025 – 12.09.2025")).toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: /Erste Zahlung/ }),
    ).not.toBeInTheDocument();
  });

  it("nennt einen einzelnen Tag nur einmal", () => {
    renderCompanies([p("sec-a", "2025-03-10", "100.00")]);

    expect(within(screen.getByRole("table")).getByText("10.03.2025")).toBeInTheDocument();
  });
});

describe("CompaniesTab auf dem Telefon", () => {
  beforeEach(() => {
    setViewportWide(false);
  });

  it("zeigt eine Rangliste mit Anteil statt Balken und Tabelle untereinander", () => {
    renderCompanies([
      p("sec-a", "2025-03-10", "100.00"),
      p("sec-a", "2025-06-10", "200.00"),
      p("sec-c", "2025-04-10", "100.00"),
    ]);

    // Die zweite Darstellung derselben Summen entfaellt: eine Liste, keine
    // Rangbalken darueber.
    expect(
      screen.queryByRole("list", { name: "Aktive Assets nach Nettodividende" }),
    ).not.toBeInTheDocument();
    const liste = screen.getByRole("list", { name: "Kennzahlen je Asset" });
    const alpha = within(liste).getByText("Alpha AG").closest("li");
    if (!alpha) throw new Error("Zeile nicht gefunden.");
    // 300 von 400 € — Anteil am Balkenende, darunter eine Zusatzzeile.
    expect(alpha).toHaveTextContent("75,0 %");
    expect(alpha).toHaveTextContent(/2 Dividenden · Ø 150,00\s€/);
  });
});

describe("Umschalter der Aufteilung", () => {
  it("wechselt zu den Depotkonten und behaelt den Filter", () => {
    setViewportWide(false);
    const context: StatisticsContext = {
      payments: PAYMENTS,
      allPayments: PAYMENTS,
      securities: new Map<string, EntityInfo>([
        ["sec-a", { name: "Alpha AG", archived: false }],
      ]),
      depots: new Map<string, EntityInfo>([
        ["dep-1", { name: "Hauptdepot", archived: false }],
      ]),
      filter: { ...EMPTY_STATISTICS_FILTER, year: 2025 },
    };
    render(
      <MemoryRouter initialEntries={["/statistiken/unternehmen?year=2025"]}>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route path="/statistiken/unternehmen" element={<CompaniesTab />} />
            <Route path="/statistiken/depots" element={<LocationProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("radio", { name: "Assets" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Depots" }));
    expect(screen.getByTestId("ort")).toHaveTextContent("/statistiken/depots?year=2025");
  });
});

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="ort">{`${pathname}${search}`}</p>;
}
