import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import {
  withEffectiveDates,
  type AnalyticsPayment,
  type YearSelection,
} from "@/lib/statistics";
import type { RefDate } from "@/lib/statistics/dates";
import type { Goal } from "@/lib/goals";

const goals: Goal[] = [];

// Der Kopf liest die Ziele über eine Query; hier zählt allein, welche davon er
// zeigt — nicht, woher sie kommen.
vi.mock("@/features/goals/hooks", () => ({
  useGoals: () => ({ data: goals }),
}));

const { DashboardHero } = await import("@/features/dashboard/DashboardHero");

const TODAY: RefDate = { year: 2026, month: 7, day: 20 };

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

function goal(
  partial: Pick<Goal, "goalType" | "year" | "month">,
  target = "1000.00",
): Goal {
  seq += 1;
  return {
    id: `goal-${String(seq)}`,
    goalType: partial.goalType,
    year: partial.year,
    month: partial.month,
    targetAmount: Money.fromString(target, EUR),
    currency: "EUR",
    title: null,
    note: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function renderHero(
  selection: YearSelection,
  payments: AnalyticsPayment[],
  alleZiele: Goal[] = [],
) {
  goals.length = 0;
  goals.push(...alleZiele);
  return render(
    <MemoryRouter>
      <DashboardHero payments={payments} selection={selection} today={TODAY} />
    </MemoryRouter>,
  );
}

const MONATSLINK = { name: "Zahlungen des aktuellen Monats anzeigen" };

describe("DashboardHero — eine Hauptzahl statt Kachelraster", () => {
  it("zeigt die Summe des gewählten Jahres, nicht die aller Jahre", () => {
    // Die Gesamtsumme steht als Zeile „Gesamt seit …" am Seitenende.
    renderHero(2026, [
      payment("2026-03-10", "50.00"),
      payment("2020-05-10", "70.00", "sec-b"),
    ]);
    expect(
      screen.getByRole("link", { name: "Zahlungen 2026 anzeigen" }),
    ).toHaveTextContent(/50,00\s?€/);
    expect(screen.queryByText(/120,00\s?€/)).not.toBeInTheDocument();
  });

  it("vergleicht das laufende Jahr mit dem gleichen Zeitraum des Vorjahres", () => {
    // Bis 20. Juli: 2026 = 150 €, 2025 = 100 € (die Zahlung im Dezember 2025
    // liegt nach dem Stichtag und zählt nicht).
    renderHero(2026, [
      payment("2026-03-10", "150.00"),
      payment("2025-03-10", "100.00"),
      payment("2025-12-10", "400.00"),
    ]);
    expect(screen.getByText("+50,0 %", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/\+50,00\s?€ ggü\. Vorjahreszeitraum/)).toBeInTheDocument();
  });

  it("zeigt im laufenden Jahr Monat, Durchschnitt und besten Monat in dieser Folge", () => {
    renderHero(2026, [payment("2026-03-10", "50.00"), payment("2024-05-10", "70.00")]);
    const labels = screen.getAllByRole("term").map((term) => term.textContent);
    expect(labels).toEqual(["Juli", "Ø pro Monat", "Bester Monat"]);
  });

  it("zählt eine vorgezogene Zahlung zum aktuellen Ausschüttungsmonat (§10)", () => {
    // Plan Juli, Zahlung bereits am 25. Juni eingetroffen -> zählt zum Juli.
    const payments = withEffectiveDates(
      [payment("2026-06-25", "80.00", "sec-plan")],
      new Map([["sec-plan", [7]]]),
    );
    renderHero(2026, payments);
    expect(screen.getByRole("link", MONATSLINK)).toHaveTextContent(/80,00\s?€/);
  });

  it("lässt den aktuellen Monat in einem anderen Jahr weg und nennt die Zahlungen", () => {
    renderHero(2024, [
      payment("2024-03-10", "50.00", "sec-a"),
      payment("2024-04-10", "30.00", "sec-b"),
      payment("2026-07-10", "80.00"),
    ]);
    expect(screen.queryByRole("link", MONATSLINK)).not.toBeInTheDocument();
    const labels = screen.getAllByRole("term").map((term) => term.textContent);
    expect(labels).toEqual(["Ø pro Monat", "Zahlungen", "Bester Monat"]);
    expect(screen.getByText("2 Unternehmen")).toBeInTheDocument();
  });

  it('verzichtet bei „Alle Jahre" auf den Durchschnitt pro Monat', () => {
    renderHero("all", [payment("2026-03-10", "50.00")]);
    expect(screen.queryByText("Ø pro Monat")).not.toBeInTheDocument();
    expect(screen.getByRole("link", MONATSLINK)).toBeInTheDocument();
  });
});

describe("DashboardHero — Ziele im Kontext", () => {
  const PAYMENTS = [payment("2024-03-10", "300.00"), payment("2026-07-10", "500.00")];
  const JAHRESZIEL_2026 = goal({ goalType: "annual", year: 2026, month: null });
  const JAHRESZIEL_2024 = goal({ goalType: "annual", year: 2024, month: null });
  const MONATSZIEL_JULI = goal({ goalType: "monthly", year: 2026, month: 7 }, "2000.00");

  it("zeigt das Jahresziel des gewählten Jahres als Balken mit Restbetrag", () => {
    renderHero(2026, PAYMENTS, [JAHRESZIEL_2024, JAHRESZIEL_2026]);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/vom Jahresziel 1\.000,00\s?€/)).toBeInTheDocument();
    expect(screen.getByText(/noch 500,00\s?€/)).toBeInTheDocument();
  });

  it("nennt das Monatsziel im Feld des Monats, nur im laufenden Jahr", () => {
    const { unmount } = renderHero(2026, PAYMENTS, [MONATSZIEL_JULI]);
    expect(screen.getByText("25 % vom Ziel")).toBeInTheDocument();
    unmount();

    renderHero(2024, PAYMENTS, [JAHRESZIEL_2024, MONATSZIEL_JULI]);
    expect(screen.queryByText(/vom Ziel$/)).not.toBeInTheDocument();
  });

  it('zeigt bei „Alle Jahre" kein Ziel', () => {
    renderHero("all", PAYMENTS, [JAHRESZIEL_2026, MONATSZIEL_JULI]);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Jahresziel/)).not.toBeInTheDocument();
  });

  it("bietet ohne Jahresziel den Weg zum Anlegen", () => {
    renderHero(2025, PAYMENTS, [JAHRESZIEL_2026]);
    expect(
      screen.getByRole("link", { name: "Jahresziel für 2025 festlegen" }),
    ).toHaveAttribute("href", "/ziele");
  });
});
