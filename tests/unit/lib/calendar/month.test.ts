import { describe, expect, it } from "vitest";
import { addDays, buildMonthGrid, shiftMonth, weekdayIndex } from "@/lib/calendar/month";
import { buildAgenda } from "@/lib/calendar/agenda";
import { dayCellLabel, lastSyncLabel, spokenDate } from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";

function event(id: string, date: string, title: string): CalendarEvent {
  return {
    id,
    externalUid: `uid-${id}`,
    eventType: "payment",
    eventState: "active",
    title,
    description: null,
    location: null,
    externalUrl: null,
    categories: [],
    date,
    endDate: null,
    startsAt: null,
    endsAt: null,
    isAllDay: true,
  };
}

describe("Kalenderarithmetik", () => {
  it("zaehlt Wochentage ab Montag", () => {
    // 03.08.2026 ist ein Montag, 09.08.2026 ein Sonntag.
    expect(weekdayIndex("2026-08-03")).toBe(0);
    expect(weekdayIndex("2026-08-09")).toBe(6);
  });

  it("verschiebt Kalendertage ueber Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    // Schaltjahr: 2028 hat einen 29. Februar.
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("verschiebt Monate ueber das Jahresende", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 8, 5)).toEqual({ year: 2027, month: 1 });
  });
});

describe("buildMonthGrid", () => {
  it("beginnt jede Woche am Montag und fuellt mit Nachbartagen auf", () => {
    const grid = buildMonthGrid(2026, 8);

    expect(grid.weeks[0][0].date).toBe("2026-07-27");
    expect(grid.weeks[0][0].inMonth).toBe(false);
    expect(grid.weeks[0][5].date).toBe("2026-08-01");
    expect(grid.weeks[0][5].inMonth).toBe(true);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
  });

  it("enthaelt jeden Tag des Monats genau einmal", () => {
    const grid = buildMonthGrid(2026, 2);
    const imMonat = grid.weeks.flat().filter((day) => day.inMonth);

    expect(imMonat).toHaveLength(28);
    expect(imMonat[0].date).toBe("2026-02-01");
    expect(imMonat[27].date).toBe("2026-02-28");
  });

  it("nutzt nur so viele Wochen wie noetig", () => {
    // Februar 2027 beginnt an einem Montag und hat 28 Tage: genau vier Wochen.
    expect(buildMonthGrid(2027, 2).weeks).toHaveLength(4);
    expect(buildMonthGrid(2026, 8).weeks.length).toBeGreaterThanOrEqual(5);
  });
});

describe("buildAgenda", () => {
  const heute = "2026-08-05"; // Mittwoch

  it("gliedert in Heute, Diese Woche und Später", () => {
    const sections = buildAgenda(
      [
        event("1", "2026-08-05", "Heute AG"),
        event("2", "2026-08-07", "Freitag AG"),
        event("3", "2026-09-01", "September AG"),
      ],
      heute,
    );

    expect(sections.map((section) => section.key)).toEqual(["today", "week", "later"]);
    expect(sections[0].days[0].events[0].title).toBe("Heute AG");
    expect(sections[1].days[0].date).toBe("2026-08-07");
    expect(sections[2].days[0].date).toBe("2026-09-01");
  });

  it("laesst vergangene Termine weg und leere Abschnitte entfallen", () => {
    const sections = buildAgenda(
      [event("1", "2026-07-01", "Vergangen AG"), event("2", "2026-09-01", "Spaet AG")],
      heute,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("later");
  });

  it("fasst mehrere Termine desselben Tages zusammen und sortiert chronologisch", () => {
    const sections = buildAgenda(
      [
        event("2", "2026-09-01", "B AG"),
        event("1", "2026-08-20", "A AG"),
        event("3", "2026-09-01", "C AG"),
      ],
      heute,
    );

    const spaeter = sections.find((section) => section.key === "later");
    expect(spaeter?.days.map((day) => day.date)).toEqual(["2026-08-20", "2026-09-01"]);
    expect(spaeter?.days[1].events).toHaveLength(2);
  });

  it("zaehlt den Sonntag noch zur laufenden Woche", () => {
    const sections = buildAgenda([event("1", "2026-08-09", "Sonntag AG")], heute);

    expect(sections[0].key).toBe("week");
  });
});

describe("Beschriftungen", () => {
  it("schreibt Datumsangaben fuer Sprachausgaben aus", () => {
    expect(spokenDate("2026-08-15")).toBe("15. August 2026");
  });

  it("beschreibt eine Tageszelle vollstaendig", () => {
    expect(dayCellLabel("2026-08-15", 2, false)).toBe(
      "15. August 2026, 2 angekündigte Zahltage",
    );
    expect(dayCellLabel("2026-08-15", 1, true)).toBe(
      "15. August 2026, heute, 1 angekündigter Zahltag",
    );
    expect(dayCellLabel("2026-08-15", 0, false)).toBe("15. August 2026, keine Termine");
  });

  it("nennt den letzten Abgleich in Alltagssprache", () => {
    // 06:14 UTC entspricht 08:14 in Berlin (Sommerzeit).
    expect(lastSyncLabel("2026-08-03T06:14:00.000Z", "2026-08-03")).toBe(
      "heute, 08:14 Uhr",
    );
    expect(lastSyncLabel("2026-08-02T06:14:00.000Z", "2026-08-03")).toBe(
      "gestern, 08:14 Uhr",
    );
    expect(lastSyncLabel("2026-07-30T06:14:00.000Z", "2026-08-03")).toBe(
      "30.07.2026, 08:14 Uhr",
    );
  });
});
