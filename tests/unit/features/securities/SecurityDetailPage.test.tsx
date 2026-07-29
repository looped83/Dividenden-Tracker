import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";

/**
 * Detailseite eines Unternehmens.
 *
 * Geprueft wird vor allem, dass die Seite **keine eigene Aggregation**
 * mitbringt: Ihre Zahlen entstehen aus derselben Analytics-Schicht wie
 * Uebersicht und Statistik. Weicht hier etwas ab, laufen zwei Wahrheiten
 * auseinander — genau das soll die gemeinsame Datenquelle verhindern.
 */

const SECURITY_ID = "sec-a";

let seq = 0;
function payment(
  payDate: string,
  net: string,
  securityId = SECURITY_ID,
): AnalyticsPayment {
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

const payments: AnalyticsPayment[] = [
  payment("2024-03-15", "100.00"),
  payment("2024-09-15", "120.00"),
  payment("2025-03-15", "150.00"),
  // Fremdes Unternehmen — darf in keiner Kennzahl auftauchen.
  payment("2025-04-15", "999.00", "sec-b"),
];

const securities = [
  {
    id: SECURITY_ID,
    name: "Alpha AG",
    ticker: "ALP",
    isin: "DE0001234567",
    wkn: null,
    country: "DE",
    sector: null,
    currency: "EUR",
    note: null,
    data_quality: "incomplete",
    default_depot_id: null,
    payout_months: [3, 9],
    archived_at: null,
  },
];

vi.mock("@/features/statistics/hooks", () => ({
  useStatisticsData: () => ({ payments, isLoading: false }),
}));
vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({ data: securities, isLoading: false }),
}));
vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({ data: [{ id: "dep-1", name: "Hauptdepot", archived_at: null }] }),
}));

const { SecurityDetailPage } = await import("@/features/securities/SecurityDetailPage");

function renderPage(id = SECURITY_ID) {
  return render(
    <MemoryRouter initialEntries={[`/unternehmen/${id}`]}>
      <Routes>
        <Route path="/unternehmen/:id" element={<SecurityDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SecurityDetailPage", () => {
  it("nennt das Unternehmen in der Ueberschrift", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Alpha AG/ })).toBeInTheDocument();
  });

  it("rechnet nur die Zahlungen dieses Unternehmens", () => {
    renderPage();
    // 100 + 120 + 150 = 370; die 999 des anderen Unternehmens bleibt draussen.
    expect(screen.getByText("370,00 €")).toBeInTheDocument();
    expect(screen.queryByText("999,00 €")).not.toBeInTheDocument();
  });

  it("zaehlt die Eingaenge", () => {
    renderPage();
    expect(screen.getByText("3 Eingänge")).toBeInTheDocument();
  });

  it("weist den groessten Eingang aus", () => {
    renderPage();
    // Der Betrag steht sowohl in der Kennzahlkarte als auch in der Liste der
    // letzten Eingaenge — beide Vorkommen sind richtig.
    expect(screen.getAllByText("150,00 €").length).toBeGreaterThan(0);
    const card = screen.getByText("Größter Eingang").closest("div")?.parentElement;
    if (!card) throw new Error("Kennzahlkarte nicht gefunden.");
    expect(within(card).getByText("150,00 €")).toBeInTheDocument();
  });

  it("fuehrt von jedem Jahr in die gefilterte Zahlungsliste", () => {
    renderPage();
    // Die Datentabelle des Diagramms traegt die Drill-down-Ziele.
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(`/eingaenge?security=${SECURITY_ID}&year=2024`);
    expect(hrefs).toContain(`/eingaenge?security=${SECURITY_ID}&year=2025`);
  });

  it("zeigt den Ausschuettungsplan und kennzeichnet die geplanten Monate", () => {
    renderPage();
    // Alle zwoelf Monate stehen da; geplante sind fuer Hilfsmittel als solche
    // ausgezeichnet, nicht nur farblich (Farbe allein traegt keine Aussage).
    expect(screen.getByText("Mär")).toBeInTheDocument();
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getAllByText("Geplant:")).toHaveLength(2);
    expect(screen.getAllByText("Nicht geplant:")).toHaveLength(10);
  });

  it("weist auf unvollstaendige Stammdaten hin", () => {
    renderPage();
    expect(screen.getByText(/Stammdaten sind unvollständig/)).toBeInTheDocument();
  });

  it("verlinkt die letzten Eingaenge auf ihre Detailseite", () => {
    renderPage();
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs.some((href) => href?.startsWith("/eingaenge/pay-"))).toBe(true);
  });

  it("meldet ein unbekanntes Unternehmen, statt eine leere Seite zu zeigen", () => {
    renderPage("gibt-es-nicht");
    expect(screen.getByText("Unternehmen nicht gefunden")).toBeInTheDocument();
  });
});
