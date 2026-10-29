import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, YearSelection } from "@/lib/statistics";
import type { RefDate } from "@/lib/statistics/dates";
import type { Goal } from "@/lib/goals";

const goals: Goal[] = [];

// Der Kopf liest die Ziele über eine Query; hier zählt allein, welche davon er
// zeigt — nicht, woher sie kommen.
vi.mock("@/features/goals/hooks", () => ({
  useGoals: () => ({ data: goals }),
}));

// Angekündigte Termine des Kalenders (für die Prognose, §9.7).
const calendar = vi.hoisted(() => ({ events: [] as unknown[] }));
vi.mock("@/features/calendar/hooks", () => ({
  useCalendarEvents: () => ({ data: calendar.events }),
}));

const { DashboardHero } = await import("@/features/dashboard/DashboardHero");

const TODAY: RefDate = { year: 2026, month: 7, day: 20 };

let seq = 0;
function payment(payDate: string, net: string, security = "sec-a"): AnalyticsPayment {
  seq += 1;
  return {
    id: `id-${String(seq)}`,
    payDate,
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

const MONATSLINK = { name: "Dividenden des aktuellen Monats anzeigen" };

// Die Diagrammsicht bleibt im Speicher des Geräts stehen; jeder Test beginnt
// mit der Voreinstellung.
afterEach(() => {
  window.localStorage.clear();
  calendar.events = [];
});

describe("DashboardHero — eine Hauptzahl statt Kachelraster", () => {
  it("zeigt die Summe des gewählten Jahres, nicht die aller Jahre", () => {
    // Die Gesamtsumme steht als Zeile „Gesamt seit …" am Seitenende.
    renderHero(2026, [
      payment("2026-03-10", "50.00"),
      payment("2020-05-10", "70.00", "sec-b"),
    ]);
    expect(
      screen.getByRole("link", { name: "Dividenden 2026 anzeigen" }),
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
    const trend = screen.getByRole("button", { name: /^Veränderung/ });
    expect(trend).toHaveTextContent(/^50,00\s?€$/);
    expect(trend).toHaveAccessibleName(
      /\+50,00\s?€ \(\+50,0\s?%\) ggü\. Vorjahreszeitraum\. Als Prozent anzeigen/,
    );
  });

  it("wechselt die Veränderung per Tipp zwischen Betrag und Prozent", async () => {
    const user = userEvent.setup();
    renderHero(2026, [payment("2026-03-10", "150.00"), payment("2025-03-10", "100.00")]);
    const trend = screen.getByRole("button", { name: /^Veränderung/ });
    await user.click(trend);
    expect(trend).toHaveTextContent(/^50,0\s?%$/);
    expect(trend).toHaveAccessibleName(/Als Betrag anzeigen$/);
    await user.click(trend);
    expect(trend).toHaveTextContent(/^50,00\s?€$/);
  });

  it("zeigt im laufenden Jahr Monat, Durchschnitt und besten Monat in dieser Folge", () => {
    renderHero(2026, [payment("2026-03-10", "50.00"), payment("2024-05-10", "70.00")]);
    const labels = screen.getAllByRole("term").map((term) => term.textContent);
    expect(labels).toEqual(["Juli", "Ø pro Monat", "Bester Monat"]);
  });

  it("zählt eine Zahlung im Monat ihres Zahltags, auch bei anderem Plan (§10)", () => {
    // Zahlung am 25. Juni gehört zum Juni, nicht zum laufenden Juli.
    renderHero(2026, [payment("2026-06-25", "80.00", "sec-plan")]);
    expect(screen.getByRole("link", MONATSLINK)).not.toHaveTextContent(/80,00\s?€/);
  });

  it("lässt den aktuellen Monat in einem anderen Jahr weg und nennt die Zahlungen", () => {
    renderHero(2024, [
      payment("2024-03-10", "50.00", "sec-a"),
      payment("2024-04-10", "30.00", "sec-b"),
      payment("2026-07-10", "80.00"),
    ]);
    expect(screen.queryByRole("link", MONATSLINK)).not.toBeInTheDocument();
    const labels = screen.getAllByRole("term").map((term) => term.textContent);
    expect(labels).toEqual(["Ø pro Monat", "Anzahl", "Bester Monat"]);
    expect(screen.getByText("2 Assets")).toBeInTheDocument();
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

  it("zeigt das Jahresziel des laufenden Jahres als Balken mit Prognose (§9.7)", () => {
    // Bis 20. Juli: 500 €. Vorjahr nach dem 20. Juli: 120 € → Prognose 620 €.
    renderHero(
      2026,
      [...PAYMENTS, payment("2025-03-10", "80.00"), payment("2025-11-10", "120.00")],
      [JAHRESZIEL_2024, JAHRESZIEL_2026],
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/vom Ziel 1\.000,00\s?€/)).toBeInTheDocument();
    expect(screen.getByText("Prognose", { exact: false })).toHaveTextContent(
      /Prognose 620,00\s?€/,
    );
    expect(
      screen.getByRole("link", { name: /Prognose bis Jahresende 620,00\s?€/ }),
    ).toHaveAttribute("href", `/ziele/${JAHRESZIEL_2026.id}`);
  });

  it("ersetzt in der Prognose die nächsten Wochen durch angekündigte Beträge", () => {
    // Angekündigt am 5. August: 90 € (netto). Das Vorjahr bis 5. August (60 €)
    // entfällt dafür, ab dem 6. August gilt wieder das Vorjahr (120 €).
    calendar.events = [
      {
        id: "e1",
        date: "2026-08-05",
        eventType: "payment",
        eventState: "active",
        expectedAmount: Money.fromString("90.00", EUR),
      },
    ];
    renderHero(
      2026,
      [...PAYMENTS, payment("2025-08-01", "60.00"), payment("2025-11-10", "120.00")],
      [JAHRESZIEL_2026],
    );
    // 500 + 90 + 120
    expect(
      screen.getByRole("link", {
        name: /Prognose bis Jahresende 710,00\s?€, davon 90,00\s?€ angekündigt/,
      }),
    ).toBeInTheDocument();
  });

  it("zeigt zu einem anderen Jahr das Ergebnis statt einer Prognose", () => {
    renderHero(2024, PAYMENTS, [JAHRESZIEL_2024]);
    expect(screen.queryByText(/Prognose/)).not.toBeInTheDocument();
    expect(screen.getByText(/vom Ziel 1\.000,00\s?€/)).toBeInTheDocument();
  });

  it("nennt das Monatsziel im Feld des Monats, nur im laufenden Jahr", () => {
    const { unmount } = renderHero(2026, PAYMENTS, [MONATSZIEL_JULI]);
    expect(screen.getByText("25 % vom Ziel")).toBeInTheDocument();
    unmount();

    renderHero(2024, PAYMENTS, [JAHRESZIEL_2024, MONATSZIEL_JULI]);
    expect(screen.queryByText(/^\d+ % vom Ziel$/)).not.toBeInTheDocument();
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

describe("DashboardHero — Diagramm im Kopf", () => {
  const PAYMENTS = [
    payment("2026-02-10", "40.00"),
    payment("2026-05-10", "200.00"),
    payment("2026-07-10", "60.00"),
    payment("2025-05-10", "150.00"),
  ];

  it("lässt sich per Tastatur durchgehen; der Kopf zeigt den gewählten Stand", async () => {
    const user = userEvent.setup();
    renderHero(2026, PAYMENTS);
    const chart = screen.getByRole("slider");
    // Ohne Auswahl: der Zeitraum, als letzter Punkt („heute") angesagt.
    expect(chart).toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(/^bis 20\. Juli 2026: 300,00/),
    );

    chart.focus();
    await user.keyboard("{Home}{ArrowRight}");
    // Ende Februar: 40 €, Vorjahr bis Februar 0 € → „neu".
    expect(screen.getByText("Dividenden bis Februar 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Dividenden bis Februar 2026 anzeigen" }),
    ).toHaveTextContent(/40,00\s?€/);

    await user.keyboard("{Escape}");
    expect(screen.getByText("Dividenden 2026")).toBeInTheDocument();
  });

  it("zeigt monatlich den gewählten Monat mit Vorjahresvergleich und Drill-down", async () => {
    const user = userEvent.setup();
    renderHero(2026, PAYMENTS);
    await user.click(screen.getByRole("radio", { name: "Monatlich" }));
    expect(screen.getByRole("radio", { name: "Monatlich" })).toBeChecked();

    const chart = screen.getByRole("slider");
    chart.focus();
    // Punkte: Januar bis Juli (August ff. haben noch nicht begonnen).
    expect(chart).toHaveAttribute("aria-valuemax", "6");
    await user.keyboard("{Home}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByText("Dividenden Mai 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Veränderung/ })).toHaveAccessibleName(
      /\(\+33,3\s?%\)/,
    );
    expect(
      screen.getByRole("link", { name: "Dividenden Mai 2026 anzeigen" }),
    ).toHaveAttribute("href", "/eingaenge?year=2026&month=5");
  });
});

describe("DashboardHero — Diagrammsicht", () => {
  it("merkt sich die gewählte Sicht auf diesem Gerät", async () => {
    const user = userEvent.setup();
    const { unmount } = renderHero(2026, [payment("2026-03-10", "50.00")]);
    expect(screen.getByRole("radio", { name: "Kumuliert" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Monatlich" }));
    unmount();

    renderHero(2026, [payment("2026-03-10", "50.00")]);
    expect(screen.getByRole("radio", { name: "Monatlich" })).toBeChecked();
  });
});
