import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@/components/ui/toast";
import { PaymentComposerProvider } from "@/features/payments/PaymentComposer";
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";
import { setViewportWide } from "../../support/viewport";

// Die Seite haengt an drei Abfragen; sie werden hier durch Fixtures ersetzt,
// damit der Test die Ansicht prueft und nicht das Netz.
const zahlungen = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("@/features/payments/hooks", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/payments/hooks")>();
  return {
    ...original,
    useAllPayments: () => ({ data: zahlungen.current, isLoading: false }),
    useArchivePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUnarchivePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeletePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({
    data: [
      {
        id: "s1",
        name: "Apple Inc.",
        ticker: "AAPL",
        archived_at: null,
        payout_months: [],
      },
      {
        id: "s2",
        name: "Allianz SE",
        ticker: "ALV",
        archived_at: null,
        payout_months: [],
      },
    ],
  }),
}));

vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({
    data: [
      { id: "d1", name: "Depot A", base_currency: "EUR", archived_at: null },
      { id: "d2", name: "Depot B", base_currency: "EUR", archived_at: null },
    ],
  }),
}));

const { PaymentsPage } = await import("@/features/payments/PaymentsPage");

function zahlung(overrides: Partial<PaymentListRow> = {}): PaymentListRow {
  return {
    id: "p1",
    security_id: "s1",
    depot_id: "d1",
    pay_date: "2026-03-10",
    net_amount: "50.00",
    gross_amount: "50.00",
    original_currency: "EUR",
    payment_type: "regular",
    source: "manual",
    import_id: null,
    archived_at: null,
    created_at: "2026-03-10T00:00:00Z",
    updated_at: "2026-03-10T00:00:00Z",
    ...overrides,
  };
}

function renderList(rows: PaymentListRow[], route = "/eingaenge") {
  zahlungen.current = rows;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          {/* Wie in der App-Huelle: Die Seite oeffnet „Neue Dividende" als
              Overlay und braucht dafuer den Anbieter. */}
          <PaymentComposerProvider>
            <PaymentsPage />
          </PaymentComposerProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("PaymentsPage", () => {
  // jsdom kennt kein Rollen. Die Liste darf es nicht aufrufen: Nachgeladenes
  // wird angehaengt, und der Router stellt die Position selbst wieder her.
  let scrollTo: MockInstance<typeof window.scrollTo>;

  beforeEach(() => {
    zahlungen.current = [];
    scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    scrollTo.mockRestore();
    setViewportWide(false);
  });

  it("zeigt die Eingaenge mit Unternehmen und Betrag", () => {
    renderList([
      zahlung({ id: "a", security_id: "s1", net_amount: "50.00" }),
      zahlung({
        id: "b",
        security_id: "s2",
        net_amount: "120.00",
        pay_date: "2026-05-02",
      }),
    ]);

    // Ueber die Rolle, nicht ueber den Text: Die Namen stehen auch in den
    // Auswahllisten der Filterleiste.
    // Name, Datum, Depot und Betrag stehen in einer Zeile, die als Ganzes
    // zur Detailseite fuehrt.
    expect(
      screen.getByRole("link", { name: /Apple Inc\..*10\.03\.2026.*Depot A.*50,00\s€/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Allianz SE.*02\.05\.2026.*120,00\s€/ }),
    ).toBeInTheDocument();
  });

  it("gruppiert nach Monat und nennt je Monat die Summe", () => {
    renderList([
      zahlung({ id: "a", pay_date: "2026-05-02", net_amount: "20.00" }),
      zahlung({ id: "b", pay_date: "2026-05-20", net_amount: "30.00" }),
      zahlung({ id: "c", pay_date: "2026-03-10", net_amount: "50.00" }),
    ]);

    const mai = screen.getByRole("heading", { name: /Mai 2026/ });
    expect(mai).toHaveTextContent("50,00 €");
    expect(screen.getByRole("heading", { name: /März 2026/ })).toHaveTextContent(
      "50,00 €",
    );
    // Neueste zuerst: Mai steht vor Maerz.
    const monate = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(monate[0]).toMatch(/^Mai 2026/);
    expect(monate[1]).toMatch(/^März 2026/);
  });

  it("verzichtet auf Monatsgruppen, wenn nicht nach Datum sortiert wird", () => {
    renderList(
      [
        zahlung({ id: "a", pay_date: "2026-05-02" }),
        zahlung({ id: "c", pay_date: "2026-03-10" }),
      ],
      "/eingaenge?sort=amount",
    );
    expect(screen.queryByRole("heading", { name: /Mai 2026/ })).not.toBeInTheDocument();
  });

  it("nennt Anzahl und Summe der Auswahl", () => {
    renderList([
      zahlung({ id: "a", net_amount: "20.00" }),
      zahlung({ id: "b", net_amount: "30.50" }),
    ]);
    expect(screen.getByText(/^2 Eingänge/)).toHaveTextContent("2 Eingänge · 50,50 €");
  });

  it("filtert nach Unternehmen und nennt die Trefferzahl", async () => {
    const user = userEvent.setup();
    renderList([
      zahlung({ id: "a", security_id: "s1" }),
      zahlung({ id: "b", security_id: "s2" }),
    ]);

    await user.selectOptions(screen.getByLabelText("Unternehmen"), "s1");

    expect(screen.getByText(/^1 Eingang/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Apple Inc\./ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Allianz SE/ })).not.toBeInTheDocument();
  });

  it("blendet stornierte Eingaenge aus, bis man sie anfordert", async () => {
    const user = userEvent.setup();
    renderList([
      zahlung({ id: "a", security_id: "s1" }),
      zahlung({ id: "b", security_id: "s2", archived_at: "2026-04-01T00:00:00Z" }),
    ]);

    expect(screen.queryByRole("link", { name: /Allianz SE/ })).not.toBeInTheDocument();

    // Der Status ist ein Filter der Leiste, kein Kontrollkaestchen am Seitenende.
    await user.selectOptions(screen.getByLabelText("Status"), "all");

    expect(screen.getByRole("link", { name: /Allianz SE/ })).toBeInTheDocument();
    expect(screen.getByText("Storniert")).toBeInTheDocument();
  });

  it("laedt weitere Eingaenge nach, statt zu blaettern", async () => {
    const user = userEvent.setup();
    const viele = Array.from({ length: 30 }, (_, index) =>
      zahlung({
        id: `p${String(index)}`,
        pay_date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      }),
    );
    renderList(viele);

    expect(screen.getByText("25 von 30 angezeigt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "5 weitere laden" }));

    expect(screen.getAllByRole("link", { name: /Apple Inc\./ })).toHaveLength(30);
    expect(
      screen.queryByRole("button", { name: /weitere laden/ }),
    ).not.toBeInTheDocument();
    // Angehaengt, nicht umgeblaettert: Die Position bleibt, wo sie ist.
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("oeffnet die geladene Menge aus der Adresse — der Weg zurueck von einem Eingang endet dort", () => {
    renderList(
      Array.from({ length: 30 }, (_, index) => zahlung({ id: `p${String(index)}` })),
      "/eingaenge?page=2",
    );

    expect(screen.getAllByRole("link", { name: /Apple Inc\./ })).toHaveLength(30);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("zeigt nach einem Filterwechsel wieder die ersten Eingaenge", async () => {
    const user = userEvent.setup();
    renderList(
      Array.from({ length: 30 }, (_, index) =>
        zahlung({ id: `p${String(index)}`, security_id: index < 28 ? "s1" : "s2" }),
      ),
      "/eingaenge?page=2",
    );

    await user.selectOptions(screen.getByLabelText("Unternehmen"), "s1");

    expect(screen.getByText("25 von 28 angezeigt")).toBeInTheDocument();
  });

  it("fuehrt auf dem Telefon mit einer Tippflaeche je Karte zur Detailseite", () => {
    renderList([zahlung({ id: "a" })]);

    // Eine Karte, ein Ziel: Die Aktionen stehen auf der Detailseite.
    const karte = screen.getByRole("link", { name: /Apple Inc\./ });
    expect(karte).toHaveAttribute("href", "/eingaenge/a");
    expect(screen.queryByRole("button", { name: /stornieren/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /löschen/ })).not.toBeInTheDocument();
  });

  it("bietet auf breiten Schirmen je Zeile Bearbeiten, Stornieren und Löschen", () => {
    setViewportWide(true);
    renderList([zahlung({ id: "a" })]);

    // Die Liste kennt keine Mehrfachauswahl mehr: Was zu tun ist, steht an
    // der Zeile selbst.
    expect(screen.queryByLabelText(/auswählen/)).not.toBeInTheDocument();
    // Die Namen nennen den Eingang: 25 gleichlautende „Bearbeiten" liessen
    // sich per Screenreader nicht auseinanderhalten.
    expect(
      screen.getByRole("link", { name: "Apple Inc. vom 10.03.2026 bearbeiten" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apple Inc. vom 10.03.2026 stornieren" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Apple Inc. vom 10.03.2026 dauerhaft löschen",
      }),
    ).toBeInTheDocument();
  });

  it("zaehlt nur stornierte Eingaenge nicht als Bestand", () => {
    // Geladen wird immer alles; der Leerzustand folgt trotzdem dem Filter.
    renderList([zahlung({ id: "a", archived_at: "2026-04-01T00:00:00Z" })]);
    expect(screen.getByText("Noch kein Dividendeneingang erfasst")).toBeInTheDocument();
  });

  it("bietet Jahre nur stornierter Eingaenge erst mit den Stornierten an", async () => {
    const user = userEvent.setup();
    renderList([
      zahlung({ id: "a", pay_date: "2026-03-10" }),
      zahlung({ id: "b", pay_date: "2024-03-10", archived_at: "2026-04-01T00:00:00Z" }),
    ]);

    const jahre = () =>
      Array.from(
        screen.getByLabelText<HTMLSelectElement>("Jahr").options,
        (option) => option.value,
      );
    expect(jahre()).toEqual(["", "2026"]);

    await user.selectOptions(screen.getByLabelText("Status"), "all");

    expect(jahre()).toEqual(["", "2026", "2024"]);
  });

  it("erklaert den leeren Zustand ohne Eingaenge", () => {
    renderList([]);
    expect(screen.getByText("Noch kein Dividendeneingang erfasst")).toBeInTheDocument();
  });

  it("unterscheidet den leeren Bestand von einer leeren Auswahl", async () => {
    const user = userEvent.setup();
    renderList([zahlung({ id: "a", security_id: "s1" })]);

    await user.selectOptions(screen.getByLabelText("Unternehmen"), "s2");

    expect(
      screen.getByText("Keine Eingänge für die aktuelle Auswahl"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Noch kein Dividendeneingang erfasst"),
    ).not.toBeInTheDocument();
  });
});
