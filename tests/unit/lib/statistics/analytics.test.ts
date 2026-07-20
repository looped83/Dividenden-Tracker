import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { AnalyticsPayment } from "@/lib/statistics";
import {
  aggregateInYear,
  availableYears,
  averagePerMonth,
  bestMonthAllTime,
  bestMonthInYear,
  comparePeriods,
  currentMonthComparison,
  distinctDepots,
  distinctSecurities,
  groupByDepot,
  groupBySecurity,
  historicalSummary,
  monthlyBuckets,
  rankGroups,
  recentPayments,
  selectedPeriodAggregate,
  selectedYearComparison,
  shareOfTotal,
  yearlyBuckets,
} from "@/lib/statistics";
import type { RefDate } from "@/lib/statistics/dates";

let seq = 0;
function p(
  payDate: string,
  net: string,
  options: {
    security?: string;
    depot?: string;
    created?: string;
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
    paymentType: "regular",
    source: "manual",
    createdAt: options.created ?? `${payDate}T10:00:00Z`,
  };
}

const REF_2026_JUL20: RefDate = { year: 2026, month: 7, day: 20 };

describe("aggregate + selectedPeriod", () => {
  it("summiert Nettobetraege decimal-sicher (0,1 + 0,2)", () => {
    const payments = [p("2026-01-10", "0.10"), p("2026-02-10", "0.20")];
    expect(aggregateInYear(payments, 2026).net.toStringValue()).toBe("0.30");
  });

  it("zaehlt Zahlungen im Jahr", () => {
    const payments = [p("2026-01-10", "5"), p("2026-05-10", "5"), p("2025-05-10", "5")];
    const agg = selectedPeriodAggregate(payments, 2026);
    expect(agg.count).toBe(2);
    expect(agg.net.toStringValue()).toBe("10.00");
  });

  it("selectedPeriod 'all' summiert die gesamte Historie", () => {
    const payments = [p("2026-01-10", "5"), p("2024-05-10", "7")];
    const agg = selectedPeriodAggregate(payments, "all");
    expect(agg.count).toBe(2);
    expect(agg.net.toStringValue()).toBe("12.00");
  });
});

describe("monthlyBuckets", () => {
  it("liefert 12 Monate mit Nullwerten fuer zahlungsfreie Monate", () => {
    const payments = [
      p("2025-03-10", "100"),
      p("2025-03-20", "50"),
      p("2025-11-01", "30"),
    ];
    const buckets = monthlyBuckets(payments, 2025);
    expect(buckets).toHaveLength(12);
    expect(buckets[2]?.net.toStringValue()).toBe("150.00"); // Maerz
    expect(buckets[2]?.count).toBe(2);
    expect(buckets[10]?.net.toStringValue()).toBe("30.00"); // November
    expect(buckets[0]?.net.toStringValue()).toBe("0.00"); // Januar leer
    expect(buckets[0]?.count).toBe(0);
  });

  it("ignoriert Zahlungen anderer Jahre", () => {
    const payments = [p("2025-03-10", "100"), p("2026-03-10", "999")];
    const buckets = monthlyBuckets(payments, 2025);
    expect(buckets[2]?.net.toStringValue()).toBe("100.00");
  });
});

describe("yearlyBuckets", () => {
  it("gruppiert je Jahr, chronologisch aufsteigend", () => {
    const payments = [p("2026-01-10", "5"), p("2024-01-10", "7"), p("2025-01-10", "3")];
    const buckets = yearlyBuckets(payments);
    expect(buckets.map((b) => b.year)).toEqual([2024, 2025, 2026]);
    expect(buckets[0]?.net.toStringValue()).toBe("7.00");
  });
});

describe("groupBy + rankGroups", () => {
  const payments = [
    p("2026-01-10", "100", { security: "sec-a" }),
    p("2026-02-10", "100", { security: "sec-a" }),
    p("2026-03-10", "300", { security: "sec-b" }),
    p("2026-04-10", "50", { security: "sec-c" }),
  ];

  it("gruppiert nach Unternehmen und rankt nach Betrag absteigend", () => {
    const ranked = rankGroups(groupBySecurity(payments));
    expect(ranked.map((g) => g.key)).toEqual(["sec-b", "sec-a", "sec-c"]);
    expect(ranked[0]?.net.toStringValue()).toBe("300.00");
    expect(ranked[1]?.net.toStringValue()).toBe("200.00");
    expect(ranked[1]?.count).toBe(2);
  });

  it("bricht Gleichstand bei Betrag ueber Anzahl und dann Name", () => {
    const tie = [
      p("2026-01-10", "100", { security: "b-corp" }),
      p("2026-02-10", "100", { security: "a-corp" }),
    ];
    const labelOf = (key: string) => key;
    const ranked = rankGroups(groupBySecurity(tie), labelOf);
    // gleicher Betrag (100) und gleiche Anzahl (1) -> alphabetisch: a-corp zuerst
    expect(ranked.map((g) => g.key)).toEqual(["a-corp", "b-corp"]);
  });

  it("gruppiert nach Depot", () => {
    const perDepot = [
      p("2026-01-10", "40", { depot: "dep-1" }),
      p("2026-02-10", "60", { depot: "dep-2" }),
    ];
    const ranked = rankGroups(groupByDepot(perDepot));
    expect(ranked.map((g) => g.key)).toEqual(["dep-2", "dep-1"]);
  });

  it("berechnet Anteil an der Gesamtsumme, null bei Gesamt 0", () => {
    const total = Money.fromString("500", EUR);
    const part = Money.fromString("300", EUR);
    expect(shareOfTotal(part, total)?.toFixed(1)).toBe("60.0");
    expect(shareOfTotal(part, Money.zero(EUR))).toBeNull();
  });
});

describe("bestMonth", () => {
  it("findet den besten Monat innerhalb eines Jahres", () => {
    const payments = [
      p("2025-03-10", "100"),
      p("2025-07-10", "250"),
      p("2025-07-20", "50"),
      p("2025-11-10", "200"),
    ];
    const best = bestMonthInYear(payments, 2025);
    expect(best).not.toBeNull();
    expect(best?.month).toBe(7);
    expect(best?.net.toStringValue()).toBe("300.00");
  });

  it("bevorzugt bei Gleichstand den aktuelleren Monat", () => {
    const payments = [p("2025-03-10", "100"), p("2025-09-10", "100")];
    expect(bestMonthInYear(payments, 2025)?.month).toBe(9);
  });

  it("findet den besten Monat der gesamten Historie", () => {
    const payments = [p("2024-05-10", "500"), p("2026-02-10", "400")];
    const best = bestMonthAllTime(payments);
    expect(best?.year).toBe(2024);
    expect(best?.month).toBe(5);
  });

  it("liefert null ohne Zahlungen", () => {
    expect(bestMonthAllTime([])).toBeNull();
  });
});

describe("historicalSummary", () => {
  it("liefert Summe, Anzahl, erste/letzte Zahlung und Distinct-Zaehler", () => {
    const payments = [
      p("2024-05-10", "100", { security: "sec-a", depot: "dep-1" }),
      p("2026-02-10", "200", { security: "sec-b", depot: "dep-2" }),
      p("2025-06-10", "50", { security: "sec-a", depot: "dep-1" }),
    ];
    const summary = historicalSummary(payments);
    expect(summary.net.toStringValue()).toBe("350.00");
    expect(summary.count).toBe(3);
    expect(summary.firstPayDate).toBe("2024-05-10");
    expect(summary.lastPayDate).toBe("2026-02-10");
    expect(summary.distinctSecurities).toBe(2);
    expect(summary.distinctDepots).toBe(2);
  });

  it("liefert leere Historie ohne Zahlungen", () => {
    const summary = historicalSummary([]);
    expect(summary.net.toStringValue()).toBe("0.00");
    expect(summary.firstPayDate).toBeNull();
    expect(summary.lastPayDate).toBeNull();
  });
});

describe("distinct + availableYears", () => {
  it("zaehlt Unternehmen und Depots eindeutig", () => {
    const payments = [
      p("2026-01-10", "1", { security: "a", depot: "d1" }),
      p("2026-02-10", "1", { security: "a", depot: "d2" }),
      p("2026-03-10", "1", { security: "b", depot: "d1" }),
    ];
    expect(distinctSecurities(payments)).toBe(2);
    expect(distinctDepots(payments)).toBe(2);
  });

  it("leitet vorhandene Jahre absteigend ab", () => {
    const payments = [p("2024-01-10", "1"), p("2026-01-10", "1"), p("2024-05-10", "1")];
    expect(availableYears(payments)).toEqual([2026, 2024]);
  });
});

describe("recentPayments", () => {
  it("sortiert nach Datum, dann Erstellungszeit, dann ID absteigend", () => {
    const payments = [
      p("2026-01-10", "1", { id: "a", created: "2026-01-10T08:00:00Z" }),
      p("2026-07-10", "1", { id: "b", created: "2026-07-10T08:00:00Z" }),
      p("2026-07-10", "1", { id: "c", created: "2026-07-10T09:00:00Z" }),
    ];
    const recent = recentPayments(payments, 2);
    expect(recent.map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("respektiert das Limit", () => {
    const payments = Array.from({ length: 15 }, (_, i) =>
      p(`2026-01-${String(i + 1).padStart(2, "0")}`, "1"),
    );
    expect(recentPayments(payments, 5)).toHaveLength(5);
    expect(recentPayments(payments)).toHaveLength(10);
  });
});

describe("averagePerMonth", () => {
  it("teilt im laufenden Jahr durch begonnene Monate (inkl. aktuellem)", () => {
    // Summe 700 im Jahr 2026, Referenz Juli -> 7 Monate -> 100,00
    const payments = [p("2026-03-10", "300"), p("2026-07-10", "400")];
    expect(averagePerMonth(payments, 2026, REF_2026_JUL20).toStringValue()).toBe(
      "100.00",
    );
  });

  it("teilt im abgeschlossenen Jahr durch zwoelf", () => {
    const payments = [p("2024-06-10", "1200")];
    expect(averagePerMonth(payments, 2024, REF_2026_JUL20).toStringValue()).toBe(
      "100.00",
    );
  });
});

describe("comparePeriods (§6.4)", () => {
  it("berechnet Prozent bei Vergleichswert > 0", () => {
    const result = comparePeriods(
      Money.fromString("120", EUR),
      Money.fromString("100", EUR),
    );
    expect(result.kind).toBe("percent");
    if (result.kind === "percent") {
      expect(result.absolute.toStringValue()).toBe("20.00");
      expect(result.percent.toFixed(1)).toBe("20.0");
    }
  });

  it("meldet 'new', wenn Vorjahr 0 und aktuell > 0", () => {
    const result = comparePeriods(Money.fromString("50", EUR), Money.zero(EUR));
    expect(result.kind).toBe("new");
  });

  it("meldet 'both-zero', wenn beide Werte 0", () => {
    const result = comparePeriods(Money.zero(EUR), Money.zero(EUR));
    expect(result.kind).toBe("both-zero");
  });

  it("meldet 'no-comparison', wenn kein Vergleichszeitraum existiert", () => {
    const result = comparePeriods(Money.fromString("50", EUR), null);
    expect(result.kind).toBe("no-comparison");
  });
});

describe("selectedYearComparison (§6.1/§6.2)", () => {
  const payments = [
    // 2025 (Vorjahr)
    p("2025-03-10", "100"),
    p("2025-09-10", "100"), // liegt nach dem 20.07. -> zaehlt nicht in YTD-Vergleich
    // 2026 (laufend)
    p("2026-03-10", "150"),
  ];

  it("vergleicht laufendes Jahr mit gleichem YTD-Zeitraum", () => {
    const { current, prior } = selectedYearComparison(payments, 2026, REF_2026_JUL20);
    expect(current.toStringValue()).toBe("150.00");
    // Nur die Vorjahreszahlung bis 20.07. (100), nicht die vom September.
    expect(prior?.toStringValue()).toBe("100.00");
  });

  it("vergleicht abgeschlossenes Jahr mit vollem Vorjahr", () => {
    const { current, prior } = selectedYearComparison(payments, 2025, REF_2026_JUL20);
    expect(current.toStringValue()).toBe("200.00"); // volles 2025
    expect(prior?.toStringValue()).toBe("0.00"); // 2024 leer
  });

  it("liefert keinen Vergleich bei 'Alle Jahre'", () => {
    const { prior } = selectedYearComparison(payments, "all", REF_2026_JUL20);
    expect(prior).toBeNull();
  });
});

describe("currentMonthComparison (§6.3)", () => {
  it("vergleicht aktuellen Monat bis heute mit gleichem Vorjahreszeitraum", () => {
    const payments = [
      p("2026-07-05", "80"),
      p("2026-07-25", "20"), // nach dem 20. -> nicht im MTD
      p("2025-07-10", "60"),
      p("2025-07-30", "10"), // nach dem 20. im Vorjahr -> nicht im Vergleich
    ];
    const { current, prior } = currentMonthComparison(payments, REF_2026_JUL20);
    expect(current.toStringValue()).toBe("80.00");
    expect(prior.toStringValue()).toBe("60.00");
  });
});
