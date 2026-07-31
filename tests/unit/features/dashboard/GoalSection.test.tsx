import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, RefDate, YearSelection } from "@/lib/statistics";
import type { Goal } from "@/lib/goals";

const goals: Goal[] = [];

// Die Zielsektion liest ihre Ziele über eine Query; hier zählt allein, welche
// davon sie zeigt — nicht, woher sie kommen.
vi.mock("@/features/goals/hooks", () => ({
  useGoals: () => ({ data: goals }),
}));

const { GoalSection } = await import("@/features/dashboard/GoalSection");

const TODAY: RefDate = { year: 2026, month: 7, day: 20 };

let seq = 0;
function goal(
  partial: Pick<Goal, "goalType" | "year" | "month"> & { title: string },
): Goal {
  seq += 1;
  return {
    id: `goal-${String(seq)}`,
    goalType: partial.goalType,
    year: partial.year,
    month: partial.month,
    targetAmount: Money.fromString("1000.00", EUR),
    currency: "EUR",
    title: partial.title,
    note: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function payment(payDate: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `pay-${String(seq)}`,
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

const PAYMENTS = [payment("2024-03-10", "300.00"), payment("2026-07-10", "500.00")];

function renderSection(selection: YearSelection, alleZiele: Goal[]) {
  goals.length = 0;
  goals.push(...alleZiele);
  return render(
    <MemoryRouter>
      <GoalSection payments={PAYMENTS} selection={selection} today={TODAY} />
    </MemoryRouter>,
  );
}

const JAHRESZIEL_2026 = goal({
  goalType: "annual",
  year: 2026,
  month: null,
  title: "Jahresziel 2026",
});
const JAHRESZIEL_2024 = goal({
  goalType: "annual",
  year: 2024,
  month: null,
  title: "Jahresziel 2024",
});
const MONATSZIEL_JULI_2026 = goal({
  goalType: "monthly",
  year: 2026,
  month: 7,
  title: "Monatsziel Juli 2026",
});

describe("GoalSection — zeigt nur Ziele des gewählten Zeitraums", () => {
  // Abgefragt wird die Überschrift der Karte, nicht irgendein Text: Die
  // Zielart-Marke trägt dieselbe Beschriftung („Jahresziel 2026"), und eine
  // Textsuche träfe beide.
  const karte = (titel: string) =>
    screen.queryByRole("heading", { name: titel, level: 3 });

  it("zeigt im laufenden Jahr Jahres- und Monatsziel", () => {
    renderSection(2026, [JAHRESZIEL_2026, JAHRESZIEL_2024, MONATSZIEL_JULI_2026]);
    expect(karte("Jahresziel 2026")).toBeInTheDocument();
    expect(karte("Monatsziel Juli 2026")).toBeInTheDocument();
    expect(karte("Jahresziel 2024")).not.toBeInTheDocument();
  });

  it("lässt das Monatsziel in einem anderen Jahr weg", () => {
    renderSection(2024, [JAHRESZIEL_2026, JAHRESZIEL_2024, MONATSZIEL_JULI_2026]);
    expect(karte("Jahresziel 2024")).toBeInTheDocument();
    // Juli 2026 gehört nicht zu 2024 — die Karte wäre eine Zahl aus einem
    // Zeitraum, den die Seite gerade nicht zeigt.
    expect(karte("Monatsziel Juli 2026")).not.toBeInTheDocument();
    expect(karte("Jahresziel 2026")).not.toBeInTheDocument();
  });

  it("zeigt dieselbe Karte wie die Zielseite", () => {
    // Die Übersicht hatte eine eigene, kürzere Karte; dasselbe Ziel sah an
    // zwei Stellen unterschiedlich aus.
    renderSection(2026, [JAHRESZIEL_2026, MONATSZIEL_JULI_2026]);
    expect(screen.getAllByText("Zielbetrag")).toHaveLength(2);
    expect(screen.getAllByText("Erhalten")).toHaveLength(2);
    // Unter dem Titel steht der Zeitfortschritt — nicht noch einmal die
    // Zielart, die der Titel bereits nennt.
    expect(screen.getByText(/% des Jahres vergangen$/)).toBeInTheDocument();
    expect(screen.getByText(/% des Monats vergangen$/)).toBeInTheDocument();
    // Genau einmal: die Überschrift. Die Zielart stand darunter ein zweites
    // Mal — der Titel nennt sie bereits.
    expect(screen.getAllByText("Jahresziel 2026")).toHaveLength(1);
  });

  it("nennt den Zeitraum nicht noch einmal unter dem Titel", () => {
    renderSection(2026, [JAHRESZIEL_2026]);
    expect(screen.queryByText("Jahr 2026")).not.toBeInTheDocument();
  });

  it('entfällt bei „Alle Jahre" ganz', () => {
    const { container } = renderSection("all", [JAHRESZIEL_2026, MONATSZIEL_JULI_2026]);
    expect(container).toBeEmptyDOMElement();
  });

  it("bietet ohne Jahresziel den Weg zum Anlegen", () => {
    renderSection(2025, [JAHRESZIEL_2026]);
    expect(screen.getByText(/Noch kein Jahresziel für 2025/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ziel anlegen" })).toBeInTheDocument();
  });
});
