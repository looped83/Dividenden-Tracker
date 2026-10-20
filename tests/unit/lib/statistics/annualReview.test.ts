import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import {
  annualReview,
  reviewYears,
  type AnalyticsPayment,
  type ReviewFacets,
} from "@/lib/statistics";
import type { RefDate } from "@/lib/statistics/dates";

let seq = 0;
function p(
  payDate: string,
  net: string,
  options: { security?: string; gross?: string } = {},
): AnalyticsPayment {
  seq += 1;
  return {
    id: `id-${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(options.gross ?? net, EUR),
    securityId: options.security ?? "sec-a",
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

const REF: RefDate = { year: 2026, month: 10, day: 20 };
const NO_FACETS = new Map<string, ReviewFacets>();

describe("reviewYears", () => {
  it("zeigt abgeschlossene Jahre, das laufende erst ab Dezember", () => {
    const payments = [p("2024-03-01", "1"), p("2025-03-01", "1"), p("2026-03-01", "1")];
    expect(reviewYears(payments, REF)).toEqual([2025, 2024]);
    expect(reviewYears(payments, { year: 2026, month: 12, day: 1 })).toEqual([
      2026, 2025, 2024,
    ]);
  });
});

describe("annualReview", () => {
  const payments = [
    p("2024-05-10", "100.00", { security: "a" }),
    p("2024-06-10", "50.00", { security: "b" }),
    p("2025-02-10", "150.00", { security: "a", gross: "200.00" }),
    p("2025-05-10", "60.00", { security: "b", gross: "80.00" }),
    p("2025-05-20", "40.00", { security: "c", gross: "50.00" }),
  ];

  it("liefert null fuer ein Jahr ohne Zahlungen", () => {
    expect(annualReview(payments, 2023, REF, NO_FACETS)).toBeNull();
  });

  it("berechnet Summe, Abzuege, Vorjahr und Platz", () => {
    const review = annualReview(payments, 2025, REF, NO_FACETS);
    expect(review).not.toBeNull();
    if (!review) return;
    expect(review.net.toStringValue()).toBe("250.00");
    expect(review.gross.toStringValue()).toBe("330.00");
    expect(review.deductions.toStringValue()).toBe("80.00");
    expect(review.deductionShare?.toFixed(2)).toBe("24.24");
    expect(review.change.kind).toBe("percent");
    expect(review.priorYearNet?.toStringValue()).toBe("150.00");
    expect(review.rank).toBe(1);
    expect(review.yearCount).toBe(2);
    expect(review.cumulativeNet.toStringValue()).toBe("400.00");
    expect(review.firstYear).toBe(2024);
    expect(review.isPartial).toBe(false);
  });

  it("teilt durch 365 Tage und erkennt den Rekordmonat", () => {
    const review = annualReview(payments, 2025, REF, NO_FACETS);
    expect(review?.perDay.toStringValue()).toBe("0.68");
    expect(review?.bestMonth).toMatchObject({ month: 2 });
    expect(review?.activeMonths).toBe(2);
  });

  it("ordnet Zahler, Neue und die groesste Steigerung", () => {
    const review = annualReview(payments, 2025, REF, NO_FACETS);
    expect(review?.topPayers.map((entry) => entry.securityId)).toEqual(["a", "b", "c"]);
    expect(review?.topPayers[0].share?.toFixed(0)).toBe("60");
    expect(review?.newcomers.map((entry) => entry.securityId)).toEqual(["c"]);
    expect(review?.biggestRaise).toMatchObject({ securityId: "a" });
    expect(review?.biggestRaise?.absolute.toStringValue()).toBe("50.00");
    expect(review?.largestPayment).toMatchObject({
      securityId: "a",
      payDate: "2025-02-10",
    });
  });

  it("fasst Branchen und Laender aus den Stammdaten zusammen", () => {
    const facets = new Map<string, ReviewFacets>([
      ["a", { sector: "Energie", country: "US" }],
      ["b", { sector: "Energie", country: "DE" }],
      ["c", { sector: null, country: "DE" }],
    ]);
    const review = annualReview(payments, 2025, REF, facets);
    expect(review?.countries).toBe(2);
    expect(review?.sectors).toHaveLength(1);
    expect(review?.sectors[0].net.toStringValue()).toBe("210.00");
  });

  it("rechnet das laufende Jahr pro Tag bis heute", () => {
    const current = [p("2026-01-15", "293.00")];
    const review = annualReview(current, 2026, REF, NO_FACETS);
    // 20. Oktober = Tag 293 des Jahres.
    expect(review?.perDay.toStringValue()).toBe("1.00");
    expect(review?.isPartial).toBe(true);
    expect(review?.change.kind).toBe("no-comparison");
  });
});
