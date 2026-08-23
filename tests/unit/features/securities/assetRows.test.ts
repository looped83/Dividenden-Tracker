import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent } from "@/lib/money";
import { buildAssetRows, hasPositions } from "@/features/securities/assetRows";
import type { Security } from "@/lib/supabase/repositories/securities";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

/**
 * Die Zeilen der Assetliste. Geprüft wird vor allem, **welcher** Stand eine
 * Position trägt: Eine im jüngsten Export fehlende Position ist verkauft — ein
 * älterer Bestand in einer Übersicht wäre still falsch.
 */
function security(partial: Partial<Security> & { id: string; name: string }): Security {
  return {
    ticker: null,
    isin: null,
    sector: null,
    country: null,
    currency: null,
    default_depot_id: null,
    archived_at: null,
    ...partial,
  } as Security;
}

function snapshot(partial: Partial<SecuritySnapshot> = {}): SecuritySnapshot {
  return {
    id: `snap-${Math.random().toString(36).slice(2)}`,
    user_id: "user-1",
    security_id: "sec-a",
    run_id: "run-1",
    as_of: "2026-08-03",
    quantity: "10.000000",
    buyin_per_share: null,
    buyin_total: "1000.00",
    price: null,
    market_value: "1200.00",
    gain_absolute: "200.00",
    gain_relative: "0.2",
    allocation: "0.045",
    dividend_yield: "0.029164",
    dividend_yield_on_buyin: null,
    annual_dividend_total: "60.00",
    dividend_per_share: null,
    dividend_frequency: "quarterly",
    dividend_cagr: null,
    dividend_cagr_period: null,
    next_ex_date: null,
    next_pay_date: null,
    asset_type: "equity",
    currency: "EUR",
    created_at: "2026-08-04T10:00:00Z",
    ...partial,
  };
}

const APPLE = security({ id: "sec-a", name: "Apple" });
const BASF = security({ id: "sec-b", name: "BASF", default_depot_id: "dep-1" });

const rowsOf = (
  securities: readonly Security[],
  snapshots: readonly SecuritySnapshot[],
) =>
  buildAssetRows(securities, snapshots, (depotId) =>
    depotId === "dep-1" ? "Erstdepot" : null,
  );

describe("buildAssetRows", () => {
  it("rechnet Beträge und Anteile der Quelle in Anzeigewerte um", () => {
    const [row] = rowsOf([APPLE], [snapshot()]);

    expect(row.position).not.toBeNull();
    expect(formatMoney(row.position?.marketValue ?? never())).toMatch(/^1\.200,00\s€$/);
    expect(formatMoney(row.position?.annualDividend ?? never())).toMatch(/^60,00\s€$/);
    expect(formatMoney(row.position?.gain ?? never())).toMatch(/^200,00\s€$/);
    // Die Quelle liefert Anteile als Bruchteil, angezeigt wird in Prozentpunkten.
    expect(formatPercent(row.position?.allocationPercent ?? never(), 1)).toMatch(
      /^4,5\s%$/,
    );
    expect(formatPercent(row.position?.dividendYield ?? never(), 2)).toMatch(/^2,92\s%$/);
    expect(formatPercent(row.position?.gainPercent ?? never(), 1)).toMatch(/^20,0\s%$/);
  });

  it("trägt nur den jüngsten Stand — eine verkaufte Position hat keinen", () => {
    const rows = rowsOf(
      [APPLE, BASF],
      [
        snapshot({ security_id: "sec-a", as_of: "2026-07-01" }),
        snapshot({ security_id: "sec-b", as_of: "2026-07-01" }),
        // Im August ist Apple nicht mehr im Depot.
        snapshot({ security_id: "sec-b", as_of: "2026-08-03" }),
      ],
    );

    expect(rows.find((row) => row.security.id === "sec-a")?.position).toBeNull();
    expect(rows.find((row) => row.security.id === "sec-b")?.position?.asOf).toBe(
      "2026-08-03",
    );
  });

  it("löst das Standard-Depotkonto zum Namen auf", () => {
    const rows = rowsOf([APPLE, BASF], []);

    expect(rows.map((row) => row.depotName)).toEqual([null, "Erstdepot"]);
  });

  it("lässt fehlende Beträge fehlen, statt sie als 0 zu behaupten", () => {
    const [row] = rowsOf(
      [APPLE],
      [snapshot({ market_value: null, annual_dividend_total: null, allocation: null })],
    );

    expect(row.position?.marketValue).toBeNull();
    expect(row.position?.annualDividend).toBeNull();
    expect(row.position?.allocationPercent).toBeNull();
  });

  it("meldet, ob überhaupt eine Position vorliegt", () => {
    expect(hasPositions(rowsOf([APPLE], []))).toBe(false);
    expect(hasPositions(rowsOf([APPLE], [snapshot()]))).toBe(true);
  });
});

/** Macht einen fehlenden Testwert zum Fehler statt zu einem stillen `null`. */
function never(): never {
  throw new Error("Erwarteter Wert fehlt.");
}
