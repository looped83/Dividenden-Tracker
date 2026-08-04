import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent } from "@/lib/money";
import {
  historyOf,
  latestAsOf,
  portfolioTotals,
  ratioToPercent,
  snapshotsAt,
  statusOf,
  sumField,
} from "@/features/securities/snapshots";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";

/** Ein Depotstand mit sinnvollen Vorgaben; jeder Test setzt nur, was er prüft. */
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
    gain_absolute: null,
    gain_relative: null,
    allocation: null,
    dividend_yield: null,
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

describe("latestAsOf / snapshotsAt", () => {
  it("findet den jüngsten Stichtag unabhängig von der Reihenfolge", () => {
    const snapshots = [
      snapshot({ as_of: "2026-05-01" }),
      snapshot({ as_of: "2026-08-03" }),
      snapshot({ as_of: "2026-06-15" }),
    ];
    expect(latestAsOf(snapshots)).toBe("2026-08-03");
    expect(snapshotsAt(snapshots, latestAsOf(snapshots))).toHaveLength(1);
  });

  it("liefert ohne Daten keinen Stichtag", () => {
    expect(latestAsOf([])).toBeNull();
    expect(snapshotsAt([], null)).toEqual([]);
  });
});

describe("statusOf", () => {
  it("erkennt eine noch gehaltene Position", () => {
    const snapshots = [
      snapshot({ security_id: "sec-a", as_of: "2026-05-01" }),
      snapshot({ security_id: "sec-a", as_of: "2026-08-03" }),
    ];
    const status = statusOf(snapshots, "sec-a", "2026-08-03");
    expect(status.current).toBe(true);
    expect(status.snapshot?.as_of).toBe("2026-08-03");
  });

  it("erkennt eine verkaufte Position am fehlenden jüngsten Stand", () => {
    // Die Datei ist der vollstaendige Depotstand ihres Tages. Fehlt ein
    // Unternehmen darin, ist die Position verkauft — sonst stuende auf ihrer
    // Seite dauerhaft ein Bestand, den es nicht mehr gibt.
    const snapshots = [
      snapshot({ security_id: "sec-a", as_of: "2026-05-01" }),
      snapshot({ security_id: "sec-b", as_of: "2026-08-03" }),
    ];
    const status = statusOf(snapshots, "sec-a", "2026-08-03");
    expect(status.current).toBe(false);
    expect(status.snapshot?.as_of).toBe("2026-05-01");
  });

  it("liefert nichts für ein Unternehmen ohne jeden Stand", () => {
    expect(statusOf([], "sec-a", null)).toEqual({ snapshot: null, current: false });
  });
});

describe("historyOf", () => {
  it("sortiert die Stände eines Unternehmens aufsteigend", () => {
    const snapshots = [
      snapshot({ security_id: "sec-a", as_of: "2026-08-03" }),
      snapshot({ security_id: "sec-b", as_of: "2026-06-01" }),
      snapshot({ security_id: "sec-a", as_of: "2026-05-01" }),
    ];
    expect(historyOf(snapshots, "sec-a").map((entry) => entry.as_of)).toEqual([
      "2026-05-01",
      "2026-08-03",
    ]);
  });
});

describe("sumField", () => {
  it("zählt Zeilen ohne Wert nicht als Null mit", () => {
    // Die Quelle laesst ein Feld leer, wenn sie nichts zu sagen hat. `counted`
    // macht die Luecke sichtbar, statt sie stillschweigend als 0 zu verrechnen.
    const sum = sumField(
      [
        snapshot({ annual_dividend_total: "60.00" }),
        snapshot({ annual_dividend_total: null }),
        snapshot({ annual_dividend_total: "40.00" }),
      ],
      (entry) => entry.annual_dividend_total,
    );
    expect(sum.kind).toBe("amount");
    if (sum.kind !== "amount") return;
    // Wie in tests/unit/lib/money: das Leerzeichen vor dem Euro ist geschuetzt.
    expect(formatMoney(sum.value)).toMatch(/^100,00\s€$/);
    expect(sum.counted).toBe(2);
  });

  it("addiert verschiedene Währungen nicht", () => {
    // Das waere eine Umrechnung zu einem erfundenen Kurs.
    const sum = sumField(
      [snapshot({ currency: "EUR" }), snapshot({ currency: "USD" })],
      (entry) => entry.market_value,
    );
    expect(sum.kind).toBe("mixedCurrency");
  });

  it("meldet einen leeren Bestand als leer, nicht als 0 €", () => {
    expect(sumField([], (entry) => entry.market_value).kind).toBe("empty");
  });
});

describe("portfolioTotals", () => {
  const snapshots = [
    // Ein älterer Stand, der nicht mitzählen darf.
    snapshot({ security_id: "sec-a", as_of: "2026-05-01", market_value: "999999.00" }),
    snapshot({
      security_id: "sec-a",
      as_of: "2026-08-03",
      market_value: "8000.00",
      buyin_total: "6000.00",
      annual_dividend_total: "300.00",
    }),
    snapshot({
      security_id: "sec-b",
      as_of: "2026-08-03",
      market_value: "2000.00",
      buyin_total: "2000.00",
      annual_dividend_total: "100.00",
    }),
  ];

  it("rechnet nur mit dem jüngsten Stichtag", () => {
    const totals = portfolioTotals(snapshots);
    expect(totals.asOf).toBe("2026-08-03");
    expect(totals.positions).toBe(2);
    expect(totals.marketValue.kind).toBe("amount");
    if (totals.marketValue.kind !== "amount") return;
    expect(formatMoney(totals.marketValue.value)).toMatch(/^10\.000,00\s€$/);
  });

  it("bildet die Rendite als Summe durch Summe, nicht als Mittelwert", () => {
    // 400 / 10.000 = 4,00 %. Der Mittelwert der Einzelrenditen (3,75 % und
    // 5,00 %) waere 4,375 % — eine Zahl, die zu keinem Depot gehoert, weil sie
    // eine kleine Position genauso gewichtet wie eine grosse.
    const totals = portfolioTotals(snapshots);
    expect(totals.yieldPercent && formatPercent(totals.yieldPercent, 2)).toBe("4,00 %");
    // Auf den Einstand: 400 / 8.000 = 5,00 %.
    expect(
      totals.yieldOnBuyinPercent && formatPercent(totals.yieldOnBuyinPercent, 2),
    ).toBe("5,00 %");
  });

  it("liefert für einen leeren Bestand keine Rendite statt einer 0", () => {
    const totals = portfolioTotals([]);
    expect(totals.asOf).toBeNull();
    expect(totals.positions).toBe(0);
    expect(totals.yieldPercent).toBeNull();
  });

  it("erfindet keine Rendite, wenn der Depotwert 0 ist", () => {
    const totals = portfolioTotals([
      snapshot({ market_value: "0.00", annual_dividend_total: "10.00" }),
    ]);
    expect(totals.yieldPercent).toBeNull();
  });
});

describe("ratioToPercent", () => {
  it("rechnet den Bruchteil der Quelle in Prozentpunkte um", () => {
    const percent = ratioToPercent("0.029164");
    expect(percent && formatPercent(percent, 2)).toBe("2,92 %");
  });

  it("lässt eine fehlende Angabe fehlend", () => {
    expect(ratioToPercent(null)).toBeNull();
  });
});
