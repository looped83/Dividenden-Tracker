import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import { withEffectiveDates, type AnalyticsPayment } from "@/lib/statistics";
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

/** Prueft, dass die Beschriftungen in genau dieser Folge im Dokument stehen. */
function erwarteReihenfolge(labels: string[]) {
  const elemente = labels.map((label) => screen.getByText(label));
  for (let index = 1; index < elemente.length; index += 1) {
    const folgt =
      elemente[index - 1].compareDocumentPosition(elemente[index]) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(
      folgt,
      `${labels[index]} steht nicht hinter ${labels[index - 1]}`,
    ).toBeTruthy();
  }
}

describe("KpiCards (Render-Smoke)", () => {
  it("zeigt die Gesamtsumme aller Jahre nicht als Kachel", () => {
    // Sie steht in der historischen Uebersicht am Seitenende; oben zaehlt der
    // gewaehlte Zeitraum (hoechstens vier primaere Kennzahlen).
    renderCards(2026, [
      payment("2026-03-10", "50.00"),
      payment("2020-05-10", "70.00", "sec-b"),
    ]);
    expect(screen.queryByText("Dividenden gesamt")).not.toBeInTheDocument();
    expect(screen.queryByText(/120,00\s?€/)).not.toBeInTheDocument();
  });

  it("zeigt bei Einzeljahr die Ø-pro-Monat-Karte, bei 'Alle Jahre' nicht", () => {
    const data = [payment("2026-03-10", "50.00")];
    const single = renderCards(2026, data);
    expect(screen.getByText("Ø pro Monat")).toBeInTheDocument();
    single.unmount();

    renderCards("all", data);
    expect(screen.queryByText("Ø pro Monat")).not.toBeInTheDocument();
  });

  it("zählt eine vorgezogene Zahlung zum aktuellen Ausschüttungsmonat (§10)", () => {
    // Plan Juli, Zahlung bereits am 25. Juni eingetroffen -> zählt zum Juli.
    const payments = withEffectiveDates(
      [payment("2026-06-25", "80.00", "sec-plan")],
      new Map([["sec-plan", [7]]]),
    );
    renderCards(2026, payments);
    expect(
      screen.getByRole("link", { name: "Zahlungen des aktuellen Monats anzeigen" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/80,00\s?€/).length).toBeGreaterThan(0);
  });

  it("verzichtet auf die Monatskachel, wenn ein anderes Jahr gewählt ist", () => {
    const payments = [payment("2024-03-10", "50.00"), payment("2026-07-10", "80.00")];
    // Laufendes Jahr: Der aktuelle Monat gehört zum Zeitraum.
    const { unmount } = renderCards(2026, payments);
    expect(
      screen.getByRole("link", { name: "Zahlungen des aktuellen Monats anzeigen" }),
    ).toBeInTheDocument();
    unmount();

    // 2024: Juli 2026 läge außerhalb dessen, was die Seite gerade zeigt.
    renderCards(2024, payments);
    expect(
      screen.queryByRole("link", { name: "Zahlungen des aktuellen Monats anzeigen" }),
    ).not.toBeInTheDocument();
  });

  it("ordnet die vier Kacheln vom gewählten Zeitraum zu den Ableitungen", () => {
    renderCards(2026, [payment("2026-03-10", "50.00"), payment("2024-05-10", "70.00")]);
    erwarteReihenfolge(["Dividenden 2026", "Juli 2026", "Bester Monat", "Ø pro Monat"]);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("zeigt im laufenden Jahr keine Zahl der Zahlungen", () => {
    renderCards(2026, [
      payment("2026-03-10", "50.00", "sec-a"),
      payment("2026-04-10", "30.00", "sec-b"),
    ]);
    expect(screen.queryByText("2 Zahlungen")).not.toBeInTheDocument();
    expect(screen.queryByText("Zahlungen 2026")).not.toBeInTheDocument();
  });

  it("füllt in einem anderen Jahr die vierte Kachel mit Zahlungen und Herkunft", () => {
    renderCards(2024, [
      payment("2024-03-10", "50.00", "sec-a"),
      payment("2024-04-10", "30.00", "sec-b"),
    ]);
    erwarteReihenfolge([
      "Dividenden 2024",
      "Bester Monat",
      "Ø pro Monat",
      "Zahlungen 2024",
    ]);
    expect(screen.getByText("2 Unternehmen")).toBeInTheDocument();
    expect(screen.getByText("1 Depot")).toBeInTheDocument();
  });
});
