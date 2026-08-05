import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, StatisticsFilter } from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { DevelopmentView } from "@/features/securities/DevelopmentTab";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";
import {
  EMPTY_PORTFOLIO_SERIES,
  type PortfolioSeries,
} from "@/features/securities/snapshots";

/**
 * Unterbereich „Entwicklung" des Depots (frueher: der Statistik).
 *
 * Geprueft wird die Darstellung ({@link DevelopmentView}) mit fertiger
 * Datenbasis — die Huelle daneben laedt sie nur und traegt den Assetfilter.
 *
 * Der Kern ist die Gegenueberstellung zweier **Zwoelfmonatszeitraeume**: die
 * erwartete Jahresdividende gegen das, was in den zwoelf Monaten bis zum
 * Stichtag tatsaechlich hereinkam. Ihre Differenz ist ein **Zuwachs**
 * (erwartet minus erhalten), keine Abweichung von einem Ziel — daran haengen
 * diese Tests, plus die Frage, was der Bereich zeigt, solange es nur einen
 * Stand gibt.
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
  heldSecurityIds: new Set(["sec-a", "sec-b"]),
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
  filter: Partial<StatisticsFilter> = {},
) {
  return render(
    <MemoryRouter>
      <DevelopmentView
        allPayments={payments}
        securities={
          new Map<string, EntityInfo>([
            ["sec-a", { name: "Alpha AG", archived: false }],
            ["sec-b", { name: "Beta SE", archived: false }],
            ["sec-c", { name: "Gamma GmbH", archived: false }],
          ])
        }
        filter={{ ...EMPTY_STATISTICS_FILTER, ...filter }}
        portfolio={portfolio}
      />
    </MemoryRouter>,
  );
}

describe("DevelopmentView", () => {
  it("verweist auf den Import, solange kein Depotstand vorliegt", () => {
    renderTab(EMPTY_PORTFOLIO_SERIES);
    expect(screen.getByText("Noch kein Depotstand importiert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zu den Assets" })).toHaveAttribute(
      "href",
      "/depot",
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

  it("rechnet den Zuwachs als erwartet minus erhalten", () => {
    // 50 € erwartet gegen 42 € erhalten sind **acht Euro mehr**, kein Minus:
    // Wer weiter investiert, hat die Ertragskraft des heutigen Depots
    // zwangslaeufig ueber dem, was mit kleinerem Bestand hereinkam. Andersherum
    // stuende dauerhaft eine rote Zahl fuer den Vorgang, der gut laeuft.
    renderTab();
    expect(screen.getByText(/^\+8,00/)).toBeInTheDocument();
  });

  it("misst die Wachstumsrate am Erhaltenen, nicht an der Erwartung", () => {
    // 8 von 42 sind 19,0 %. An der Erwartung gemessen waeren es 16,0 % — eine
    // Wachstumsrate bezieht sich aber auf den Wert, aus dem gewachsen wurde.
    renderTab();
    expect(
      screen.getByText(/\+19,0 % gegenüber den letzten zwölf Monaten/),
    ).toBeInTheDocument();
  });

  it("zeigt einen echten Rückgang weiterhin negativ", () => {
    // Weniger erwartet als erhalten heisst Verkauf, Kuerzung oder eine
    // Sonderausschuettung im Vorjahr — dann sagt das Minus die Wahrheit.
    renderTab({
      ...SERIES,
      latest: { ...SERIES.points[1], annualDividend: money("30.00") },
    });
    expect(screen.getByText(/^-12,00/)).toBeInTheDocument();
  });

  it("stellt je Asset erwartet und erhalten gegenüber", () => {
    renderTab();
    const zeile = screen.getByRole("row", { name: /Alpha AG/ });
    // Alpha: 40 € erwartet, 42 € erhalten — zwei Euro weniger als zuletzt.
    expect(within(zeile).getByText(/^40,00/)).toBeInTheDocument();
    expect(within(zeile).getByText(/^42,00/)).toBeInTheDocument();
    expect(within(zeile).getByText(/^-2,00/)).toBeInTheDocument();
  });

  it("führt auch Assets ohne Zahlung im Zeitraum auf", () => {
    // Beta ist neu im Depot: 10 € Erwartung, noch nichts gezahlt. Der volle
    // Betrag ist Zuwachs — genau das soll auffallen.
    renderTab();
    const zeile = screen.getByRole("row", { name: /Beta SE/ });
    expect(within(zeile).getByText(/^10,00/)).toBeInTheDocument();
    expect(within(zeile).getByText(/^\+10,00/)).toBeInTheDocument();
  });

  it("führt ein verkauftes Papier gar nicht mehr auf", () => {
    // Gamma hat gezahlt, steht aber nicht mehr im juengsten Stand. Auf die
    // Frage dieses Bereichs — waechst die Ertragskraft des *heutigen* Depots? —
    // hat es keine Antwort mehr; was es beigetragen hat, steht in der Historie.
    renderTab(SERIES, [payment("2026-03-01", "25.00", "sec-c")]);
    expect(screen.queryByRole("row", { name: /Gamma/ })).not.toBeInTheDocument();
  });

  it("lässt die Kacheln die volle Summe zeigen, auch mit verkauftem Papier", () => {
    // Die Tabelle zeigt nur Gehaltenes, die Kachel „Erhalten" weiterhin alles:
    // Sonst stuenden dort zwei verschieden zusammengesetzte Grundgesamtheiten
    // nebeneinander. 30 + 12 = 42 aus dem Bestand, dazu 25 von Gamma.
    renderTab(SERIES, [
      payment("2025-09-15", "30.00"),
      payment("2026-07-15", "12.00"),
      payment("2026-03-01", "25.00", "sec-c"),
    ]);
    expect(screen.getAllByText(/^67,00/).length).toBeGreaterThan(0);
  });

  it("lässt den Zuwachs offen, wenn die Quelle für ein gehaltenes Papier schweigt", () => {
    // Kein Betrag der Quelle heisst „unbekannt", nicht „null" — daraus zu
    // rechnen hiesse, das Schweigen als Zahl zu lesen.
    renderTab(
      { ...SERIES, expectedBySecurity: new Map(), heldSecurityIds: new Set(["sec-a"]) },
      [payment("2026-03-01", "25.00")],
    );
    const zeile = screen.getByRole("row", { name: /Alpha AG/ });
    expect(within(zeile).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("verwirft den Depotkontofilter, weil die Depotstände kein Konto kennen", () => {
    // Der Portfolio-Export fasst alle Depots zusammen. Angewandt traefe der
    // Filter nur die erhaltenen Zahlungen und liesse die erwarteten unberuehrt —
    // die Differenz waere still falsch. Die Zahlung liegt in „dep-1"; ein
    // Filter auf ein anderes Depot darf sie hier nicht verschwinden lassen.
    renderTab(SERIES, [payment("2026-07-15", "42.00")], { depotId: "dep-2" });
    expect(screen.getAllByText(/^42,00/).length).toBeGreaterThan(0);
  });

  it("verwirft den Jahresfilter, weil die Zeitachse die Stichtage sind", () => {
    renderTab(SERIES, [payment("2026-07-15", "42.00")], { year: 2024 });
    expect(screen.getAllByText(/^42,00/).length).toBeGreaterThan(0);
  });

  it("blendet die Aufteilung aus, wenn ein Asset gewählt ist", () => {
    // Eine Branche, ein Land, jeweils 100 % — eine Aussage, die aus der Auswahl
    // folgt statt aus den Daten.
    const mitAufteilung: PortfolioSeries = {
      ...SERIES,
      bySector: [
        {
          key: "Health Care",
          label: "Health Care",
          marketValue: money("1500.00"),
          annualDividend: money("50.00"),
          positions: 1,
        },
      ],
    };
    renderTab(mitAufteilung);
    expect(screen.getByText("Aufteilung nach Branche")).toBeInTheDocument();

    renderTab(mitAufteilung, undefined, { securityId: "sec-a" });
    expect(screen.getAllByText("Aufteilung nach Branche")).toHaveLength(1);
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
