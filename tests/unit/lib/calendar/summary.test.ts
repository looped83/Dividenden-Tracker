import { describe, expect, it } from "vitest";
import {
  buildCalendarSummary,
  daysBetween,
  expectedTotalOf,
} from "@/lib/calendar/summary";
import { EUR, Money, toCurrencyCode } from "@/lib/money";
import { dateTile, relativeDayLabel } from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";

const HEUTE = "2026-08-05";

function betrag(value: string, currency = EUR): Money {
  return Money.fromString(value, currency);
}

function event(
  id: string,
  date: string,
  title: string,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    externalUid: `uid-${id}`,
    eventType: "payment",
    eventState: "active",
    title,
    companyName: title,
    matchedCompanyName: null,
    expectedAmount: null,
    sourcePortfolio: null,
    description: null,
    location: null,
    externalUrl: null,
    categories: [],
    date,
    endDate: null,
    startsAt: null,
    endsAt: null,
    isAllDay: true,
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("zählt ganze Kalendertage, auch über Monats- und Jahresgrenzen", () => {
    expect(daysBetween("2026-08-05", "2026-08-05")).toBe(0);
    expect(daysBetween("2026-08-05", "2026-08-08")).toBe(3);
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-08-05", "2026-08-02")).toBe(-3);
  });

  it("bleibt über die Sommerzeitumstellung hinweg richtig", () => {
    // 25.10.2026 ist die Rückstellung; die Tage bleiben ganze Tage.
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("buildCalendarSummary", () => {
  const bestand = [
    event("1", "2026-08-02", "Vergangen AG"),
    event("2", "2026-08-05", "Heute AG"),
    event("3", "2026-08-13", "Apple Inc."),
    event("4", "2026-08-13", "Allianz SE"),
    event("5", "2026-09-20", "Apple Inc."),
    event("6", "2026-11-01", "Weit weg AG"),
  ];

  it("findet den nächsten Zahltag mit allen Terminen dieses Tages", () => {
    const summary = buildCalendarSummary(bestand, HEUTE);

    expect(summary.next?.date).toBe("2026-08-05");
    expect(summary.next?.daysAway).toBe(0);
    expect(summary.next?.events).toHaveLength(1);
  });

  it("fasst mehrere Termine desselben nächsten Tages zusammen", () => {
    const summary = buildCalendarSummary(
      [event("3", "2026-08-13", "Apple Inc."), event("4", "2026-08-13", "Allianz SE")],
      HEUTE,
    );

    expect(summary.next?.daysAway).toBe(8);
    expect(summary.next?.events.map((e) => e.title)).toEqual([
      "Apple Inc.",
      "Allianz SE",
    ]);
  });

  it("zählt den laufenden Monat vollständig, die 30 Tage ab heute", () => {
    const summary = buildCalendarSummary(bestand, HEUTE);

    // August: 02., 05., 13., 13. — auch der bereits vergangene 02.
    expect(summary.thisMonth.count).toBe(4);
    // 05.08. bis 04.09.: 05., 13., 13.
    expect(summary.next30Days.count).toBe(3);
    expect(summary.upcoming).toBe(5);
  });

  it("zählt Unternehmen ohne Dubletten", () => {
    // Apple kommt am 13.08. und am 20.09. vor und zählt einmal.
    expect(buildCalendarSummary(bestand, HEUTE).companies).toBe(4);
  });

  it("lässt abgesagte Termine aus allen Zahlen heraus", () => {
    const mitAbsage = [
      event("a", "2026-08-06", "Abgesagt AG", { eventState: "cancelled" }),
      event("b", "2026-08-10", "Echte AG"),
    ];

    const summary = buildCalendarSummary(mitAbsage, HEUTE);

    expect(summary.next?.date).toBe("2026-08-10");
    expect(summary.upcoming).toBe(1);
    expect(summary.companies).toBe(1);
    expect(summary.thisMonth.count).toBe(1);
  });

  it("kommt ohne kommende Termine zurecht", () => {
    const summary = buildCalendarSummary([event("1", "2026-01-01", "Alt AG")], HEUTE);

    expect(summary.next).toBeNull();
    expect(summary.upcoming).toBe(0);
    expect(summary.companies).toBe(0);
    expect(summary.next30Days.count).toBe(0);
  });
});

describe("expectedTotalOf", () => {
  it("summiert die erwarteten Betraege exakt", () => {
    const total = expectedTotalOf([
      event("1", "2026-08-13", "A", { expectedAmount: betrag("51.37") }),
      event("2", "2026-08-14", "B", { expectedAmount: betrag("0.03") }),
      event("3", "2026-08-15", "C", { expectedAmount: betrag("12.60") }),
    ]);

    // 51,37 + 0,03 + 12,60 — mit Fliesskommazahlen ergaebe das 64.00000000000001.
    expect(total.total?.toStringValue()).toBe("64.00");
    expect(total.withAmount).toBe(3);
    expect(total.count).toBe(3);
    expect(total.mixedCurrencies).toBe(false);
  });

  it("zaehlt Termine ohne Betrag mit, ohne sie als Null zu verrechnen", () => {
    const total = expectedTotalOf([
      event("1", "2026-08-13", "A", { expectedAmount: betrag("10.00") }),
      event("2", "2026-08-14", "B"),
    ]);

    expect(total.total?.toStringValue()).toBe("10.00");
    expect(total.withAmount).toBe(1);
    expect(total.count).toBe(2);
  });

  it("addiert verschiedene Waehrungen nicht", () => {
    const total = expectedTotalOf([
      event("1", "2026-08-13", "A", { expectedAmount: betrag("10.00") }),
      event("2", "2026-08-14", "B", {
        expectedAmount: betrag("10.00", toCurrencyCode("USD")),
      }),
    ]);

    expect(total.total).toBeNull();
    expect(total.mixedCurrencies).toBe(true);
    expect(total.withAmount).toBe(2);
  });

  it("liefert ohne jeden Betrag keine Summe", () => {
    const total = expectedTotalOf([event("1", "2026-08-13", "A")]);

    expect(total.total).toBeNull();
    expect(total.withAmount).toBe(0);
    expect(total.mixedCurrencies).toBe(false);
  });

  it("laesst abgesagte Termine aus der Monatssumme heraus", () => {
    const summary = buildCalendarSummary(
      [
        event("1", "2026-08-13", "A", { expectedAmount: betrag("10.00") }),
        event("2", "2026-08-14", "B", {
          expectedAmount: betrag("99.00"),
          eventState: "cancelled",
        }),
      ],
      HEUTE,
    );

    expect(summary.thisMonth.total?.toStringValue()).toBe("10.00");
  });
});

describe("Kachelbeschriftungen", () => {
  it("zerlegt ein Datum in Tageszahl und kurzen Monat", () => {
    expect(dateTile("2026-08-13")).toEqual({ day: "13", month: "Aug" });
    expect(dateTile("2026-03-01")).toEqual({ day: "1", month: "Mär" });
  });

  it("benennt den Abstand in Alltagssprache", () => {
    expect(relativeDayLabel(0)).toBe("heute");
    expect(relativeDayLabel(1)).toBe("morgen");
    expect(relativeDayLabel(2)).toBe("übermorgen");
    expect(relativeDayLabel(9)).toBe("in 9 Tagen");
    expect(relativeDayLabel(1200)).toBe("in 1.200 Tagen");
    expect(relativeDayLabel(-3)).toBe("vor 3 Tagen");
  });
});
