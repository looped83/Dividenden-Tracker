import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import { derivePaymentInsights } from "@/features/payments/paymentInsights";

function payment(id: string, payDate: string, net: string): AnalyticsPayment {
  return {
    id,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "s1",
    depotId: "d1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T12:00:00Z`,
  };
}

/** Monatliche Dividenden von 11/2024 bis 10/2026, je 1 € mehr. */
const monthly = Array.from({ length: 24 }, (_, index) => {
  const month = ((10 + index) % 12) + 1;
  const year = 2024 + Math.floor((10 + index) / 12);
  return payment(
    `p${String(index)}`,
    `${String(year)}-${String(month).padStart(2, "0")}-15`,
    `${String(50 + index)}.00`,
  );
});

describe("derivePaymentInsights", () => {
  it("vergleicht mit vorheriger Dividende, Vorjahr und Ø der letzten zwölf Monate", () => {
    const result = derivePaymentInsights("p23", monthly, [], 2026);

    expect(result?.previous?.id).toBe("p22");
    expect(result?.previous?.difference.toStringValue()).toBe("1.00");
    expect(result?.yearAgo?.previousAmount.toStringValue()).toBe("61.00");
    // Ø von p11 (61) bis p22 (72) = 66,50 €
    expect(result?.trailingAverage?.reference.toStringValue()).toBe("66.50");
    expect(result?.trailingAverage?.count).toBe(12);
    expect(result?.rank).toBe(1);
    expect(result?.ordinal).toBe(24);
  });

  it("summiert Jahr und Gesamt und nennt die erste Dividende", () => {
    const result = derivePaymentInsights("p23", monthly, [], 2026);

    // 2026: p14 (64) bis p23 (73)
    expect(result?.year).toMatchObject({ year: 2026, count: 10 });
    expect(result?.year.net.toStringValue()).toBe("685.00");
    expect(result?.total.toStringValue()).toBe("1476.00");
    expect(result?.firstDate).toBe("2024-11-15");
    // Kumuliert ab der ersten Dividende: p0..p11 vor dem Fenster (50..61 = 666 €)
    expect(result?.history[0]?.total.toStringValue()).toBe("728.00");
    expect(result?.history.at(-1)?.total.toStringValue()).toBe("1476.00");
  });

  it("füllt den Verlauf einer frühen Dividende mit späteren auf", () => {
    const early = derivePaymentInsights("p2", monthly, [], 2026);
    expect(early?.history.map((entry) => entry.payments[0]?.id)).toEqual(
      monthly.slice(0, 12).map((entry) => entry.id),
    );

    const latest = derivePaymentInsights("p23", monthly, [], 2026);
    expect(latest?.history.at(-1)?.payments[0]?.id).toBe("p23");
    expect(latest?.history).toHaveLength(12);
  });

  it("fasst mehrere Dividenden eines Monats zu einem Balken zusammen", () => {
    const own = [
      ...monthly,
      payment("extra", "2026-10-02", "30.00"),
      payment("nov", "2026-11-15", "20.00"),
    ];
    const result = derivePaymentInsights("p23", own, [], 2026);
    const october = result?.history.find((entry) => entry.month === "2026-10-01");

    expect(october?.payments.map((entry) => entry.id)).toEqual(["extra", "p23"]);
    expect(october?.net.toStringValue()).toBe("103.00");
    // Zwoelf Monate, nicht zwoelf Zahlungen; das Fenster endet im Oktober.
    expect(result?.history).toHaveLength(12);
    expect(result?.history.at(-1)?.month).toBe("2026-10-01");
    expect(result?.history.at(-1)?.total.toStringValue()).toBe("1506.00");
    // Kopf bleibt je Zahlung: vorherige ist die Zahlung am 2. Oktober.
    expect(result?.previous?.id).toBe("extra");
    expect(result?.count).toBe(26);
  });

  it("listet fünf Dividenden um diese herum, jüngste zuerst", () => {
    const ids = (id: string) =>
      derivePaymentInsights(id, monthly, [], 2026)?.nearby.map((entry) => entry.id);
    expect(ids("p10")).toEqual(["p12", "p11", "p10", "p9", "p8"]);
    expect(ids("p23")).toEqual(["p23", "p22", "p21", "p20", "p19"]);
    expect(ids("p0")).toEqual(["p4", "p3", "p2", "p1", "p0"]);
  });

  it("erwartet die nächste Dividende nur nach der jüngsten und nach Plan", () => {
    const quarterly = [3, 6, 9, 12];
    expect(derivePaymentInsights("p23", monthly, quarterly, 2026)?.nextExpected).toBe(
      "2026-12-01",
    );
    expect(
      derivePaymentInsights("p22", monthly, quarterly, 2026)?.nextExpected,
    ).toBeNull();
    expect(derivePaymentInsights("p23", monthly, [], 2026)?.nextExpected).toBeNull();
  });

  it("ordnet die erste Dividende ohne Vergleich ein", () => {
    const result = derivePaymentInsights("p0", monthly.slice(0, 1), [], 2026);
    expect(result?.previous).toBeNull();
    expect(result?.trailingAverage).toBeNull();
    expect(result?.yearAgo).toBeNull();
    expect(result?.count).toBe(1);
  });

  it("liefert nichts für eine stornierte (nicht aktive) Dividende", () => {
    expect(derivePaymentInsights("storniert", monthly, [], 2026)).toBeNull();
  });
});

describe("derivePaymentInsights · Rhythmus", () => {
  const quarterly = [
    "2025-03-15",
    "2025-06-15",
    "2025-09-15",
    "2025-12-15",
    "2026-03-15",
  ].map((date, index) => payment(`q${String(index)}`, date, `${String(40 + index)}.00`));

  it("erkennt monatliche Zahler am Ausschüttungsplan", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(derivePaymentInsights("p23", monthly, all, 2026)?.monthly).toBe(true);
    expect(derivePaymentInsights("q4", quarterly, [3, 6, 9, 12], 2026)?.monthly).toBe(
      false,
    );
  });

  it("schließt ohne Plan aus der Historie der letzten zwölf Monate", () => {
    expect(derivePaymentInsights("p23", monthly, [], 2026)?.monthly).toBe(true);
    expect(derivePaymentInsights("q4", quarterly, [], 2026)?.monthly).toBe(false);
  });

  it("liefert für Quartalszahler den Vergleich mit dem Vorjahr", () => {
    const result = derivePaymentInsights("q4", quarterly, [3, 6, 9, 12], 2026);
    expect(result?.yearAgo?.previousDate).toBe("2025-03-15");
    expect(result?.yearAgo?.difference.toStringValue()).toBe("4.00");
  });
});

describe("derivePaymentInsights · Je Jahr", () => {
  // Erstes Jahr angebrochen, 2023 ohne Dividende, 2026 laufend.
  const yearly = [
    payment("a", "2020-11-15", "10.00"),
    payment("b", "2021-06-15", "100.00"),
    payment("c", "2022-06-15", "110.00"),
    payment("d", "2024-06-15", "121.00"),
    payment("e", "2025-06-15", "133.10"),
    payment("f", "2026-03-15", "50.00"),
  ];

  it("summiert je Kalenderjahr, Lücken mit 0", () => {
    const years = derivePaymentInsights("c", yearly, [], 2026)?.years;
    expect(years?.map((entry) => entry.year)).toEqual([
      2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ]);
    expect(years?.[3]).toMatchObject({ year: 2023, count: 0 });
    expect(years?.[3]?.net.toStringValue()).toBe("0.00");
  });

  it("rechnet das Ø-Wachstum über die letzten drei vollen Jahre", () => {
    const growth = derivePaymentInsights("f", yearly, [], 2026)?.growth;
    expect(growth).toMatchObject({ from: 2022, to: 2025 });
    // 110 → 133,10 in drei Jahren (2023 leer zählt nicht als Bezug) ≈ 6,56 % je Jahr
    expect(growth?.percent.toDecimalPlaces(4).toString()).toBe("6.5602");
  });

  it("zählt das erste und das laufende Jahr nicht mit", () => {
    const short = yearly.slice(0, 3);
    // 2021 → 2022, das angebrochene 2020 bleibt draußen
    expect(derivePaymentInsights("c", short, [], 2026)?.growth).toMatchObject({
      from: 2021,
      to: 2022,
    });
    // Nur erstes und laufendes Jahr: kein Wachstum
    expect(derivePaymentInsights("b", yearly.slice(0, 2), [], 2021)?.growth).toBeNull();
  });

  it("begrenzt die Jahre auf zwölf um das Jahr der Dividende", () => {
    const long = Array.from({ length: 15 }, (_, index) =>
      payment(`y${String(index)}`, `${String(2010 + index)}-05-15`, "10.00"),
    );
    const early = derivePaymentInsights("y0", long, [], 2026)?.years;
    expect(early?.[0]?.year).toBe(2010);
    expect(early).toHaveLength(12);
    const latest = derivePaymentInsights("y14", long, [], 2026)?.years;
    expect(latest?.at(-1)?.year).toBe(2024);
    expect(latest?.[0]?.year).toBe(2013);
  });
});
