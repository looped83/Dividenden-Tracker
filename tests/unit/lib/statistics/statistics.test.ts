import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment, PaymentSource, PaymentType } from "@/lib/statistics";
import {
  activeMonthCount,
  averagePayment,
  averagePerActiveMonth,
  bestYear,
  calendarMonthBuckets,
  depotStatistics,
  filterPayments,
  heatmapByYearMonth,
  isEmptyFilter,
  largestPayment,
  monthAcrossYearsStatistics,
  overviewStatistics,
  securityStatistics,
  sortSecurityStatistics,
  worstMonthInYear,
  yearStatistics,
} from "@/lib/statistics";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";

let seq = 0;
function p(
  payDate: string,
  net: string,
  options: {
    security?: string;
    depot?: string;
    source?: PaymentSource;
    type?: PaymentType;
    id?: string;
  } = {},
): AnalyticsPayment {
  seq += 1;
  return {
    id: options.id ?? `id-${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: options.security ?? "sec-a",
    depotId: options.depot ?? "dep-1",
    paymentType: options.type ?? "regular",
    source: options.source ?? "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

describe("filterPayments (§11)", () => {
  const payments = [
    p("2024-03-10", "100", {
      security: "a",
      depot: "d1",
      source: "manual",
      type: "regular",
    }),
    p("2025-06-10", "200", {
      security: "b",
      depot: "d2",
      source: "csv_import",
      type: "special",
    }),
    p("2025-09-10", "50", {
      security: "a",
      depot: "d1",
      source: "manual",
      type: "regular",
    }),
  ];

  it("leerer Filter lässt alle Zahlungen durch", () => {
    expect(isEmptyFilter(EMPTY_STATISTICS_FILTER)).toBe(true);
    expect(filterPayments(payments, EMPTY_STATISTICS_FILTER)).toHaveLength(3);
  });

  it("filtert nach Jahr (effektives Datum)", () => {
    const result = filterPayments(payments, { ...EMPTY_STATISTICS_FILTER, year: 2025 });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.payDate.startsWith("2025"))).toBe(true);
  });

  it("kombiniert Jahr, Unternehmen und Quelle (UND-Verknüpfung)", () => {
    const result = filterPayments(payments, {
      year: 2025,
      securityId: "a",
      depotId: null,
      source: "manual",
      paymentType: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.netAmount.toStringValue()).toBe("50.00");
  });

  it("filtert nach Depot und Zahlungsart", () => {
    expect(
      filterPayments(payments, { ...EMPTY_STATISTICS_FILTER, depotId: "d2" }),
    ).toHaveLength(1);
    expect(
      filterPayments(payments, { ...EMPTY_STATISTICS_FILTER, paymentType: "special" }),
    ).toHaveLength(1);
  });
});

describe("Durchschnitte und Extremwerte", () => {
  it("averagePayment = Nettosumme ÷ Anzahl", () => {
    const payments = [p("2025-01-10", "100"), p("2025-02-10", "50")];
    expect(averagePayment(payments).toStringValue()).toBe("75.00");
    expect(averagePayment([]).toStringValue()).toBe("0.00");
  });

  it("largestPayment liefert die größte Einzelzahlung", () => {
    const payments = [
      p("2025-01-10", "100"),
      p("2025-02-10", "250"),
      p("2025-03-10", "40"),
    ];
    expect(largestPayment(payments)?.toStringValue()).toBe("250.00");
    expect(largestPayment([])).toBeNull();
  });

  it("activeMonthCount zählt Kalendermonate mit Zahlungen", () => {
    const payments = [
      p("2025-01-10", "1"),
      p("2025-01-20", "1"), // gleicher Monat
      p("2025-03-10", "1"),
      p("2024-03-10", "1"), // anderer Jahrgang, gleicher Monat
    ];
    expect(activeMonthCount(payments)).toBe(3);
  });

  it("averagePerActiveMonth teilt durch aktive Monate", () => {
    const payments = [p("2025-01-10", "100"), p("2025-03-10", "200")];
    // 300 / 2 aktive Monate = 150
    expect(averagePerActiveMonth(payments).toStringValue()).toBe("150.00");
  });

  it("worstMonthInYear findet den schwächsten Monat mit Zahlungen", () => {
    const payments = [
      p("2025-03-10", "300"),
      p("2025-07-10", "50"),
      p("2025-11-10", "120"),
    ];
    const worst = worstMonthInYear(payments, 2025);
    expect(worst?.month).toBe(7);
    expect(worst?.net.toStringValue()).toBe("50.00");
  });

  it("bestYear wählt das umsatzstärkste Jahr, bei Gleichstand das aktuellere", () => {
    const payments = [
      p("2024-01-10", "100"),
      p("2025-01-10", "100"),
      p("2023-01-10", "50"),
    ];
    const best = bestYear(payments);
    expect(best?.year).toBe(2025);
    expect(best?.net.toStringValue()).toBe("100.00");
    expect(bestYear([])).toBeNull();
  });
});

describe("calendarMonthBuckets", () => {
  it("summiert Kalendermonate über alle Jahre", () => {
    const payments = [
      p("2024-03-10", "100"),
      p("2025-03-10", "50"),
      p("2025-07-10", "30"),
    ];
    const buckets = calendarMonthBuckets(payments);
    expect(buckets).toHaveLength(12);
    expect(buckets[2]?.net.toStringValue()).toBe("150.00"); // März über beide Jahre
    expect(buckets[2]?.count).toBe(2);
    expect(buckets[6]?.net.toStringValue()).toBe("30.00"); // Juli
    expect(buckets[0]?.net.toStringValue()).toBe("0.00"); // Januar leer
  });
});

describe("overviewStatistics (§11.1)", () => {
  it("liefert Summe, Zähler, Durchschnitte und Extremwerte", () => {
    const payments = [
      p("2024-05-10", "100", { security: "a", depot: "d1" }),
      p("2025-05-10", "300", { security: "b", depot: "d2" }),
      p("2025-08-10", "50", { security: "a", depot: "d1" }),
    ];
    const stats = overviewStatistics(payments);
    expect(stats.net.toStringValue()).toBe("450.00");
    expect(stats.count).toBe(3);
    expect(stats.distinctSecurities).toBe(2);
    expect(stats.distinctDepots).toBe(2);
    expect(stats.averagePayment.toStringValue()).toBe("150.00"); // 450/3
    expect(stats.activeMonths).toBe(3);
    expect(stats.averageMonth.toStringValue()).toBe("150.00"); // 450/3 aktive Monate
    expect(stats.bestMonth?.net.toStringValue()).toBe("300.00");
    expect(stats.bestYear?.year).toBe(2025);
    expect(stats.firstPayDate).toBe("2024-05-10");
    expect(stats.lastPayDate).toBe("2025-08-10");
  });

  it("bleibt ohne Zahlungen stabil (0 €, null-Daten)", () => {
    const stats = overviewStatistics([]);
    expect(stats.net.toStringValue()).toBe("0.00");
    expect(stats.bestMonth).toBeNull();
    expect(stats.bestYear).toBeNull();
    expect(stats.firstPayDate).toBeNull();
  });
});

describe("yearStatistics (§11.3)", () => {
  const payments = [
    p("2024-03-10", "100", { security: "a", depot: "d1" }),
    p("2024-07-10", "300", { security: "b", depot: "d1" }),
    p("2025-03-10", "200", { security: "a", depot: "d2" }),
    p("2025-11-10", "50", { security: "b", depot: "d2" }),
  ];

  it("sortiert neueste Jahre zuerst", () => {
    const stats = yearStatistics(payments);
    expect(stats.map((s) => s.year)).toEqual([2025, 2024]);
  });

  it("berechnet je Jahr Summe, Anzahl, Distinct, Durchschnitt, beste/schwächste Monate", () => {
    const stats = yearStatistics(payments);
    const y2024 = stats.find((s) => s.year === 2024);
    expect(y2024?.net.toStringValue()).toBe("400.00");
    expect(y2024?.count).toBe(2);
    expect(y2024?.distinctSecurities).toBe(2);
    expect(y2024?.distinctDepots).toBe(1);
    expect(y2024?.averagePayment.toStringValue()).toBe("200.00");
    expect(y2024?.bestMonth?.month).toBe(7);
    expect(y2024?.worstMonth?.month).toBe(3);
  });

  it("liefert Vorjahresvergleich; ohne Vorjahr 'no-comparison'", () => {
    const stats = yearStatistics(payments);
    const y2025 = stats.find((s) => s.year === 2025);
    // 2025 (250) vs 2024 (400) → -150 → percent
    expect(y2025?.change.kind).toBe("percent");
    expect(y2025?.priorYearNet?.toStringValue()).toBe("400.00");

    const y2024 = stats.find((s) => s.year === 2024);
    // Kein 2023 in der Datenbasis → kein Vergleich
    expect(y2024?.change.kind).toBe("no-comparison");
    expect(y2024?.priorYearNet).toBeNull();
  });
});

describe("monthAcrossYearsStatistics (§11.4)", () => {
  it("liefert genau zwölf Monate mit Entwicklung über die Jahre", () => {
    const payments = [
      p("2023-01-10", "100"),
      p("2024-01-10", "150"),
      p("2025-01-10", "200"),
      p("2025-06-10", "60"),
    ];
    const stats = monthAcrossYearsStatistics(payments);
    expect(stats).toHaveLength(12);
    const january = stats.find((s) => s.month === 1);
    expect(january?.month).toBe(1);
    expect(january?.net.toStringValue()).toBe("450.00");
    expect(january?.count).toBe(3);
    expect(january?.averagePayment.toStringValue()).toBe("150.00");
    expect(january?.perYear.map((b) => b.year)).toEqual([2023, 2024, 2025]);

    const june = stats.find((s) => s.month === 6);
    expect(june?.net.toStringValue()).toBe("60.00");
    const february = stats.find((s) => s.month === 2);
    expect(february?.net.toStringValue()).toBe("0.00");
    expect(february?.perYear).toEqual([]);
  });
});

describe("securityStatistics + sortSecurityStatistics (§11.5)", () => {
  const payments = [
    p("2023-03-10", "100", { security: "a", id: "1" }),
    p("2024-03-10", "400", { security: "a", id: "2" }),
    p("2025-03-10", "50", { security: "b", id: "3" }),
    p("2025-06-10", "50", { security: "b", id: "4" }),
    p("2025-09-10", "50", { security: "b", id: "5" }),
  ];
  const names: Record<string, string> = { a: "Alpha AG", b: "Beta SE" };
  const labelOf = (id: string) => names[id] ?? id;

  it("aggregiert je Unternehmen inkl. erster/letzter Zahlung und größter Einzelzahlung", () => {
    const stats = securityStatistics(payments);
    const a = stats.find((s) => s.securityId === "a");
    expect(a?.net.toStringValue()).toBe("500.00");
    expect(a?.count).toBe(2);
    expect(a?.firstPayDate).toBe("2023-03-10");
    expect(a?.lastPayDate).toBe("2024-03-10");
    expect(a?.averagePayment.toStringValue()).toBe("250.00");
    expect(a?.largestPayment?.toStringValue()).toBe("400.00");
    expect(a?.perYear.map((y) => y.year)).toEqual([2023, 2024]);
  });

  it("sortiert nach Summe (absteigend)", () => {
    const sorted = sortSecurityStatistics(securityStatistics(payments), "net", labelOf);
    expect(sorted.map((s) => s.securityId)).toEqual(["a", "b"]);
  });

  it("sortiert nach Anzahl Zahlungen (absteigend)", () => {
    const sorted = sortSecurityStatistics(securityStatistics(payments), "count", labelOf);
    expect(sorted.map((s) => s.securityId)).toEqual(["b", "a"]); // b: 3, a: 2
  });

  it("sortiert alphabetisch nach Name", () => {
    const sorted = sortSecurityStatistics(securityStatistics(payments), "name", labelOf);
    expect(sorted.map((s) => s.securityId)).toEqual(["a", "b"]); // Alpha vor Beta
  });

  it("sortiert nach letzter Zahlung (neueste zuerst)", () => {
    const sorted = sortSecurityStatistics(
      securityStatistics(payments),
      "lastPayment",
      labelOf,
    );
    expect(sorted.map((s) => s.securityId)).toEqual(["b", "a"]); // b zuletzt 2025-09
  });
});

describe("depotStatistics (§11.6)", () => {
  it("aggregiert je Depot inkl. Unternehmenszahl, Jahres- und Monatsentwicklung", () => {
    const payments = [
      p("2024-03-10", "100", { depot: "d1", security: "a" }),
      p("2025-03-10", "200", { depot: "d1", security: "b" }),
      p("2025-03-20", "40", { depot: "d2", security: "a" }),
    ];
    const stats = depotStatistics(payments);
    // Nach Summe absteigend: d1 (300) vor d2 (40)
    expect(stats.map((s) => s.depotId)).toEqual(["d1", "d2"]);
    const d1 = stats.find((s) => s.depotId === "d1");
    expect(d1?.net.toStringValue()).toBe("300.00");
    expect(d1?.distinctSecurities).toBe(2);
    expect(d1?.perYear.map((y) => y.year)).toEqual([2024, 2025]);
    expect(d1?.perMonth).toHaveLength(12);
    expect(d1?.perMonth.find((m) => m.month === 3)?.net.toStringValue()).toBe("300.00"); // März gesamt d1
  });
});

describe("Skalierung (≥ 10.000 Eingänge, ≥ 500 Unternehmen)", () => {
  it("aggregiert eine große Historie korrekt und in linearer Zeit", () => {
    const COUNT = 12_000;
    const SECURITIES = 500;
    const DEPOTS = 5;
    const payments: AnalyticsPayment[] = [];
    for (let i = 0; i < COUNT; i += 1) {
      const year = 2015 + (i % 11);
      const month = (i % 12) + 1;
      const day = (i % 28) + 1;
      const date = `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      payments.push(
        p(date, "1.00", {
          security: `sec-${String(i % SECURITIES)}`,
          depot: `dep-${String(i % DEPOTS)}`,
          id: `id-${String(i)}`,
        }),
      );
    }

    const overview = overviewStatistics(payments);
    expect(overview.count).toBe(COUNT);
    // Jede Zahlung 1,00 € → Gesamtsumme exakt COUNT (decimal-genau).
    expect(overview.net.toStringValue()).toBe(`${String(COUNT)}.00`);
    expect(overview.distinctSecurities).toBe(SECURITIES);
    expect(overview.distinctDepots).toBe(DEPOTS);

    const years = yearStatistics(payments);
    expect(years.map((y) => y.year)).toEqual(
      [...years.map((y) => y.year)].sort((a, b) => b - a),
    );
    const yearTotal = years.reduce((sum, y) => sum + Number(y.net.toStringValue()), 0);
    expect(yearTotal).toBe(COUNT);

    expect(securityStatistics(payments)).toHaveLength(SECURITIES);
    expect(depotStatistics(payments)).toHaveLength(DEPOTS);
    expect(monthAcrossYearsStatistics(payments)).toHaveLength(12);
  });
});

describe("heatmapByYearMonth (§11.7)", () => {
  it("liefert eine Zeile je Jahr (neueste zuerst) mit zwölf Monaten", () => {
    const payments = [p("2024-03-10", "100"), p("2025-07-10", "50")];
    const rows = heatmapByYearMonth(payments);
    expect(rows.map((r) => r.year)).toEqual([2025, 2024]);
    expect(rows[0]?.months).toHaveLength(12);
    expect(rows[0]?.months[6]?.net.toStringValue()).toBe("50.00"); // Juli 2025
    expect(rows[1]?.months[2]?.net.toStringValue()).toBe("100.00"); // März 2024
  });
});
