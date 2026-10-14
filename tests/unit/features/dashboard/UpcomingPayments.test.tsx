import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { CalendarEvent } from "@/lib/calendar/types";

const zustand = vi.hoisted(() => ({
  events: [] as CalendarEvent[],
  securities: [] as { id: string; name: string; archived_at: string | null }[],
}));

// Die Karte liest Termine und Bestand über Queries; hier zählt allein, welche
// Termine sie zeigt.
vi.mock("@/features/calendar/hooks", () => ({
  useCalendarEvents: () => ({ data: zustand.events }),
}));
vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({ data: zustand.securities }),
  useSecurityAliases: () => ({ data: [] }),
}));

const { UpcomingPayments } = await import("@/features/dashboard/UpcomingPayments");

const HEUTE = "2026-08-05";

function event(
  overrides: Partial<CalendarEvent> & { id: string; date: string },
): CalendarEvent {
  const title = overrides.title ?? "Apple Inc.";
  return {
    externalUid: `uid-${overrides.id}`,
    eventType: "payment",
    eventState: "active",
    expectedAmount: null,
    sourcePortfolio: null,
    description: null,
    location: null,
    externalUrl: null,
    categories: [],
    endDate: null,
    startsAt: null,
    endsAt: null,
    isAllDay: true,
    matchedCompanyName: null,
    ...overrides,
    title,
    companyName: overrides.companyName ?? title,
  };
}

function renderCard(events: CalendarEvent[]) {
  zustand.events = events;
  return render(
    <MemoryRouter>
      <UpcomingPayments today={HEUTE} />
    </MemoryRouter>,
  );
}

const betrag = (value: string) => Money.fromString(value, EUR);

describe("UpcomingPayments", () => {
  it("zeigt die nächsten drei Zahltage in zeitlicher Folge", () => {
    renderCard([
      event({ id: "4", date: "2026-09-20", title: "Später AG" }),
      event({ id: "2", date: "2026-08-06", title: "Morgen AG" }),
      event({ id: "1", date: "2026-08-05", title: "Heute AG" }),
      event({ id: "3", date: "2026-08-20", title: "Bald AG" }),
    ]);

    const zeilen = within(
      screen.getByRole("list", { name: "Nächste angekündigte Zahltage" }),
    )
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label"));
    expect(zeilen).toEqual([
      "Heute AG, heute",
      "Morgen AG, morgen",
      "Bald AG, in 15 Tagen",
    ]);
  });

  it("lässt Vergangenes, Abgesagtes und Ex-Tage aus", () => {
    renderCard([
      event({ id: "1", date: "2026-08-01", title: "Vorbei AG" }),
      event({
        id: "2",
        date: "2026-08-07",
        title: "Abgesagt AG",
        eventState: "cancelled",
      }),
      event({ id: "3", date: "2026-08-08", title: "Ex-Tag AG", eventType: "ex_date" }),
      event({ id: "4", date: "2026-08-09", title: "Echt AG" }),
    ]);

    expect(screen.getByRole("link", { name: /^Echt AG/ })).toBeInTheDocument();
    for (const name of ["Vorbei AG", "Abgesagt AG", "Ex-Tag AG"]) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
  });

  it("nennt Beträge als erwartet und summiert die nächsten 30 Tage", () => {
    renderCard([
      event({
        id: "1",
        date: "2026-08-13",
        title: "Verizon",
        expectedAmount: betrag("51.37"),
      }),
      event({
        id: "2",
        date: "2026-08-20",
        title: "Allianz",
        expectedAmount: betrag("12.63"),
      }),
      event({
        id: "3",
        date: "2026-12-01",
        title: "Weit weg",
        expectedAmount: betrag("99.00"),
      }),
    ]);

    expect(screen.getByText(/erwartet in 30 Tagen/)).toHaveTextContent(/^64,00\s€/);
    expect(
      screen.getByRole("link", { name: /^Verizon, in 8 Tagen, erwartet 51,37\s€$/ }),
    ).toHaveAttribute("href", "/kalender");
  });

  it("zeigt den eigenen Namen statt der Schreibweise der Quelle", () => {
    zustand.securities = [{ id: "s1", name: "Realty Income", archived_at: null }];
    renderCard([
      event({ id: "1", date: "2026-08-13", companyName: "Realty Income Corporation" }),
    ]);

    expect(screen.getByRole("link", { name: /^Realty Income,/ })).toBeInTheDocument();
    zustand.securities = [];
  });

  it("entfällt ohne kommende Zahltage", () => {
    const { container } = renderCard([event({ id: "1", date: "2026-08-01" })]);
    expect(container).toBeEmptyDOMElement();
  });
});
