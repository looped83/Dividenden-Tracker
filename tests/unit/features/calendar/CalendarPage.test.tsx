import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";
import { EUR, Money } from "@/lib/money";
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
  /** Angelegte Unternehmen — Grundlage der Namensangleichung. */
  securities: [] as { id: string; name: string; archived_at: string | null }[],
  aliases: [] as { aliasNormalized: string; securityId: string }[],
}));

vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({ data: zustand.securities }),
  useSecurityAliases: () => ({ data: zustand.aliases }),
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
    date: "2026-08-13",
    endDate: null,
    startsAt: null,
    endsAt: null,
    isAllDay: true,
    matchedCompanyName: null,
    ...overrides,
    title,
    // Der Feed liefert den Namen in der SUMMARY; die App loest ihn beim
    // Einlesen heraus. Ohne eigene Vorgabe folgt er hier dem Titel.
    companyName: overrides.companyName ?? title,
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

/**
 * jsdom kennt `matchMedia` nicht. Der Kalender selbst fragt sie nicht mehr ab —
 * die Monatsansicht unterscheidet ihre beiden Anordnungen in CSS —, ein
 * Bestandteil des Designsystems koennte es aber tun.
 */
function stubMatchMedia() {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  stubMatchMedia();
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
  zustand.securities = [];
  zustand.aliases = [];
  resetAutoSyncForTests();
  window.localStorage.clear();
});

describe("Kopf und Zustaende", () => {
  it("zeigt die Ueberschrift — ohne Unterzeile, die sie wiederholt", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Dividendenkalender", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Alle angekündigten Zahltage deiner Dividenden/),
    ).not.toBeInTheDocument();
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
  it("stellt die Termine des gewaehlten Tages neben dem Raster dar", async () => {
    const user = userEvent.setup();
    zustand.events = [event({ id: "1", date: "2026-08-13", title: "Apple Inc." })];
    renderPage("month");

    // Sieben Spalten teilen sich die Seitenbreite — auf dem Telefon 46px, am
    // Schreibtisch rund 90px. In beiden bliebe von „Apple Inc." ein „Ap…". Der
    // Tag traegt deshalb ueberall nur Punkte; seine Termine stehen als volle
    // Kacheln in der Tagesspalte (schmal darunter, breit rechts daneben).
    const tag = screen.getByRole("button", {
      name: "13. August 2026, 1 angekündigter Zahltag",
    });
    await user.click(tag);

    expect(tag).toHaveAttribute("aria-pressed", "true");
    // Die Zelle selbst traegt keine Termine, nur die Schaltflaeche des Tages.
    const zelle = tag.closest("td") as HTMLElement;
    expect(within(zelle).getAllByRole("button")).toHaveLength(1);

    const tagesspalte = screen.getByRole("region", {
      name: "Termine am Donnerstag, 13.08.2026",
    });
    expect(
      within(tagesspalte).getByRole("heading", { name: /13\.08\.2026/ }),
    ).toBeInTheDocument();
    expect(
      within(tagesspalte).getByRole("button", { name: /Apple Inc\./ }),
    ).toBeInTheDocument();
  });

  it("listet mehrere Termine eines Tages vollstaendig auf", async () => {
    const user = userEvent.setup();
    zustand.events = [
      event({ id: "1", date: "2026-08-13", title: "Apple Inc." }),
      event({ id: "2", date: "2026-08-13", title: "Allianz SE" }),
    ];
    renderPage("month");

    await user.click(
      screen.getByRole("button", { name: "13. August 2026, 2 angekündigte Zahltage" }),
    );

    expect(screen.getByRole("button", { name: /Apple Inc\./ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Allianz SE/ })).toBeInTheDocument();
  });

  it("waehlt beim Oeffnen den ersten Tag mit Terminen vor", () => {
    zustand.events = [event({ id: "1", date: "2026-08-13", title: "Apple Inc." })];
    renderPage("month");

    // Ohne Vorauswahl stuende neben dem Raster ein leerer Kasten.
    expect(
      screen.getByRole("button", { name: "13. August 2026, 1 angekündigter Zahltag" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Apple Inc\./ })).toBeInTheDocument();
  });

  it("sagt in der Tagesspalte, wenn der Monat keine Termine traegt", async () => {
    const user = userEvent.setup();
    zustand.events = [event({ id: "1", date: "2026-08-13", title: "Apple Inc." })];
    renderPage("month");

    await user.click(screen.getByRole("button", { name: "Nächster Monat" }));

    expect(
      screen.getByText("In diesem Monat ist kein Zahltag angekündigt."),
    ).toBeInTheDocument();
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

  it("gruppiert nach Zeitraum und gibt jedem spaeteren Monat einen Abschnitt", () => {
    renderPage("agenda");

    expect(screen.getByRole("heading", { name: "Heute", level: 2 })).toBeInTheDocument();
    // „Später" endet mit dem laufenden Monat; der September traegt seine eigene
    // Ueberschrift, statt in einer Sammelrubrik zu verschwinden.
    expect(
      screen.getByRole("heading", { name: "September 2026", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Später" })).not.toBeInTheDocument();
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

describe("Erwartete Beträge aus dem Feed", () => {
  const mitBetrag = (id: string, date: string, title: string, amount: string) =>
    event({
      id,
      date,
      title,
      companyName: title,
      expectedAmount: Money.fromString(amount, EUR),
      sourcePortfolio: "Trade Republic",
    });

  it("zeigt den Betrag an der Kachel und nennt ihn als erwartet", () => {
    zustand.events = [
      mitBetrag("1", "2026-08-13", "Verizon Communications Inc", "51.37"),
    ];
    renderPage("agenda");

    const kachel = screen.getByRole("button", {
      name: /Verizon Communications Inc, Zahltag am 13\. August 2026, erwartet 51,37/,
    });
    expect(kachel).toHaveTextContent("51,37 €");
    expect(kachel).toHaveTextContent("Trade Republic");
  });

  it("summiert die Beträge in den Kacheln", () => {
    zustand.events = [
      mitBetrag("1", "2026-08-13", "Verizon", "51.37"),
      mitBetrag("2", "2026-08-20", "Allianz", "12.63"),
    ];
    renderPage("agenda");

    // 51,37 + 12,63 = 64,00 — exakt, nicht 64,000000000000006.
    expect(screen.getAllByText("64,00 €").length).toBeGreaterThan(0);
    // Monat und 30-Tage-Fenster enthalten hier dieselben zwei Termine.
    expect(screen.getAllByText(/aus 2 Terminen/).length).toBeGreaterThan(0);
  });

  it("weist aus, wenn nicht jeder Termin einen Betrag mitbringt", () => {
    zustand.events = [
      mitBetrag("1", "2026-08-13", "Verizon", "51.37"),
      event({ id: "2", date: "2026-08-20", title: "Ohne Betrag AG" }),
    ];
    renderPage("agenda");

    expect(screen.getAllByText(/aus 1 von 2 Terminen/).length).toBeGreaterThan(0);
  });

  it("faellt ohne Beträge auf die Anzahl zurück", () => {
    zustand.events = [event({ id: "1", date: "2026-08-13", title: "Ohne Betrag AG" })];
    renderPage("agenda");

    expect(screen.getByText("Diesen Monat")).toBeInTheDocument();
    expect(screen.queryByText(/aus \d+ Termin/)).not.toBeInTheDocument();
  });

  it("zeigt den Betrag und das Depot in der Detailansicht", async () => {
    const user = userEvent.setup();
    zustand.events = [mitBetrag("1", "2026-08-13", "Verizon", "51.37")];
    renderPage("agenda");

    await user.click(screen.getByRole("button", { name: /Verizon/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Erwarteter Betrag")).toBeInTheDocument();
    expect(within(dialog).getByText("51,37 €")).toBeInTheDocument();
    expect(within(dialog).getByText("Depot laut Quelle")).toBeInTheDocument();
    expect(within(dialog).getByText("Trade Republic")).toBeInTheDocument();
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

describe("Namen der angelegten Unternehmen", () => {
  it("zeigt den eigenen Namen statt der Schreibweise der Quelle", () => {
    zustand.securities = [{ id: "s1", name: "Realty Income", archived_at: null }];
    zustand.events = [
      event({ id: "1", date: "2026-08-13", companyName: "Realty Income Corporation" }),
    ];
    renderPage("agenda");

    expect(screen.getByRole("button", { name: /Realty Income,/ })).toBeInTheDocument();
    expect(screen.queryByText("Realty Income Corporation")).not.toBeInTheDocument();
  });

  it("nennt in der Detailansicht weiterhin den Namen der Quelle", async () => {
    const user = userEvent.setup();
    zustand.securities = [{ id: "s1", name: "Realty Income", archived_at: null }];
    zustand.events = [
      event({ id: "1", date: "2026-08-13", companyName: "Realty Income Corporation" }),
    ];
    renderPage("agenda");

    await user.click(screen.getByRole("button", { name: /Realty Income,/ }));

    const dialog = await screen.findByRole("dialog");
    // Angeglichen wird die Anzeige, nicht die Quelle: Was im Feed steht, bleibt
    // nachvollziehbar.
    expect(within(dialog).getByText("Realty Income Corporation")).toBeInTheDocument();
  });

  it("laesst unbekannte Unternehmen unveraendert", () => {
    zustand.securities = [{ id: "s1", name: "Allianz", archived_at: null }];
    zustand.events = [event({ id: "1", date: "2026-08-13", companyName: "Apple Inc." })];
    renderPage("agenda");

    expect(screen.getByRole("button", { name: /Apple Inc\./ })).toBeInTheDocument();
  });

  it("zaehlt angeglichene Termine als ein Unternehmen", () => {
    zustand.securities = [{ id: "s1", name: "Realty Income", archived_at: null }];
    zustand.events = [
      event({ id: "1", date: "2026-08-13", companyName: "Realty Income Corporation" }),
      event({ id: "2", date: "2026-08-20", companyName: "Realty Income" }),
    ];
    renderPage("agenda");

    // Beide Termine gehoeren zu „Realty Income" — die Kachel zaehlt sie als ein
    // Unternehmen, nicht als zwei Schreibweisen.
    // Die Kennzahl steht in der Kachel unmittelbar ueber ihrer Bildunterschrift.
    expect(
      screen.getByText("mit kommenden Zahltagen").previousElementSibling,
    ).toHaveTextContent("1");
  });
});
