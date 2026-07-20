import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";
import { computeGoalProgress, type Goal } from "@/lib/goals";
import { GoalCard } from "@/features/goals/GoalCard";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    goalType: "annual",
    year: 2027,
    month: null,
    targetAmount: Money.fromString("12000.00", EUR),
    currency: "EUR",
    title: null,
    note: null,
    createdAt: "2027-01-01T00:00:00Z",
    updatedAt: "2027-01-01T00:00:00Z",
    ...overrides,
  };
}

function payment(payDate: string, net: string): AnalyticsPayment {
  return {
    id: payDate,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "s",
    depotId: "d",
    paymentType: "regular",
    source: "manual",
    createdAt: "2027-01-01T00:00:00Z",
  };
}

const midYear: RefDate = { year: 2027, month: 7, day: 1 };

function renderCard(g: Goal, payments: AnalyticsPayment[], ref: RefDate = midYear) {
  const progress = computeGoalProgress(g, payments, ref);
  render(
    <MemoryRouter>
      <GoalCard progress={progress} onEdit={vi.fn()} onDelete={vi.fn()} />
    </MemoryRouter>,
  );
  return progress;
}

describe("GoalCard – Zustände", () => {
  it("aktives Ziel zeigt Fortschrittsbalken mit zugänglichem Wert", () => {
    renderCard(goal(), [payment("2027-03-01", "9000.00")]);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "75");
    expect(bar.getAttribute("aria-valuetext")).toMatch(/75,0 %/);
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getByText(/Noch .*3\.000,00.*€ bis zum Ziel/)).toBeInTheDocument();
  });

  it("übertroffenes Ziel begrenzt den Balken visuell auf 100 %", () => {
    renderCard(goal(), [payment("2027-03-01", "13200.00")]);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar.getAttribute("aria-valuetext")).toMatch(/110,0 %/);
    expect(screen.getByText("Übertroffen")).toBeInTheDocument();
    expect(screen.getByText(/übertroffen/)).toBeInTheDocument();
  });

  it("bevorstehendes Ziel zeigt Beginn statt Fortschritt", () => {
    renderCard(goal({ year: 2030 }), [], midYear);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Beginnt am 01.01.2030")).toBeInTheDocument();
    expect(screen.getByText("Bevorstehend")).toBeInTheDocument();
  });

  it("beendetes, nicht erreichtes Ziel wird als solches gekennzeichnet", () => {
    renderCard(goal({ year: 2020 }), [payment("2020-03-01", "5000.00")]);
    expect(screen.getByText("Nicht erreicht")).toBeInTheDocument();
  });
});
