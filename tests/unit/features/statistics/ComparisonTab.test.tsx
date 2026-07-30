import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { EUR, Money } from "@/lib/money";
import {
  filterPayments,
  type AnalyticsPayment,
  type StatisticsFilter,
} from "@/lib/statistics";
import type { EntityInfo } from "@/features/dashboard/format";
import { ComparisonTab } from "@/features/statistics/ComparisonTab";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";
import type { StatisticsContext } from "@/features/statistics/context";

/**
 * Zeitraumvergleich.
 *
 * Die Rechenregeln selbst sind in `lib/statistics/comparison` geprueft. Hier
 * geht es um die beiden Zusagen der Oberflaeche:
 *
 * 1. Die Kappung wird **benannt** — eine Zahl mit der Ueberschrift „2026", die
 *    nur bis Juli reicht, waere sonst irrefuehrend.
 * 2. Jeder verlinkte Betrag fuehrt in eine Liste, die **genau diese** Zahlung
 *    enthaelt. Der angeschnittene Monat wird deshalb nicht verlinkt: Die
 *    Zahlungsliste kennt nur ganze Monate.
 */

// „Heute" ist der 29. Juli 2026 — 2026 laeuft, 2025 ist abgeschlossen.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 29, 12, 0, 0));
});
afterAll(() => {
  vi.useRealTimers();
});

/**
 * Schaltet zwischen Tabelle (ab `md`) und Liste um. `useMediaQuery` liest
 * `matchMedia` bei jedem Rendern, ein Austausch vor `render` genuegt also.
 */
function setViewport(breite: "breit" | "schmal") {
  const matches = breite === "breit";
  window.matchMedia = (query: string): MediaQueryList => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// Standard ist die breite Darstellung; die Telefonansicht wird eigens geprueft.
beforeEach(() => {
  setViewport("breit");
});

let seq = 0;
function p(payDate: string, net: string, security = "sec-a"): AnalyticsPayment {
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

const PAYMENTS: AnalyticsPayment[] = [
  // 2026 bis zum Stichtag: 120 + 130 = 250 €.
  p("2026-03-15", "120.00"),
  p("2026-06-15", "130.00"),
  // 2025 bis zum selben Tag: 100 + 100 = 200 €.
  p("2025-03-15", "100.00"),
  p("2025-06-15", "100.00"),
  // Nach dem Stichtag des Vorjahres — darf im Vergleich nicht auftauchen.
  p("2025-09-15", "500.00"),
  p("2025-12-15", "500.00"),
  // Anderes Unternehmen, im aktuellen Zeitraum.
  p("2026-05-15", "70.00", "sec-b"),
  // Aelteres Jahr — damit die Auswahl mehr als zwei Jahre kennt.
  p("2024-03-15", "90.00"),
];

function renderTab(
  query = "",
  filter: StatisticsFilter = EMPTY_STATISTICS_FILTER,
  payments: AnalyticsPayment[] = PAYMENTS,
) {
  const context: StatisticsContext = {
    payments: filterPayments(payments, filter),
    allPayments: payments,
    securities: new Map<string, EntityInfo>([
      ["sec-a", { name: "Alpha AG", archived: false }],
      ["sec-b", { name: "Beta SE", archived: false }],
    ]),
    depots: new Map<string, EntityInfo>([
      ["dep-1", { name: "Hauptdepot", archived: false }],
    ]),
    filter,
  };
  return render(
    <MemoryRouter initialEntries={[`/statistiken/vergleich${query}`]}>
      <Routes>
        <Route path="/statistiken" element={<Outlet context={context} />}>
          <Route path="vergleich" element={<ComparisonTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Die Zeile eines Monats aus der Monatstabelle. */
function monthRow(name: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(`^${name}`) });
}

/**
 * Die Listenzeile zu einer Beschriftung (schmale Darstellung). `li` uebernimmt
 * seinen Namen nicht aus dem Inhalt, es gibt also keine Rollenabfrage dafuer.
 */
function card(label: string): HTMLElement {
  const zeile = screen.getByText(label).closest("li");
  if (!zeile) throw new Error(`Keine Listenzeile fuer „${label}".`);
  return zeile;
}

describe("ComparisonTab — gleicher Ausschnitt", () => {
  it("stellt 2026 gegen 2025 und kappt beide Seiten am Stichtag", () => {
    renderTab();
    // 250 + 70 (Beta SE) = 320 € auf der aktuellen Seite.
    expect(screen.getAllByText("320,00 €").length).toBeGreaterThan(0);
    // 200 € statt der vollen 1.200 € des Vorjahres.
    expect(screen.getAllByText("200,00 €").length).toBeGreaterThan(0);
    expect(screen.queryByText("1.200,00 €")).not.toBeInTheDocument();
  });

  it("nennt je Seite die Zahl der Eingaenge — ohne Datumsspanne", () => {
    renderTab();
    // Die Spanne („01.01.2026 – 29.07.2026") stand frueher unter jedem Betrag
    // und wiederholte damit in jeder Kachel, was die Ueberschrift schon sagt.
    // Die Kappung selbst zeigen die Zahlen daneben (Test oben).
    expect(screen.getByText("3 Zahlungen")).toBeInTheDocument();
    expect(screen.getByText("2 Zahlungen")).toBeInTheDocument();
    expect(screen.queryByText(/29\.07\.2026/)).not.toBeInTheDocument();
  });

  it("weist die Veraenderung gegenueber dem Vergleichsjahr aus", () => {
    renderTab();
    expect(screen.getByText("+120,00 € · +60,0 %")).toBeInTheDocument();
    expect(screen.getByText("gegenüber 2025")).toBeInTheDocument();
  });

  it("rechnet ungekappt, wenn beide Jahre abgeschlossen sind", () => {
    renderTab("?basis=2025&referenz=2024");
    // Volles Jahr 2025: 200 + 1.000 = 1.200 € — die 1.000 € aus September und
    // Dezember zaehlen mit, weil hier nichts gekappt wird.
    expect(screen.getAllByText("1.200,00 €").length).toBeGreaterThan(0);
  });
});

describe("ComparisonTab — Drill-down", () => {
  it("fuehrt von einem abgeschlossenen Monat in die passende Zahlungsliste", () => {
    renderTab();
    const march = monthRow("März");
    const link = within(march).getByRole("link", { name: /März 2026/ });
    expect(link).toHaveAttribute("href", "/eingaenge?year=2026&month=3");
  });

  it("traegt den aktiven Unternehmensfilter in das Drill-down-Ziel", () => {
    renderTab("", { ...EMPTY_STATISTICS_FILTER, securityId: "sec-a" });
    const march = monthRow("März");
    const link = within(march).getByRole("link", { name: /März 2026/ });
    expect(link).toHaveAttribute("href", "/eingaenge?year=2026&month=3&security=sec-a");
  });

  it("verlinkt den angeschnittenen Monat nicht", () => {
    // Juli 2026 endet im Vergleich am 29.; die Zahlungsliste kennt nur den
    // ganzen Monat und zeigte damit mehr als die Zahl daneben.
    renderTab();
    const july = monthRow("Juli");
    expect(within(july).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/Angeschnittener Monat/)).toBeInTheDocument();
  });

  it("verlinkt keinen Monat ohne Zahlungen", () => {
    renderTab();
    expect(within(monthRow("Januar")).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("ComparisonTab — Monatstabelle", () => {
  it("stellt beide Seiten mit ihrer Differenz nebeneinander", () => {
    renderTab();
    const march = monthRow("März");
    expect(within(march).getByText("120,00 €")).toBeInTheDocument();
    expect(within(march).getByText("100,00 €")).toBeInTheDocument();
    expect(within(march).getByText("+20,00 €")).toBeInTheDocument();
  });

  it("zeigt nur die Monate bis zum Stichtag", () => {
    renderTab();
    expect(screen.queryByRole("row", { name: /^August/ })).not.toBeInTheDocument();
    expect(monthRow("Juli")).toBeInTheDocument();
  });
});

describe("ComparisonTab — Auswahl", () => {
  it("wechselt in den rollierenden Zwoelfmonatsvergleich", () => {
    renderTab("?modus=rollierend");
    expect(screen.getAllByText("Letzte 12 Monate").length).toBeGreaterThan(0);
    // Aug 2025 – Jul 2026: 500 + 500 + 120 + 70 + 130 = 1.320 €; die zwoelf
    // Monate davor tragen 100 + 100 = 200 €.
    expect(screen.getAllByText("1.320,00 €").length).toBeGreaterThan(0);
    expect(screen.getAllByText("200,00 €").length).toBeGreaterThan(0);
    expect(screen.getByText("gegenüber den 12 Monaten davor")).toBeInTheDocument();
  });

  it("uebernimmt ein anderes Vergleichsjahr aus der Auswahl", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("verglichen mit"), {
      target: { value: "2024" },
    });
    expect(screen.getByText("gegenüber 2024")).toBeInTheDocument();
  });

  it("bietet das laufende Jahr nicht als sein eigenes Vergleichsjahr an", () => {
    renderTab();
    const options = within(screen.getByLabelText("verglichen mit")).getAllByRole(
      "option",
    );
    expect(options.map((option) => option.textContent)).not.toContain("2026");
  });

  it("sagt, dass der Jahresfilter hier nicht wirkt", () => {
    // Sonst waere unklar, warum die Seite trotz „Jahr: 2025" zwei Jahre zeigt.
    renderTab("", { ...EMPTY_STATISTICS_FILTER, year: 2025 });
    expect(screen.getByText(/Der Jahresfilter \(2025\) wirkt/)).toBeInTheDocument();
  });

  it("vergleicht auch ein Jahr ohne eigene Zahlungen", () => {
    // Anfang eines Jahres ist die aktuelle Seite leer — der Vergleich muss
    // trotzdem stehen, statt die Auswahl gar nicht erst anzubieten.
    renderTab("?basis=2026&referenz=2025", EMPTY_STATISTICS_FILTER, [
      p("2025-03-15", "100.00"),
    ]);
    expect(screen.getAllByText("0,00 €").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100,00 €").length).toBeGreaterThan(0);
  });
});

describe("ComparisonTab — Monat gegen Monat", () => {
  it("stellt denselben Kalendermonat zweier Jahre gegenueber", () => {
    renderTab("?modus=monate&monat=3&basis=2026&referenz=2025");
    // Je zweimal: als Kennzahlkarte und als Spaltenkopf der Tabelle.
    expect(screen.getAllByText("Mär 2026")).toHaveLength(2);
    expect(screen.getAllByText("Mär 2025")).toHaveLength(2);
    expect(screen.getAllByText("120,00 €").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100,00 €").length).toBeGreaterThan(0);
  });

  it("schluesselt nach Unternehmen auf statt nach Monaten", () => {
    renderTab("?modus=monate&monat=5&basis=2026&referenz=2025");
    expect(screen.getByText("Nach Unternehmen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Beta SE" })).toHaveAttribute(
      "href",
      "/unternehmen/sec-b",
    );
    expect(screen.queryByText("Monat für Monat")).not.toBeInTheDocument();
  });

  it("fuehrt von einem Unternehmen in dessen Zahlungen dieses Monats", () => {
    renderTab("?modus=monate&monat=5&basis=2026&referenz=2025");
    const zeile = screen.getByRole("row", { name: /Beta SE/ });
    const link = within(zeile).getByRole("link", { name: /Mai 2026/ });
    expect(link).toHaveAttribute("href", "/eingaenge?year=2026&month=5&security=sec-b");
  });

  it("kappt den laufenden Monat auf beiden Seiten", () => {
    // Je ein Eingang vor und einer nach dem 29.: Ohne Kappung stuenden in den
    // Kacheln die vollen Juli-Summen — auch im abgeschlossenen Vorjahr, dessen
    // Monat sonst mehr Tage umfasste als der laufende.
    renderTab("?modus=monate&monat=7&basis=2026&referenz=2025", EMPTY_STATISTICS_FILTER, [
      p("2026-07-10", "40.00"),
      p("2026-07-31", "1000.00"),
      p("2025-07-10", "30.00"),
      p("2025-07-31", "900.00"),
    ]);
    expect(screen.getAllByText("40,00 €").length).toBeGreaterThan(0);
    expect(screen.getAllByText("30,00 €").length).toBeGreaterThan(0);
    expect(screen.queryByText("1.040,00 €")).not.toBeInTheDocument();
    expect(screen.queryByText("930,00 €")).not.toBeInTheDocument();
  });

  it("bietet im laufenden Jahr keinen Monat an, der noch nicht begonnen hat", () => {
    renderTab("?modus=monate&basis=2026");
    const monate = within(screen.getByLabelText("Monat")).getAllByRole("option");
    expect(monate.map((option) => option.textContent)).toEqual([
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
    ]);
  });

  it("verzichtet auf den kumulierten Verlauf", () => {
    // Eine Kurve ueber die Tage eines Monats mit zwei, drei Zahlungen sagt
    // nichts, was die Zahlen daneben nicht schon sagen.
    renderTab("?modus=monate&monat=3");
    expect(screen.queryByText("Kumulierter Verlauf")).not.toBeInTheDocument();
  });

  it("meldet einen Monat ohne Zahlungen, statt eine leere Tabelle zu zeigen", () => {
    renderTab("?modus=monate&monat=2&basis=2026&referenz=2025");
    expect(
      screen.getByText(/In keinem der beiden Monate gab es Dividendeneingänge/),
    ).toBeInTheDocument();
  });
});

describe("ComparisonTab — Darstellung auf dem Telefon", () => {
  /**
   * Vier Spalten mit Beträgen und Namen passen bei 390 px nicht nebeneinander.
   * Statt die Tabelle seitlich verschiebbar zu machen, stehen die Zahlen
   * untereinander: je Zeile der Name mit der Differenz, darunter beide
   * Zeiträume.
   */
  beforeEach(() => {
    setViewport("schmal");
  });

  it("stellt die Monate als Liste dar, nicht als Tabelle", () => {
    renderTab();
    // Die Datentabelle des Diagramms bleibt eine Tabelle — gemeint ist die
    // Aufschluesselung darunter.
    expect(
      screen.queryByRole("table", { name: /Netto-Dividenden je Monat/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /Netto-Dividenden je Monat/ }),
    ).toBeInTheDocument();
  });

  it("nennt je Zeile beide Zeitraeume mit ihrem Betrag", () => {
    renderTab();
    const maerz = card("März");
    expect(within(maerz).getByText("120,00 €")).toBeInTheDocument();
    expect(within(maerz).getByText("100,00 €")).toBeInTheDocument();
    expect(within(maerz).getByText("+20,00 €")).toBeInTheDocument();
    // Beide Zeitraeume sind je Zeile benannt, nicht nur oben in einem Kopf.
    expect(within(maerz).getByText("2026")).toBeInTheDocument();
    expect(within(maerz).getByText("2025")).toBeInTheDocument();
  });

  it("behaelt den Drill-down auch in der Liste", () => {
    renderTab();
    const maerz = card("März");
    expect(within(maerz).getByRole("link", { name: /März 2026/ })).toHaveAttribute(
      "href",
      "/eingaenge?year=2026&month=3",
    );
  });

  it("stellt auch den Monatsvergleich als Liste dar", () => {
    renderTab("?modus=monate&monat=5&basis=2026&referenz=2025");
    expect(
      screen.queryByRole("table", { name: /je Unternehmen/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: /je Unternehmen/ })).toBeInTheDocument();
    const beta = card("Beta SE");
    expect(within(beta).getByRole("link", { name: "Beta SE" })).toHaveAttribute(
      "href",
      "/unternehmen/sec-b",
    );
  });
});
