import { describe, expect, it } from "vitest";
import { fieldChanges, matchPositions } from "@/features/securities/portfolioMatch";
import type { DivvyDiaryPosition } from "@/features/securities/divvydiaryCsv";
import type { Security } from "@/lib/supabase/repositories/securities";

function security(partial: Partial<Security> = {}): Security {
  return {
    id: "sec-a",
    user_id: "user-1",
    name: "Abbott Laboratories",
    ticker: null,
    isin: "US0028241000",
    wkn: null,
    country: null,
    sector: null,
    currency: null,
    note: null,
    data_quality: "incomplete",
    default_depot_id: null,
    payout_months: [],
    created_by_import_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...partial,
  };
}

function position(partial: Partial<DivvyDiaryPosition> = {}): DivvyDiaryPosition {
  return {
    sourceRow: 2,
    name: "Abbott Laboratories",
    ticker: "ABT",
    isin: "US0028241000",
    wkn: "850103",
    country: "US",
    sector: "Health Care",
    dividendCurrency: "USD",
    quantity: "10",
    buyinPerShare: null,
    buyinTotal: null,
    price: null,
    marketValue: null,
    gainAbsolute: null,
    gainRelative: null,
    allocation: null,
    dividendYield: null,
    dividendYieldOnBuyin: null,
    annualDividendTotal: null,
    dividendPerShare: null,
    dividendFrequency: "quarterly",
    dividendCagr: null,
    dividendCagrPeriod: null,
    nextExDate: null,
    nextPayDate: null,
    assetType: "equity",
    currency: "EUR",
    warnings: [],
    ...partial,
  };
}

describe("matchPositions", () => {
  it("ordnet über die ISIN zu, auch wenn der Name abweicht", () => {
    const [match] = matchPositions(
      [position({ name: "Abbott Laboratories Inc" })],
      [security({ name: "Abbott" })],
    );
    expect(match.matchKind).toBe("isin");
    expect(match.securityId).toBe("sec-a");
    // Angezeigt wird die **eigene** Schreibweise.
    expect(match.securityName).toBe("Abbott");
  });

  it("greift auf die WKN zurück, wenn die ISIN nicht passt", () => {
    const [match] = matchPositions(
      [position({ isin: "US1234567890" })],
      [security({ isin: null, wkn: "850103", name: "Etwas anderes" })],
    );
    expect(match.matchKind).toBe("wkn");
    expect(match.securityId).toBe("sec-a");
  });

  it("greift auf den Ticker zurück, wenn ISIN und WKN nicht passen", () => {
    const [match] = matchPositions(
      [position({ isin: "US1234567890", wkn: null })],
      [security({ isin: null, wkn: null, ticker: "ABT", name: "Etwas anderes" })],
    );
    expect(match.matchKind).toBe("ticker");
  });

  it("ordnet über den exakten Namen zu, wenn keine Kennung passt", () => {
    const [match] = matchPositions(
      [position({ isin: "US1234567890", wkn: null, ticker: null })],
      [security({ isin: null, wkn: null, ticker: null })],
    );
    expect(match.matchKind).toBe("name");
  });

  it("ordnet einen nur ähnlichen Namen NICHT automatisch zu", () => {
    // Dieselbe Zurueckhaltung wie im Import (IMPORT_SPEC.md §6): Bei
    // Aehnlichkeit entscheidet ein Mensch, nicht der Rechner.
    const [match] = matchPositions(
      [position({ isin: "US1234567890", wkn: null, ticker: null, name: "Abbott Labs" })],
      [security({ isin: null, wkn: null, ticker: null })],
    );
    expect(match.matchKind).toBe("none");
    expect(match.securityId).toBeNull();
  });

  it("löst eine bestätigte Schreibweise auf", () => {
    const [match] = matchPositions(
      [position({ isin: "US1234567890", wkn: null, ticker: null, name: "Abbott Labs" })],
      [security({ isin: null, wkn: null, ticker: null })],
      [{ aliasNormalized: "abbott labs", securityId: "sec-a" }],
    );
    expect(match.matchKind).toBe("alias");
    expect(match.securityId).toBe("sec-a");
  });

  it("nutzt eine mehrfach vergebene Kennung nicht — mehrdeutig ist nicht zugeordnet", () => {
    const [match] = matchPositions(
      [position({ isin: "US1234567890", ticker: "ABT", wkn: null })],
      [
        security({ id: "sec-a", isin: null, ticker: "ABT", name: "Alpha" }),
        security({ id: "sec-b", isin: null, ticker: "ABT", name: "Beta" }),
      ],
    );
    expect(match.securityId).toBeNull();
  });

  it("bevorzugt bei gleicher Kennung das aktive Unternehmen", () => {
    const [match] = matchPositions(
      [position()],
      [
        security({ id: "sec-alt", archived_at: "2025-01-01T00:00:00Z" }),
        security({ id: "sec-neu" }),
      ],
    );
    expect(match.securityId).toBe("sec-neu");
    expect(match.archived).toBe(false);
  });

  it("meldet ein archiviertes Unternehmen mit Bestand", () => {
    const [match] = matchPositions(
      [position()],
      [security({ archived_at: "2025-01-01T00:00:00Z" })],
    );
    expect(match.securityId).toBe("sec-a");
    expect(match.archived).toBe(true);
  });

  it("kennzeichnet eine unbekannte Zeile als neu", () => {
    const [match] = matchPositions([position()], []);
    expect(match.matchKind).toBe("none");
    expect(match.changes).toEqual([]);
  });
});

describe("fieldChanges", () => {
  it("füllt leere Stammdatenfelder", () => {
    const changes = fieldChanges(security(), position());
    expect(changes).toEqual([
      { field: "ticker", from: null, to: "ABT" },
      { field: "wkn", from: null, to: "850103" },
      { field: "country", from: null, to: "US" },
      { field: "sector", from: null, to: "Health Care" },
      { field: "currency", from: null, to: "USD" },
    ]);
  });

  it("schlägt die Ausschüttungswährung vor, nicht die Depotwährung", () => {
    // `currency` der Zeile ist EUR (Depotwaehrung). In `securities.currency`
    // gehoert die uebliche Ausschuettungswaehrung — hier USD.
    const changes = fieldChanges(security(), position());
    expect(changes.find((change) => change.field === "currency")?.to).toBe("USD");
  });

  it("lässt vorhandene Werte unangetastet, wenn die Quelle schweigt", () => {
    // Was der Nutzer gepflegt hat, ist mehr wert als das Schweigen einer
    // fremden Datei — es wird nie geleert.
    const changes = fieldChanges(
      security({ sector: "Gesundheit", country: "US" }),
      position({ sector: null, country: null }),
    );
    expect(changes.map((change) => change.field)).not.toContain("sector");
    expect(changes.map((change) => change.field)).not.toContain("country");
  });

  it("schlägt nichts vor, wenn alles schon stimmt", () => {
    const existing = security({
      ticker: "ABT",
      wkn: "850103",
      country: "US",
      sector: "Health Care",
      currency: "USD",
    });
    expect(fieldChanges(existing, position())).toEqual([]);
  });

  it("ergänzt eine fehlende ISIN", () => {
    // Sie ist der stärkste Zuordnungsschlüssel für jeden weiteren Import.
    const changes = fieldChanges(security({ isin: null }), position());
    expect(changes).toContainEqual({
      field: "isin",
      from: null,
      to: "US0028241000",
    });
  });

  it("ändert eine vorhandene ISIN niemals", () => {
    // Eine andere ISIN hiesse „das ist ein anderes Wertpapier". Das gehört ins
    // Bearbeitungsformular, wo es einer bewusst tut — nicht in einen
    // Sammelschalter über 54 Positionen.
    const changes = fieldChanges(
      security({ isin: "US1111111111" }),
      position({ isin: "US0028241000" }),
    );
    expect(changes.map((change) => change.field)).not.toContain("isin");
  });

  it("schlägt den Namen niemals zur Änderung vor", () => {
    // Die gewachsene Schreibweise traegt die Namensangleichung des Kalenders.
    const changes = fieldChanges(
      security({ name: "Abbott" }),
      position({ name: "Abbott Laboratories Inc" }),
    );
    expect(changes.map((change) => change.field as string)).not.toContain("name");
  });
});
