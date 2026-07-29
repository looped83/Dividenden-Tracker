import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import { MONTH_NAMES_DE_SHORT } from "@/lib/statistics";
import { PaymentsHeatmap } from "@/features/statistics/components/charts";

/**
 * Zahlungs-Heatmap.
 *
 * Farbe allein traegt hier keine Aussage: Jede Zelle muss ihren Wert auch als
 * Text hergeben. Die Beschriftung stand frueher in einem `aria-label` auf einem
 * schlichten `div` — dort ist das Attribut unzulaessig und wurde schlicht nicht
 * vorgelesen. Monate ohne Drill-down waren damit stumm.
 */

function cell(month: number, net: string, count: number) {
  const money = Money.fromString(net, EUR);
  return { month, net: money, count, value: money.toChartNumber() };
}

function renderHeatmap() {
  return render(
    <MemoryRouter>
      <PaymentsHeatmap
        rows={[
          {
            year: 2026,
            cells: [
              cell(1, "100.00", 2),
              cell(2, "0.00", 0),
              ...Array.from({ length: 10 }, (_, index) => cell(index + 3, "0.00", 0)),
            ],
          },
        ]}
        maxValue={100}
        monthLabels={MONTH_NAMES_DE_SHORT}
        hrefOf={(year, month) => `/eingaenge?year=${String(year)}&month=${String(month)}`}
      />
    </MemoryRouter>,
  );
}

describe("PaymentsHeatmap", () => {
  it("nennt einen Monat ohne Zahlungen als Text", () => {
    renderHeatmap();
    expect(screen.getByText("Feb 2026: 0,00 €, 0 Zahlungen")).toBeInTheDocument();
  });

  it("macht einen Monat mit Zahlungen bedienbar und benennt ihn", () => {
    renderHeatmap();
    // Als Muster, weil `formatMoney` ein schmales geschuetztes Leerzeichen vor
    // das Euro-Zeichen setzt.
    const januar = screen.getByRole("button", {
      name: /^Jan 2026: 100,00\s€, 2 Zahlungen$/,
    });
    expect(januar).toHaveAttribute("tabindex", "0");
  });

  it("laesst einen Monat ohne Zahlungen unbedienbar", () => {
    // Ein Ziel, das eine leere Liste zeigt, waere eine Sackgasse.
    renderHeatmap();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
