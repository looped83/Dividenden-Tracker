import { describe, expect, it } from "vitest";
import {
  anomalyKey,
  detectAnomalies,
  findDuplicatePairs,
  pairKey,
  type PaymentLike,
} from "@/lib/payments/dataQuality";

function payment(partial: Partial<PaymentLike> & { id: string }): PaymentLike {
  return {
    security_id: "sec-1",
    depot_id: "dep-1",
    pay_date: "2026-03-15",
    net_amount: "10.00",
    original_currency: "EUR",
    source: "manual",
    import_id: null,
    payment_type: "regular",
    archived_at: null,
    created_at: "2026-03-15T10:00:00Z",
    ...partial,
  };
}

describe("findDuplicatePairs (§15)", () => {
  it("erkennt hohe Wahrscheinlichkeit bei identischem Datum, Unternehmen, Depot und Betrag", () => {
    const pairs = findDuplicatePairs([payment({ id: "a" }), payment({ id: "b" })]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].category).toBe("high");
    expect(pairs[0].key).toBe(pairKey("a", "b"));
  });

  it("markiert abweichenden Betrag nur als mögliche Dublette, nicht als sicher (legitime Tranche)", () => {
    const pairs = findDuplicatePairs([
      payment({ id: "a", net_amount: "10.00" }),
      payment({ id: "b", net_amount: "25.00" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].category).toBe("possible");
  });

  it("löst niemals automatisch eine Löschung aus – liefert nur Kandidaten (reine Funktion)", () => {
    const input = [payment({ id: "a" }), payment({ id: "b" })];
    const before = input.length;
    findDuplicatePairs(input);
    expect(input).toHaveLength(before);
  });

  it("ignoriert stornierte Zahlungen (Storno löst die Warnung auf, Szenario 9)", () => {
    const pairs = findDuplicatePairs([
      payment({ id: "a" }),
      payment({ id: "b", archived_at: "2026-04-01T00:00:00Z" }),
    ]);
    expect(pairs).toHaveLength(0);
  });

  it("blendet bewusst verworfene Paare aus (Dismissals, §16)", () => {
    const dismissed = new Set([pairKey("a", "b")]);
    const pairs = findDuplicatePairs(
      [payment({ id: "a" }), payment({ id: "b" })],
      dismissed,
    );
    expect(pairs).toHaveLength(0);
  });

  it("erkennt keine Dublette bei unterschiedlichem Depot", () => {
    const pairs = findDuplicatePairs([
      payment({ id: "a", depot_id: "dep-1" }),
      payment({ id: "b", depot_id: "dep-2" }),
    ]);
    expect(pairs).toHaveLength(0);
  });
});

describe("detectAnomalies (§18)", () => {
  const today = "2026-07-20";

  it("meldet einen Nullbetrag", () => {
    const anomalies = detectAnomalies([payment({ id: "a", net_amount: "0.00" })], today);
    expect(anomalies.some((x) => x.code === "zero_amount")).toBe(true);
  });

  it("meldet ein zukünftiges Zahlungsdatum", () => {
    const anomalies = detectAnomalies(
      [payment({ id: "a", pay_date: "2027-01-01" })],
      today,
    );
    expect(anomalies.some((x) => x.code === "future_date")).toBe(true);
  });

  it("meldet importierte Zahlungen ohne Importreferenz", () => {
    const anomalies = detectAnomalies(
      [payment({ id: "a", source: "csv_import", import_id: null })],
      today,
    );
    expect(anomalies.some((x) => x.code === "import_without_reference")).toBe(true);
  });

  it("meldet einen ungewöhnlich hohen Betrag relativ zum Asset", () => {
    const rows = [
      payment({ id: "a", net_amount: "10.00" }),
      payment({ id: "b", net_amount: "11.00" }),
      payment({ id: "c", net_amount: "9.00" }),
      payment({ id: "d", net_amount: "500.00" }),
    ];
    const anomalies = detectAnomalies(rows, today);
    expect(
      anomalies.some((x) => x.code === "unusually_high" && x.payment.id === "d"),
    ).toBe(true);
    expect(
      anomalies.some((x) => x.code === "unusually_high" && x.payment.id === "a"),
    ).toBe(false);
  });

  /** Monatliche Zahlungen eines Assets in zeitlicher Folge. */
  function reihe(betraege: string[]): PaymentLike[] {
    return betraege.map((net_amount, index) =>
      payment({
        id: `m${String(index).padStart(2, "0")}`,
        pay_date: `2025-${String(index + 1).padStart(2, "0")}-15`,
        net_amount,
      }),
    );
  }

  it("meldet eine aufgestockte Position nicht als ungewöhnlich hoch", () => {
    // Sparplan: aus 5 € werden 35 € und dann 80 € — gemessen am Median der
    // ganzen Historie war jede neue Zahlung „auffällig".
    const anomalies = detectAnomalies(
      reihe([
        "5.10",
        "5.30",
        "5.20",
        "5.40",
        "5.00",
        "5.20",
        "35.00",
        "42.00",
        "38.00",
        "80.00",
      ]),
      today,
    );
    expect(anomalies.filter((x) => x.code === "unusually_high")).toEqual([]);
  });

  it("meldet einen Ausreißer gegenüber den Zahlungen davor und danach", () => {
    // Ein Tippfehler: 742,00 statt 74,20.
    const anomalies = detectAnomalies(
      reihe(["70.10", "72.30", "73.00", "742.00", "74.80", "75.10", "76.00"]),
      today,
    );
    expect(
      anomalies.filter((x) => x.code === "unusually_high").map((x) => x.payment.id),
    ).toEqual(["m03"]);
  });

  it("nimmt eine als Sonderdividende erfasste Zahlung aus", () => {
    const rows = reihe(["10.00", "11.00", "9.00", "500.00"]);
    rows[3] = { ...rows[3], payment_type: "special" };
    const anomalies = detectAnomalies(rows, today);
    expect(anomalies.some((x) => x.code === "unusually_high")).toBe(false);
  });

  it("liefert je Befund einen stabilen Schlüssel aus Eingang und Art", () => {
    const [befund] = detectAnomalies([payment({ id: "a", net_amount: "0.00" })], today);
    expect(befund.key).toBe(anomalyKey("a", "zero_amount"));
  });

  it("meldet keinen ungewöhnlich hohen Betrag ohne genügend Vergleichsdaten", () => {
    const anomalies = detectAnomalies(
      [
        payment({ id: "a", net_amount: "10.00" }),
        payment({ id: "b", net_amount: "500.00" }),
      ],
      today,
    );
    expect(anomalies.some((x) => x.code === "unusually_high")).toBe(false);
  });
});
