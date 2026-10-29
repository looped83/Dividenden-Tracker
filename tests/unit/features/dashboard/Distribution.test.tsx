import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import { Distribution } from "@/features/dashboard/Distributions";
import type { EntityInfo } from "@/features/dashboard/format";

let seq = 0;
function payment(security: string, depot: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `id-${String(seq)}`,
    payDate: "2026-03-10",
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: security,
    depotId: depot,
    paymentType: "regular",
    source: "manual",
    createdAt: "2026-03-10T10:00:00Z",
  };
}

const entities = (names: string[]): Map<string, EntityInfo> =>
  new Map(names.map((name) => [name, { name, archived: false }]));

const SECURITIES = entities(["A", "B", "C", "D", "E", "F"]);

function renderSection(payments: AnalyticsPayment[]) {
  return render(
    <MemoryRouter>
      <Distribution periodPayments={payments} selection={2026} securities={SECURITIES} />
    </MemoryRouter>,
  );
}

describe("Distribution", () => {
  it("zeigt die fünf stärksten Assets mit „Alle“ im Kopf, ohne Umschalter", () => {
    renderSection([
      payment("A", "Depot 1", "60.00"),
      payment("B", "Depot 1", "50.00"),
      payment("C", "Depot 2", "40.00"),
      payment("D", "Depot 2", "30.00"),
      payment("E", "Depot 2", "20.00"),
      payment("F", "Depot 2", "10.00"),
    ]);
    expect(screen.getByRole("heading", { name: "Verteilung" })).toBeInTheDocument();
    const assets = screen.getByRole("list", { name: "Top-Assets nach Nettodividende" });
    expect(assets.querySelectorAll("li")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Alle" })).toHaveAttribute(
      "href",
      "/statistiken/unternehmen?year=2026",
    );
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("zeigt ohne Zahlungen keinen Link", () => {
    renderSection([]);
    expect(
      screen.getByText("Keine Assets im ausgewählten Zeitraum."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Alle" })).not.toBeInTheDocument();
  });
});
