import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";
import type { CalendarEvent, CalendarSyncStatusRow } from "@/lib/calendar/types";

/**
 * Kalenderansicht (Auftrag §20 „Kalenderdarstellung").
 *
 * Die Seite haengt an drei Abfragen; sie werden hier durch Fixtures ersetzt,
 * damit der Test die Ansicht prueft und nicht das Netz. Die automatische
 * Aktualisierung bleibt echt — sie ist selbst Gegenstand der Pruefung.
 */
const zustand = vi.hoisted(() => ({
  events: [] as CalendarEvent[],
  eventsLoading: false,
  eventsError: null as Error | null,
  status: null as CalendarSyncStatusRow | null,
  statusLoading: false,
  syncPending: false,
  syncError: null as Error | null,
  mutate: vi.fn(),
}));

vi.mock("@/features/calendar/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/calendar/hooks")>();
  return {
    ...original,
    useCalendarEvents: () => ({
      data: zustand.events,
      isLoading: zustand.eventsLoading,
      isError: zustand.eventsError !== null,
      error: zustand.eventsError,
      refetch: vi.fn(),
    }),
    useCalendarSyncStatus: () => ({
      data: zustand.status,
      isLoading: zustand.statusLoading,
      isSuccess: !zustand.statusLoading,
    }),
    useSyncCalendar: () => ({
      mutate: zustand.mutate,
      isPending: zustand.syncPending,
      isError: zustand.syncError !== null,
      error: zustand.syncError,
    }),
  };
});

const { CalendarPage } = await import("@/features/calendar/CalendarPage");
const { resetAutoSyncForTests } = await import("@/features/calendar/hooks");

const HEUTE = new Date("2026-08-05T09:00:00.000Z");

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    externalUid: `uid-${overrides.id}`,
    eventType: "payment",
    eventState: "active",
    title: "Apple Inc.",
    description: null,
    location: null,
    externalUrl: null,
    categories: [],
    date: "2026-08-13",
    endDate: null,
    startsAt: null,
    endsAt: null,
    isAllDay: true,
    ...overrides,
  };
}

function status(overrides: Partial<CalendarSyncStatusRow> = {}): CalendarSyncStatusRow {
  return {
    user_id: "user-1",
    source: "divvydiary",
    state: "success",
    last_attempt_at: "2026-08-05T06:14:00.000Z",
    last_success_at: "2026-08-05T06:14:00.000Z",
    events_read: 2,
    events_created: 2,
    events_updated: 0,
    events_removed: 0,
    events_skipped: 0,
    error_message: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-05T06:14:00.000Z",
    ...overrides,
  };
}

function renderPage(ansicht: "month" | "agenda" = "month") {
  window.localStorage.setItem("dividend-tracker:calendar-view", ansicht);
  return render(
    <ToastProvider>
      <CalendarPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HEUTE);
  zustand.events = [];
  zustand.eventsLoading = false;
  zustand.eventsError = null;
  zustand.status = status();
  zustand.statusLoading = false;
  zustand.syncPending = false;
  zustand.syncError = null;
  zustand.mutate = vi.fn();
  resetAutoSyncForTests();
  window.localStorage.clear();
});

describe("Kopf und Zustaende", () => {
  it("zeigt Ueberschrift und Unterzeile", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Dividendenkalender", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Alle angekündigten Zahltage deiner Dividenden auf einen Blick."),
    ).toBeInTheDocument();
  });

  it("zeigt beim ersten Laden ein Geruest statt eines leeren Bildschirms", () => {
    zustand.eventsLoading = true;
    renderPage();

    expect(screen.getByText("Kalender wird geladen …")).toBeInTheDocument();
  });

  it("fordert zur ersten Synchronisation auf, solange nie synchronisiert wurde", () => {
    zustand.status = null;
    renderPage();

    expect(
      screen.getByText("Der Dividendenkalender wurde noch nicht synchronisiert."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Kalender synchronisieren/ }),
    ).toBeInTheDocument();
  });

  it("meldet einen leeren Kalender nach erfolgreicher Synchronisation", () => {
    renderPage();

    expect(
      screen.getByText("Keine bevorstehenden Zahltage gefunden."),
    ).toBeInTheDocument();
  });

  it("zeigt einen Ladefehler mit Wiederholung", () => {
    zustand.eventsError = new Error("Netzwerk weg");
    renderPage();

    expect(
      screen.getByText("Der Kalender konnte nicht geladen werden"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("nennt den Zeitpunkt der letzten Aktualisierung", () => {
    renderPage();

    expect(
      screen.getByText(/Zuletzt aktualisiert: heute, 08:14 Uhr/),
    ).toBeInTheDocument();
  });
});

describe("Voreinstellung der Ansicht", () => {
  it("zeigt ohne eigene Wahl die Liste", () => {
    zustand.events = [event({ id: "1", date: "2026-08-13", title: "Apple Inc." })];
    render(
      <ToastProvider>
        <CalendarPage />
      </ToastProvider>,
    );

    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("columnheader", { name: "Montag" }),
    ).not.toBeInTheDocument();
  });
});

describe("Monatsansicht", () => {
  it("stellt Termine am richtigen Kalendertag dar", () => {
    zustand.events = [event({ id: "1", date: "2026-08-13", title: "Apple Inc." })];
    renderPage("month");

    const zelle = screen
      .getByText("13. August 2026, 1 angekündigter Zahltag")
      .closest("td");
    expect(zelle).not.toBeNull();
    expect(
      within(zelle as HTMLElement).getByRole("button", { name: /Apple Inc./ }),
    ).toBeInTheDocument();
  });

  it("stellt mehrere Termine eines Tages nebeneinander dar", () => {
    zustand.events = [
      event({ id: "1", date: "2026-08-13", title: "Apple Inc." }),
      event({ id: "2", date: "2026-08-13", title: "Allianz SE" }),
    ];
    renderPage("month");

    const zelle = screen
      .getByText("13. August 2026, 2 angekündigte Zahltage")
      .closest("td") as HTMLElement;
    expect(within(zelle).getAllByRole("button")).toHaveLength(2);
  });

  it("kennzeichnet den heutigen Tag auch fuer Sprachausgaben", () => {
    zustand.events = [event({ id: "1", date: "2026-08-13" })];
    renderPage("month");

    expect(screen.getByText(/5\. August 2026, heute/)).toBeInTheDocument();
  });

  it("blaettert vor und zurueck und findet mit „Heute“ zurueck", async () => {
    const user = userEvent.setup();
    zustand.events = [event({ id: "1", date: "2026-08-13" })];
    renderPage("month");

    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nächster Monat" }));
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vorheriger Monat" }));
    await user.click(screen.getByRole("button", { name: "Vorheriger Monat" }));
    expect(screen.getByRole("heading", { name: "Juli 2026" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Heute" }));
    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();
  });

  it("beschriftet die Wochentagsspalten vollstaendig", () => {
    zustand.events = [event({ id: "1", date: "2026-08-13" })];
    renderPage("month");

    expect(screen.getByRole("columnheader", { name: "Montag" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sonntag" })).toBeInTheDocument();
  });
});

describe("Listenansicht", () => {
  beforeEach(() => {
    zustand.events = [
      event({ id: "1", date: "2026-08-05", title: "Heute AG" }),
      event({ id: "2", date: "2026-09-15", title: "Später AG" }),
    ];
  });

  it("gruppiert nach Zeitraum", () => {
    renderPage("agenda");

    expect(screen.getByRole("heading", { name: "Heute", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Später", level: 2 })).toBeInTheDocument();
  });

  it("traegt das Datum an jeder Kachel — als Zahl und als vollstaendige Angabe", () => {
    renderPage("agenda");

    // Die Datumskachel zeigt Tageszahl und Monatskuerzel …
    const kachel = screen.getByRole("button", { name: /Heute AG/ });
    expect(kachel).toHaveTextContent("5");
    expect(kachel).toHaveTextContent("Aug");
    expect(kachel).toHaveTextContent("Mi, 05.08.2026");
    // … fuer Sprachausgaben steht das Datum ausgeschrieben in der Bezeichnung.
    expect(
      screen.getByRole("button", {
        name: /Heute AG, Zahltag am 5\. August 2026\. Details anzeigen/,
      }),
    ).toBeInTheDocument();
  });

  it("wechselt ueber den Umschalter zur Monatsansicht", async () => {
    const user = userEvent.setup();
    renderPage("agenda");

    await user.click(screen.getByRole("button", { name: "Monat", pressed: false }));

    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();
  });
});

describe("Kennzahlkacheln", () => {
  it("zeigt den naechsten Zahltag mit Abstand und Anzahl", () => {
    zustand.events = [
      event({ id: "1", date: "2026-08-13", title: "Apple Inc." }),
      event({ id: "2", date: "2026-08-13", title: "Allianz SE" }),
    ];
    renderPage("agenda");

    expect(screen.getByText("Nächster Zahltag")).toBeInTheDocument();
    expect(screen.getByText("13.08.2026")).toBeInTheDocument();
    expect(screen.getByText("in 8 Tagen · 2 Termine")).toBeInTheDocument();
  });

  it("zaehlt Monat, Zeitraum und Unternehmen", () => {
    zustand.events = [
      event({ id: "1", date: "2026-08-13", title: "Apple Inc." }),
      event({ id: "2", date: "2026-08-20", title: "Apple Inc." }),
      event({ id: "3", date: "2026-12-01", title: "Weit weg AG" }),
    ];
    renderPage("agenda");

    expect(screen.getByText("Diesen Monat")).toBeInTheDocument();
    expect(screen.getByText("Nächste 30 Tage")).toBeInTheDocument();
    // Apple zaehlt einmal, obwohl es zweimal vorkommt.
    expect(screen.getByText("mit kommenden Zahltagen")).toBeInTheDocument();
  });

  it("bleibt ohne Termine weg", () => {
    renderPage("agenda");

    expect(screen.queryByText("Nächster Zahltag")).not.toBeInTheDocument();
  });
});

describe("Detailansicht", () => {
  it("oeffnet sich per Tastatur und zeigt nur vorhandene Angaben", async () => {
    const user = userEvent.setup();
    zustand.events = [
      event({
        id: "1",
        date: "2026-08-05",
        title: "Coca-Cola Co.",
        description: "Quartalsdividende",
      }),
    ];
    renderPage("agenda");

    const eintrag = screen.getByRole("button", { name: /Coca-Cola Co\./ });
    eintrag.focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Coca-Cola Co.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Angekündigter Zahltag am 05.08.2026"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Quartalsdividende")).toBeInTheDocument();
    // Ohne Angabe im Feed keine erfundene Zeile.
    expect(within(dialog).queryByText("Uhrzeit")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Ort")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Aktualisierung", () => {
  it("stoesst beim Oeffnen genau einen Lauf an, wenn die Daten veraltet sind", () => {
    zustand.status = status({ last_success_at: "2026-08-01T06:00:00.000Z" });
    const { rerender } = renderPage();

    expect(zustand.mutate).toHaveBeenCalledTimes(1);

    rerender(
      <ToastProvider>
        <CalendarPage />
      </ToastProvider>,
    );
    expect(zustand.mutate).toHaveBeenCalledTimes(1);
  });

  it("laesst frische Daten in Ruhe", () => {
    renderPage();

    expect(zustand.mutate).not.toHaveBeenCalled();
  });

  it("sperrt die Schaltflaeche waehrend eines laufenden Abgleichs", () => {
    zustand.syncPending = true;
    renderPage();

    const knopf = screen.getByRole("button", { name: /Wird aktualisiert/ });
    expect(knopf).toBeDisabled();
  });

  it("zeigt bei einem Fehlschlag weiterhin die gespeicherten Termine", () => {
    zustand.events = [event({ id: "1", date: "2026-08-13", title: "Apple Inc." })];
    zustand.syncError = new Error(
      "Die Kalenderquelle hat nicht rechtzeitig geantwortet. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.",
    );
    renderPage("agenda");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Die Kalenderquelle hat nicht rechtzeitig geantwortet.",
    );
    expect(screen.getByRole("button", { name: /Apple Inc\./ })).toBeInTheDocument();
  });
});
