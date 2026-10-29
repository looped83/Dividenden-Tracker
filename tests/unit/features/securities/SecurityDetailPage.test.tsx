import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/toast";
import { PaymentComposerProvider } from "@/features/payments/PaymentComposer";
import { MemoryRouter, Route, Routes } from "react-router";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * Detailseite eines Unternehmens.
 *
 * Geprueft wird vor allem, dass die Seite **keine eigene Aggregation**
 * mitbringt: Ihre Zahlen entstehen aus derselben Analytics-Schicht wie
 * Uebersicht und Statistik. Weicht hier etwas ab, laufen zwei Wahrheiten
 * auseinander — genau das soll die gemeinsame Datenquelle verhindern.
 */

const SECURITY_ID = "sec-a";

let seq = 0;
function payment(
  payDate: string,
  net: string,
  securityId = SECURITY_ID,
): AnalyticsPayment {
  seq += 1;
  return {
    id: `pay-${String(seq)}`,
    payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId,
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

const payments: AnalyticsPayment[] = [
  payment("2024-03-15", "100.00"),
  payment("2024-09-15", "120.00"),
  payment("2025-03-15", "150.00"),
  // Fremdes Unternehmen — darf in keiner Kennzahl auftauchen.
  payment("2025-04-15", "999.00", "sec-b"),
];

const securities = [
  {
    id: SECURITY_ID,
    name: "Alpha AG",
    ticker: "ALP",
    isin: "DE0001234567",
    wkn: null,
    country: "DE",
    sector: null,
    currency: "EUR",
    note: null,
    data_quality: "incomplete",
    default_depot_id: null,
    payout_months: [3, 9],
    reinvest_since: null,
    archived_at: null,
  },
];

vi.mock("@/features/dashboard/hooks", () => ({
  useAnalyticsPayments: () => ({ payments, paymentsQuery: { isLoading: false } }),
}));
vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({ data: securities, isLoading: false }),
  // Ohne importierten Depotstand — die Positionskarte bleibt dann aus, und
  // diese Tests pruefen weiterhin ausschliesslich die Zahlen aus den
  // erhaltenen Eingaengen.
  useSecuritySnapshots: () => ({ data: [], isLoading: false }),
  // Bearbeiten, Archivieren und Loeschen stehen im Kopf der Seite.
  useArchiveSecurity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSecurity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSecurity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSecurity: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));
// Termine des Dividendenkalenders; einzelne Tests setzen einen Zahltag.
let calendarEvents: CalendarEvent[] = [];
vi.mock("@/features/calendar/resolvedEvents", () => ({
  useResolvedCalendarEvents: () => ({ events: calendarEvents }),
}));
vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({ data: [{ id: "dep-1", name: "Hauptdepot", archived_at: null }] }),
}));

// Sparpläne (seit 2.21.0): keiner hinterlegt.
vi.mock("@/features/planner/savingsPlanHooks", () => ({
  useSavingsPlans: () => ({ data: [], isLoading: false }),
  useSaveSavingsPlans: () => ({ mutateAsync: vi.fn(), isPending: false }),
  newSavingsPlanId: () => "plan1",
}));

// Gewichtung: keine eigene, Standard 0 % (seit 2.25.0).
const positionCaps = { current: new Map<string, number>() };
const saveCaps = vi.fn();
vi.mock("@/features/planner/positionCaps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/planner/positionCaps")>()),
  usePositionCaps: () => ({ data: positionCaps.current, isLoading: false }),
  useSavePositionCap: () => ({ mutateAsync: saveCaps, isPending: false }),
}));
const { SecurityDetailPage } = await import("@/features/securities/SecurityDetailPage");

function renderPage(id = SECURITY_ID) {
  return render(
    <ToastProvider>
      <PaymentComposerProvider>
        <MemoryRouter initialEntries={[`/depot/${id}`]}>
          <Routes>
            <Route path="/depot/:id" element={<SecurityDetailPage />} />
          </Routes>
        </MemoryRouter>
      </PaymentComposerProvider>
    </ToastProvider>,
  );
}

describe("SecurityDetailPage", () => {
  // Das letzte volle Jahr und die naechste Dividende haengen am heutigen Tag.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T12:00:00"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    calendarEvents = [];
  });

  it("nennt das Asset in der Ueberschrift", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Alpha AG/ })).toBeInTheDocument();
  });

  it("rechnet nur die Zahlungen dieses Unternehmens", () => {
    renderPage();
    // 100 + 120 + 150 = 370; die 999 des anderen Unternehmens bleibt draussen.
    expect(screen.getByText("370,00 €")).toBeInTheDocument();
    expect(screen.queryByText("999,00 €")).not.toBeInTheDocument();
  });

  it("zaehlt die Eingaenge", () => {
    renderPage();
    expect(screen.getByText(/^3 Dividenden/)).toBeInTheDocument();
  });

  it("stellt die letzten Eingaenge vor Ausschuettungsplan, Planung und Stammdaten", () => {
    renderPage();
    const eingaenge = screen.getByRole("heading", { name: "Letzte Dividenden" });
    for (const name of [/^Ausschüttungsplan/, "Planung", "Stammdaten"]) {
      const spaeter = screen.getByRole("heading", { name });
      expect(
        eingaenge.compareDocumentPosition(spaeter) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${String(name)} steht vor den letzten Eingängen`,
      ).toBeTruthy();
    }
  });

  it("stellt das letzte volle Jahr, die naechste Dividende und den Schnitt in den Kopf", () => {
    renderPage();
    const kopf = (label: string) => {
      const feld = screen.getByText(label).closest("div");
      if (!feld) throw new Error(`Kennzahl ${label} nicht gefunden.`);
      return within(feld);
    };
    // 2026 laeuft noch — verglichen wird 2025 (150) mit 2024 (220).
    expect(kopf("Erhalten 2025").getByText("150,00 €")).toBeInTheDocument();
    expect(kopf("Erhalten 2025").getByText(/31,8\s%/)).toBeInTheDocument();
    // Plan Maerz/September, letzte Zahlung Maerz 2025: Der September 2025
    // liegt in der Vergangenheit, die naechste steht im Maerz 2027.
    expect(kopf("Nächste").getByText("Mär 2027")).toBeInTheDocument();
    // Ohne Termin im Kalender vermutet: Maerz 2026 fehlt, also die letzte (150).
    expect(screen.getByText("Nächste").closest("div")).toHaveTextContent(
      /≈ 150,00\s€ vermutet/,
    );
    // Ohne Depotstand rueckt der Schnitt nach: 370 / 3.
    expect(kopf("Ø je Dividende").getByText("123,33 €")).toBeInTheDocument();
  });

  it("nimmt die naechste Dividende mit Datum aus dem Kalender, wenn angekuendigt", () => {
    calendarEvents = [
      {
        id: "ev-1",
        externalUid: "uid-1",
        eventType: "payment",
        eventState: "active",
        title: "Alpha AG",
        companyName: "Alpha AG",
        matchedCompanyName: "Alpha AG",
        reinvestSince: null,
        expectedAmount: Money.fromString("160.00", EUR),
        sourcePortfolio: null,
        description: null,
        location: null,
        externalUrl: null,
        categories: [],
        date: "2026-11-20",
        endDate: null,
        startsAt: null,
        endsAt: null,
        isAllDay: true,
      },
    ];
    renderPage();
    const feld = screen.getByText("Nächste").closest("div");
    if (!feld) throw new Error("Kennzahl Nächste nicht gefunden.");
    expect(within(feld).getByText("20.11.2026")).toBeInTheDocument();
    expect(feld).toHaveTextContent(/160,00\s€/);
    expect(feld).not.toHaveTextContent(/vermutet|Kalender/);
  });

  it("fuehrt vom letzten vollen Jahr in die gefilterte Zahlungsliste", () => {
    renderPage();
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(`/eingaenge?security=${SECURITY_ID}&year=2025`);
    // Die Balken und ihre Datentabelle fuehren nirgendwohin, nur der Tooltip.
    expect(hrefs).not.toContain(`/eingaenge?security=${SECURITY_ID}&year=2024`);
  });

  it("zeigt den Ausschuettungsplan und kennzeichnet die geplanten Monate", () => {
    renderPage();
    // Alle zwoelf Monate stehen da; geplante sind fuer Hilfsmittel als solche
    // ausgezeichnet, nicht nur farblich (Farbe allein traegt keine Aussage).
    // Im Plan, nicht in den Datumsfeldern der letzten Eingänge.
    const plan = within(screen.getByRole("region", { name: /^Ausschüttungsplan/ }));
    expect(plan.getByText("Mär")).toBeInTheDocument();
    expect(plan.getByText("Jan")).toBeInTheDocument();
    expect(screen.getAllByText("Geplant:")).toHaveLength(2);
    expect(screen.getAllByText("Nicht geplant:")).toHaveLength(10);
  });

  // Seit 2.45.0 zeigt die Seite die Planung nur an; geaendert wird im
  // Formular „Asset bearbeiten".
  it("zeigt ohne Sparplan nur den Hinweis, kein Bedienelement", () => {
    renderPage();
    const section = within(screen.getByRole("region", { name: "Planung" }));
    expect(section.getByText("Kein Sparplan")).toBeInTheDocument();
    expect(section.queryByRole("button")).not.toBeInTheDocument();
    expect(section.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("zeigt die Gewichtung als eigene Zeile vor der Zielgewichtung", () => {
    renderPage();
    const section = screen.getByRole("region", { name: "Planung" });
    const text = section.textContent;
    expect(text.indexOf("Gewichtung")).toBeLessThan(text.indexOf("Zielgewichtung"));
    expect(
      within(section).getByText("nicht im aktuellen Depotstand"),
    ).toBeInTheDocument();
  });

  it("zeigt eine gespeicherte 0 als Zielgewichtung", () => {
    positionCaps.current = new Map([[SECURITY_ID, 0]]);
    try {
      renderPage();
      const section = within(screen.getByRole("region", { name: "Planung" }));
      expect(section.getByText(/^0\s%$/)).toBeInTheDocument();
      expect(section.queryByText(/ohne Zielgewichtung/)).not.toBeInTheDocument();
    } finally {
      positionCaps.current = new Map();
    }
  });

  it("bearbeitet Zielgewichtung und Sparplan im Formular", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    const dialog = within(screen.getByRole("dialog", { name: "Asset bearbeiten" }));
    expect(dialog.getByRole("textbox", { name: "Zielgewichtung" })).toHaveValue("");
    expect(dialog.getByRole("button", { name: "Sparplan" })).toBeInTheDocument();
    expect(
      dialog.getByRole("switch", { name: "Dividenden reinvestieren" }),
    ).toBeInTheDocument();
  });

  it("nennt den Rhythmus am Ausschuettungsplan", () => {
    renderPage();
    expect(
      screen.getByRole("region", { name: "Ausschüttungsplan halbjährlich" }),
    ).toBeInTheDocument();
  });

  it("zeigt die Reinvestition nur an", () => {
    renderPage();
    expect(
      screen.queryByRole("switch", { name: "Dividenden reinvestieren" }),
    ).not.toBeInTheDocument();
    const plan = within(screen.getByRole("region", { name: /^Ausschüttungsplan/ }));
    expect(plan.getByText("Reinvestition")).toBeInTheDocument();
    expect(plan.getByText("aus")).toBeInTheDocument();
  });

  it("weist auf unvollstaendige Stammdaten hin", () => {
    renderPage();
    expect(screen.getByText(/Stammdaten sind unvollständig/)).toBeInTheDocument();
  });

  it("verlinkt die Stammdaten ueber die ISIN auf DivvyDiary", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /DivvyDiary/ })).toHaveAttribute(
      "href",
      "https://divvydiary.com/DE0001234567",
    );
  });

  it("verlinkt die letzten Eingaenge auf ihre Detailseite", () => {
    renderPage();
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs.some((href) => href?.startsWith("/eingaenge/pay-"))).toBe(true);
  });

  it("fuehrt von den letzten Eingaengen zur ganzen, gefilterten Liste", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Alle 3" })).toHaveAttribute(
      "href",
      `/eingaenge?security=${SECURITY_ID}`,
    );
  });

  it("traegt Bearbeiten und Archivieren im Kopf, Loeschen erst archiviert", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Bearbeiten" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivieren" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Endgültig löschen" }),
    ).not.toBeInTheDocument();
  });

  it("meldet ein unbekanntes Asset, statt eine leere Seite zu zeigen", () => {
    renderPage("gibt-es-nicht");
    expect(screen.getByText("Asset nicht gefunden")).toBeInTheDocument();
  });

  describe("Rueckweg", () => {
    /**
     * Die Seite wird aus drei Richtungen erreicht (Assetliste,
     * Statistik, Zahlungsdetail) und laesst sich per Lesezeichen direkt
     * oeffnen. Sie braucht deshalb einen eigenen Rueckweg — und zwar in jedem
     * Zustand: Ein Zurueck, das erst nach dem Laden erscheint, fehlt genau
     * dann, wenn man es braucht.
     */
    it("fuehrt zurueck zum Depot", () => {
      renderPage();
      const back = screen.getByRole("link", { name: /Zum Bestand/ });
      expect(back).toHaveAttribute("href", "/depot");
    });

    it("steht auch bereit, wenn das Asset nicht existiert", () => {
      renderPage("gibt-es-nicht");
      expect(screen.getByRole("link", { name: /Zum Bestand/ })).toBeInTheDocument();
    });
  });
});
