import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import { compareRollingTwelveMonths, compareYears } from "@/lib/statistics/comparison";
import type { AnalyticsPayment, RefDate } from "@/lib/statistics";

/**
 * Zeitraumvergleich.
 *
 * Der Schwerpunkt liegt auf **Teiljahren**. Ein laufendes Jahr gegen ein
 * volles Vorjahr zu stellen ist der haeufigste Fehler dieser Art von
 * Auswertung und faellt nicht auf, weil das Ergebnis plausibel aussieht: Im
 * Juli fehlen der einen Seite fuenf Monate, und der Vergleich meldet einen
 * Rueckgang, den es nicht gibt.
 */

let seq = 0;
function payment(payDate: string, net: string): AnalyticsPayment {
  seq += 1;
  return {
    id: `p-${String(seq)}`,
    payDate,
    actualPayDate: payDate,
    netAmount: Money.fromString(net, EUR),
    grossAmount: Money.fromString(net, EUR),
    securityId: "sec-a",
    depotId: "dep-1",
    paymentType: "regular",
    source: "manual",
    createdAt: `${payDate}T10:00:00Z`,
  };
}

/** 29. Juli 2026 — das laufende Jahr ist zu rund 58 % vorbei. */
const REF: RefDate = { year: 2026, month: 7, day: 29 };

function euro(value: string): Money {
  return Money.fromString(value, EUR);
}

describe("compareYears — Teiljahr", () => {
  const payments = [
    // 2025: gleichmaessig ueber das Jahr, 100 € je Quartal.
    payment("2025-03-15", "100.00"),
    payment("2025-06-15", "100.00"),
    payment("2025-09-15", "100.00"),
    payment("2025-12-15", "100.00"),
    // 2026: bis Juli bereits 250 €.
    payment("2026-03-15", "120.00"),
    payment("2026-06-15", "130.00"),
  ];

  it("kappt beide Seiten am Stichtag, wenn eines der Jahre laeuft", () => {
    const result = compareYears(payments, 2026, 2025, REF);

    expect(result.truncated).toBe(true);
    expect(result.current.range.end).toBe("2026-07-29");
    expect(result.reference.range.end).toBe("2025-07-29");
  });

  it("vergleicht 250 € gegen 200 € — nicht gegen die vollen 400 €", () => {
    const result = compareYears(payments, 2026, 2025, REF);

    // Ohne Kappung stuende hier 250 gegen 400: ein gemeldeter Rueckgang von
    // 37,5 %, obwohl das Jahr tatsaechlich besser laeuft.
    expect(result.current.net.equals(euro("250.00"))).toBe(true);
    expect(result.reference.net.equals(euro("200.00"))).toBe(true);
    expect(result.change.kind).toBe("percent");
    if (result.change.kind === "percent") {
      expect(result.change.percent.toFixed(1)).toBe("25.0");
      expect(result.change.absolute.equals(euro("50.00"))).toBe(true);
    }
  });

  it("kappt auch, wenn das laufende Jahr die Vergleichsseite ist", () => {
    const result = compareYears(payments, 2025, 2026, REF);

    expect(result.truncated).toBe(true);
    expect(result.current.net.equals(euro("200.00"))).toBe(true);
    expect(result.reference.net.equals(euro("250.00"))).toBe(true);
  });

  it("zaehlt zwei abgeschlossene Jahre vollstaendig", () => {
    const withOlder = [...payments, payment("2024-05-15", "80.00")];
    const result = compareYears(withOlder, 2025, 2024, REF);

    expect(result.truncated).toBe(false);
    expect(result.current.range.end).toBe("2025-12-31");
    // Volle 400 €, weil 2025 abgeschlossen ist.
    expect(result.current.net.equals(euro("400.00"))).toBe(true);
    expect(result.reference.net.equals(euro("80.00"))).toBe(true);
  });

  it("nennt nur die Monate bis zum Stichtag", () => {
    const result = compareYears(payments, 2026, 2025, REF);
    expect(result.months).toHaveLength(7);
    expect(result.months.at(-1)?.month).toBe(7);
  });

  it("nennt alle zwoelf Monate bei abgeschlossenen Jahren", () => {
    const result = compareYears(payments, 2025, 2024, REF);
    expect(result.months).toHaveLength(12);
  });
});

describe("compareYears — kumulierter Verlauf", () => {
  it("summiert fortlaufend und endet auf der Gesamtsumme", () => {
    const payments = [
      payment("2026-02-10", "50.00"),
      payment("2026-05-10", "70.00"),
      payment("2025-02-10", "40.00"),
      payment("2025-05-10", "40.00"),
    ];
    const result = compareYears(payments, 2026, 2025, REF);

    const february = result.months.find((m) => m.month === 2);
    expect(february?.current.cumulative.equals(euro("50.00"))).toBe(true);

    const may = result.months.find((m) => m.month === 5);
    expect(may?.current.cumulative.equals(euro("120.00"))).toBe(true);
    expect(may?.reference.cumulative.equals(euro("80.00"))).toBe(true);

    // Der letzte kumulierte Wert muss der Periodensumme entsprechen — sonst
    // widerspraeche die Kurve der Kennzahl darueber.
    const last = result.months.at(-1);
    expect(last?.current.cumulative.equals(result.current.net)).toBe(true);
    expect(last?.reference.cumulative.equals(result.reference.net)).toBe(true);
  });

  it("haelt die Summe der Monatswerte gleich der Periodensumme", () => {
    const payments = [
      payment("2026-01-05", "10.00"),
      payment("2026-01-20", "15.00"),
      payment("2026-04-05", "25.00"),
    ];
    const result = compareYears(payments, 2026, 2025, REF);
    const sum = result.months.reduce((acc, m) => acc.add(m.current.net), Money.zero(EUR));
    expect(sum.equals(result.current.net)).toBe(true);
  });
});

describe("Vollstaendigkeit der Monate", () => {
  /**
   * Die Drill-down-Garantie steht und faellt hiermit: Die Zahlungsliste kennt
   * nur Jahr und Monat. Ein am Stichtag angeschnittener Monat darf deshalb
   * nicht verlinkt werden — die Liste zeigte sonst mehr, als die Zahl daneben
   * behauptet.
   */
  it("kennzeichnet den Stichtagsmonat als angeschnitten", () => {
    const result = compareYears([], 2026, 2025, REF);
    const july = result.months.find((m) => m.month === 7);
    expect(july?.current.complete).toBe(false);
    expect(july?.reference.complete).toBe(false);
  });

  it("haelt alle Monate davor fuer vollstaendig", () => {
    const result = compareYears([], 2026, 2025, REF);
    const closed = result.months.filter((m) => m.month < 7);
    expect(closed).toHaveLength(6);
    expect(closed.every((m) => m.current.complete && m.reference.complete)).toBe(true);
  });

  it("kennzeichnet alle Monate abgeschlossener Jahre als vollstaendig", () => {
    const result = compareYears([], 2025, 2024, REF);
    expect(result.months.every((m) => m.current.complete)).toBe(true);
  });

  it("faellt nicht auf den letzten Monatstag herein", () => {
    // Am 31. Juli ist der Juli vollstaendig — dann darf er verlinkt werden.
    const endOfMonth: RefDate = { year: 2026, month: 7, day: 31 };
    const result = compareYears([], 2026, 2025, endOfMonth);
    expect(result.months.find((m) => m.month === 7)?.current.complete).toBe(true);
  });

  it("nennt fuer jede Seite das Jahr, aus dem der Monat stammt", () => {
    const result = compareYears([], 2026, 2025, REF);
    const march = result.months.find((m) => m.month === 3);
    expect(march?.current.year).toBe(2026);
    expect(march?.reference.year).toBe(2025);
  });

  it("nennt im rollierenden Fenster die jeweils richtigen Jahre", () => {
    const result = compareRollingTwelveMonths([], REF);
    // Erster Eintrag: August 2025 gegen August 2024.
    const first = result.months.at(0);
    expect(first).toMatchObject({ month: 8 });
    expect(first?.current).toMatchObject({ year: 2025, month: 8, complete: true });
    expect(first?.reference).toMatchObject({ year: 2024, month: 8, complete: true });
    // Letzter Eintrag: der angeschnittene Stichtagsmonat auf beiden Seiten.
    const last = result.months.at(-1);
    expect(last?.current).toMatchObject({ year: 2026, month: 7, complete: false });
    expect(last?.reference).toMatchObject({ year: 2025, month: 7, complete: false });
  });
});

describe("compareYears — Randfaelle", () => {
  it("meldet den Zustand neu, wenn die Vergleichsseite leer ist", () => {
    const result = compareYears([payment("2026-03-15", "100.00")], 2026, 2025, REF);
    expect(result.change.kind).toBe("new");
  });

  it("meldet beide-null ohne Zahlungen", () => {
    const result = compareYears([], 2026, 2025, REF);
    expect(result.change.kind).toBe("both-zero");
    expect(result.current.count).toBe(0);
  });

  it("zaehlt Nullmonate als Monat mit dem Wert null", () => {
    const result = compareYears([payment("2026-03-15", "100.00")], 2026, 2025, REF);
    const january = result.months.find((m) => m.month === 1);
    expect(january?.current.net.isZero()).toBe(true);
  });

  it("beruecksichtigt negative Korrekturen in der Summe", () => {
    const payments = [
      payment("2026-03-15", "100.00"),
      // Korrekturbuchung mit negativem Betrag.
      payment("2026-04-15", "-30.00"),
      payment("2025-03-15", "100.00"),
    ];
    const result = compareYears(payments, 2026, 2025, REF);
    expect(result.current.net.equals(euro("70.00"))).toBe(true);
    expect(result.change.kind).toBe("percent");
    if (result.change.kind === "percent") {
      expect(result.change.percent.toFixed(1)).toBe("-30.0");
    }
  });

  it("bildet den 29. Februar auf den 28. ab, wenn das Zieljahr kein Schaltjahr ist", () => {
    const leapRef: RefDate = { year: 2028, month: 2, day: 29 };
    const result = compareYears([], 2028, 2027, leapRef);
    expect(result.current.range.end).toBe("2028-02-29");
    expect(result.reference.range.end).toBe("2027-02-28");
  });

  it("zaehlt eine Zahlung genau am Stichtag noch mit", () => {
    const result = compareYears([payment("2026-07-29", "10.00")], 2026, 2025, REF);
    expect(result.current.net.equals(euro("10.00"))).toBe(true);
  });

  it("laesst eine Zahlung einen Tag nach dem Stichtag aussen vor", () => {
    const result = compareYears([payment("2026-07-30", "10.00")], 2026, 2025, REF);
    expect(result.current.net.isZero()).toBe(true);
  });
});

describe("compareRollingTwelveMonths", () => {
  it("umfasst zwoelf Monate je Seite, lueckenlos aneinander", () => {
    const result = compareRollingTwelveMonths([], REF);

    expect(result.months).toHaveLength(12);
    expect(result.current.range).toEqual({ start: "2025-08-01", end: "2026-07-29" });
    expect(result.reference.range).toEqual({ start: "2024-08-01", end: "2025-07-29" });
  });

  it("trennt die beiden Fenster sauber", () => {
    const payments = [
      // Im aktuellen Fenster.
      payment("2025-08-15", "10.00"),
      payment("2026-07-15", "20.00"),
      // Im Vergleichsfenster.
      payment("2024-08-15", "5.00"),
      payment("2025-07-15", "7.00"),
      // Vor beiden Fenstern.
      payment("2024-07-15", "99.00"),
    ];
    const result = compareRollingTwelveMonths(payments, REF);

    expect(result.current.net.equals(euro("30.00"))).toBe(true);
    expect(result.reference.net.equals(euro("12.00"))).toBe(true);
  });

  it("beginnt die Monatsreihe im aeltesten Monat des Fensters", () => {
    const result = compareRollingTwelveMonths([], REF);
    expect(result.months.at(0)?.month).toBe(8);
    expect(result.months.at(-1)?.month).toBe(7);
  });

  it("haengt nicht am Jahreswechsel", () => {
    // Anfang Januar: Ein Jahresvergleich saehe nur wenige Tage, das
    // rollierende Fenster weiterhin zwoelf volle Monate.
    const januaryRef: RefDate = { year: 2026, month: 1, day: 5 };
    const result = compareRollingTwelveMonths(
      [payment("2025-06-15", "50.00")],
      januaryRef,
    );

    expect(result.current.range).toEqual({ start: "2025-02-01", end: "2026-01-05" });
    expect(result.current.net.equals(euro("50.00"))).toBe(true);
  });
});
