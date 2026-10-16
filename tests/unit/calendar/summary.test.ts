import { describe, expect, it } from "vitest";
import {
  parseSummary,
  toCanonicalAmount,
  toCurrencyCode,
} from "../../../supabase/functions/_shared/summary.ts";

/**
 * Zerlegung der SUMMARY-Zeile des Feeds.
 *
 * Die Beispiele bilden die Gestalt echter Eintraege nach; Unternehmen, Betraege
 * und Depots sind erfunden.
 */

describe("toCanonicalAmount", () => {
  it("liest deutsche Schreibweise", () => {
    expect(toCanonicalAmount("51,37")).toBe("51.37");
    expect(toCanonicalAmount("1.234,56")).toBe("1234.56");
    expect(toCanonicalAmount("0,26")).toBe("0.26");
  });

  it("liest englische Schreibweise", () => {
    expect(toCanonicalAmount("51.37")).toBe("51.37");
    expect(toCanonicalAmount("1,234.56")).toBe("1234.56");
  });

  it("deutet ein einzelnes Trennzeichen mit drei Ziffern als Tausender", () => {
    expect(toCanonicalAmount("1.234")).toBe("1234");
    expect(toCanonicalAmount("1,234")).toBe("1234");
    // Zwei Ziffern dahinter sind ein Dezimaltrennzeichen.
    expect(toCanonicalAmount("51,3")).toBe("51.3");
  });

  it("nimmt ganze Zahlen und Leerzeichen als Gruppierung", () => {
    expect(toCanonicalAmount("42")).toBe("42");
    expect(toCanonicalAmount("12 345,67")).toBe("12345.67");
  });

  it("weist Unbrauchbares zurueck", () => {
    expect(toCanonicalAmount("")).toBeNull();
    expect(toCanonicalAmount("keine Zahl")).toBeNull();
    expect(toCanonicalAmount("12,34,56,78")).toBe("123456.78");
    // Unplausibel gross — eher ein Lesefehler als ein Betrag.
    expect(toCanonicalAmount("1234567890123")).toBeNull();
  });
});

describe("toCurrencyCode", () => {
  it("uebersetzt eindeutige Zeichen", () => {
    expect(toCurrencyCode("€")).toBe("EUR");
    expect(toCurrencyCode("$")).toBe("USD");
    expect(toCurrencyCode("£")).toBe("GBP");
    expect(toCurrencyCode("CA$")).toBe("CAD");
  });

  it("nimmt ISO-Codes unveraendert", () => {
    expect(toCurrencyCode("USD")).toBe("USD");
    expect(toCurrencyCode("chf")).toBe("CHF");
  });

  it("weist alles andere zurueck", () => {
    expect(toCurrencyCode("Zahltag")).toBeNull();
    expect(toCurrencyCode("")).toBeNull();
    expect(toCurrencyCode("12")).toBeNull();
  });
});

describe("parseSummary", () => {
  it("zerlegt die vollstaendige Zeile des Feeds", () => {
    const parsed = parseSummary(
      "Verizon Communications Inc 51,37 € Zahltag (Trade Republic)",
    );

    expect(parsed).toEqual({
      company: "Verizon Communications Inc",
      amount: "51.37",
      currency: "EUR",
      eventType: "payment",
      portfolio: "Trade Republic",
    });
  });

  it("erkennt den Ex-Tag als eigene Ereignisart", () => {
    const parsed = parseSummary("Allianz SE 12,00 € Ex-Tag (Depot A)");

    expect(parsed.eventType).toBe("ex_date");
    expect(parsed.company).toBe("Allianz SE");
  });

  it("kommt ohne Depotangabe aus", () => {
    const parsed = parseSummary("Apple Inc. 0,26 $ Zahltag");

    expect(parsed).toMatchObject({
      company: "Apple Inc.",
      amount: "0.26",
      currency: "USD",
      eventType: "payment",
      portfolio: null,
    });
  });

  it("kommt ohne Ereignisart aus", () => {
    const parsed = parseSummary("Coca-Cola Co. 9,80 € (Trade Republic)");

    expect(parsed).toMatchObject({
      company: "Coca-Cola Co.",
      amount: "9.80",
      currency: "EUR",
      eventType: null,
      portfolio: "Trade Republic",
    });
  });

  it("liest die Waehrung auch vor dem Betrag", () => {
    const parsed = parseSummary("Microsoft Corporation $ 1.234,50 Zahltag");

    expect(parsed).toMatchObject({
      company: "Microsoft Corporation",
      amount: "1234.50",
      currency: "USD",
    });
  });

  it("laesst Unternehmensnamen mit Zahlen und Punkten unversehrt", () => {
    const parsed = parseSummary("3M Co. 42,10 € Zahltag (Trade Republic)");

    expect(parsed.company).toBe("3M Co.");
    expect(parsed.amount).toBe("42.10");
  });

  it("gibt nichts zurueck, wenn nur ein Name dasteht", () => {
    const parsed = parseSummary("Verizon Communications Inc");

    expect(parsed).toEqual({
      company: "Verizon Communications Inc",
      amount: null,
      currency: null,
      eventType: null,
      portfolio: null,
    });
  });

  it("erfindet keinen Betrag, wenn die Waehrung fehlt", () => {
    const parsed = parseSummary("Beispiel AG 51,37 Zahltag");

    expect(parsed.amount).toBeNull();
    expect(parsed.currency).toBeNull();
    // Der Betrag bleibt Teil des Namens, statt still zu verschwinden.
    expect(parsed.company).toBe("Beispiel AG 51,37");
  });

  it("kuerzt einen uebermaessig langen Namen, statt den Lauf scheitern zu lassen", () => {
    // Eine Zeile, die der Parser nicht zerlegen kann, wuerde sonst in voller
    // Laenge als Unternehmensname in eine Spalte mit Grenze 300 geschrieben —
    // und der Datenbank-Check liesse die gesamte Synchronisation scheitern.
    const lang = "A".repeat(480);

    const parsed = parseSummary(lang);

    expect(parsed.company).toHaveLength(300);
    expect(parsed.company?.startsWith("AAA")).toBe(true);
  });

  it("kuerzt auch eine ueberlange Depotangabe", () => {
    const parsed = parseSummary(`Beispiel AG 1,00 € Zahltag (${"D".repeat(220)})`);

    expect(parsed.portfolio).toHaveLength(200);
    expect(parsed.company).toBe("Beispiel AG");
  });

  it("kommt mit leerer und fehlender Zeile zurecht", () => {
    expect(parseSummary(null).company).toBeNull();
    expect(parseSummary("   ").company).toBeNull();
  });
});
