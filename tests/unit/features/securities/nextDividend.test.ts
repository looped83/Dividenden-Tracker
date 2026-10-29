import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import type { CalendarEvent } from "@/lib/calendar/types";
import { nextDividend } from "@/features/securities/nextDividend";

function payment(payDate: string, net: string): AnalyticsPayment {
  return {
    id: payDate,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "sec",
    depotId: "dep",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "ev",
    externalUid: "uid",
    eventType: "payment",
    eventState: "active",
    title: null,
    companyName: "Alpha",
    matchedCompanyName: "Alpha",
    reinvestSince: null,
    expectedAmount: null,
    sourcePortfolio: null,
    description: null,
    location: null,
    externalUrl: null,
    categories: [],
    date: "2026-11-14",
    endDate: null,
    startsAt: null,
    endsAt: null,
    isAllDay: true,
    ...overrides,
  };
}

const today = { year: 2026, month: 10, day: 17 };
const base = { securityName: "Alpha", today, todayIso: "2026-10-17" };

describe("nextDividend", () => {
  it("nimmt den fruehesten kommenden Zahltag des Kalenders", () => {
    const result = nextDividend({
      ...base,
      events: [
        // Gleiche Schreibweise: `matchedCompanyName` bleibt leer.
        event({ id: "a", date: "2026-12-14", matchedCompanyName: null }),
        event({
          id: "b",
          date: "2026-11-14",
          expectedAmount: Money.fromString("5.00", EUR),
        }),
        // Ex-Tag, abgesagt, vergangen und fremd zaehlen nicht.
        event({ id: "c", date: "2026-10-20", eventType: "ex_date" }),
        event({ id: "d", date: "2026-10-21", eventState: "cancelled" }),
        event({ id: "e", date: "2026-10-01" }),
        event({ id: "f", date: "2026-10-22", matchedCompanyName: "Beta" }),
        event({
          id: "g",
          date: "2026-10-23",
          companyName: "Beta",
          matchedCompanyName: null,
        }),
      ],
      own: [],
      payoutMonths: [],
    });
    expect(result).toEqual({
      source: "calendar",
      date: "2026-11-14",
      amount: Money.fromString("5.00", EUR),
    });
  });

  it("vermutet bei monatlichen Zahlern die letzte Dividende", () => {
    const result = nextDividend({
      ...base,
      events: [],
      own: [payment("2025-11-15", "60.00"), payment("2026-10-15", "73.38")],
      payoutMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    });
    expect(result).toMatchObject({ source: "estimate", year: 2026, month: 11 });
    expect(result?.amount?.toStringValue()).toBe("73.38");
  });

  it("vermutet sonst den Betrag desselben Monats im Vorjahr", () => {
    const result = nextDividend({
      ...base,
      events: [],
      own: [payment("2025-12-15", "236.00"), payment("2026-09-15", "257.00")],
      payoutMonths: [3, 6, 9, 12],
    });
    expect(result).toMatchObject({ source: "estimate", year: 2026, month: 12 });
    expect(result?.amount?.toStringValue()).toBe("236.00");
  });

  it("gibt ohne Kalender und ohne Plan nichts an", () => {
    expect(
      nextDividend({
        ...base,
        events: [],
        own: [payment("2026-09-15", "1.00")],
        payoutMonths: [],
      }),
    ).toBeNull();
  });
});
