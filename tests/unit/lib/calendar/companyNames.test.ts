import { describe, expect, it } from "vitest";
import {
  buildCompanyNameResolver,
  canonicalCompanyKey,
  resolveCompanyNames,
  type KnownCompany,
} from "@/lib/calendar/companyNames";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * Angleichung der Feed-Namen an die angelegten Unternehmen.
 *
 * Gefordert ist Eindeutigkeit, nicht Trefferquote: Ein geratener Treffer
 * schriebe an einen Termin den Namen eines fremden Unternehmens — dagegen ist
 * eine stehengebliebene Schreibweise der Quelle harmlos.
 */
function company(name: string, overrides: Partial<KnownCompany> = {}): KnownCompany {
  return { id: name, name, archived: false, ...overrides };
}

describe("canonicalCompanyKey", () => {
  it("laesst die Rechtsform am Ende weg", () => {
    expect(canonicalCompanyKey("Realty Income Corporation")).toBe("realty income");
    expect(canonicalCompanyKey("Allianz SE")).toBe("allianz");
    expect(canonicalCompanyKey("Unilever plc")).toBe("unilever");
    expect(canonicalCompanyKey("Investor AB")).toBe("investor");
  });

  it("vereinheitlicht Satzzeichen, Bindestriche und Fuellwoerter", () => {
    expect(canonicalCompanyKey("The Coca-Cola Company")).toBe("coca cola");
    expect(canonicalCompanyKey("Coca Cola Co.")).toBe("coca cola");
    expect(canonicalCompanyKey("Johnson & Johnson")).toBe("johnson johnson");
    expect(canonicalCompanyKey("Johnson and Johnson")).toBe("johnson johnson");
  });

  it("laesst Fondsart, Ausschuettungsart und Anteilsklasse am Ende weg", () => {
    // Der Kalender nennt ETFs in voller Laenge, der eigene Bestand nicht.
    expect(canonicalCompanyKey("JPM US Equity Premium Income Active UCITS ETF")).toBe(
      "jpm us equity premium income active",
    );
    expect(
      canonicalCompanyKey("JPM Europe Equity Premium Income Active UCITS ETF EUR (dist)"),
    ).toBe("jpm europe equity premium income active");
    expect(canonicalCompanyKey("JPM Nasdaq Equity Premium Income Active")).toBe(
      "jpm nasdaq equity premium income active",
    );
  });

  it("behaelt Rechtsformen mitten im Namen", () => {
    // „Co" ist hier keine Rechtsform, sondern der Anfang des Namens.
    expect(canonicalCompanyKey("Co-operative Group")).toBe("co operative group");
  });

  it("behaelt einen Namen, der nur aus einer Rechtsform besteht", () => {
    expect(canonicalCompanyKey("SE")).toBe("se");
  });
});

describe("buildCompanyNameResolver", () => {
  it("loest den gleichen Namen auf die eigene Schreibweise auf", () => {
    const resolve = buildCompanyNameResolver([company("Apple Inc.")]);

    expect(resolve("apple inc.")).toBe("Apple Inc.");
  });

  it("loest ueber die Rechtsform hinweg auf", () => {
    const resolve = buildCompanyNameResolver([company("Realty Income")]);

    expect(resolve("Realty Income Corporation")).toBe("Realty Income");
    expect(resolve("Realty Income Corp.")).toBe("Realty Income");
  });

  it("loest den langen ETF-Namen der Quelle auf den eigenen auf", () => {
    const resolve = buildCompanyNameResolver([
      company("JPM Europe Equity Premium Income Active", { id: "s1" }),
      company("JPM US Equity Premium Income Active", { id: "s2" }),
    ]);

    expect(resolve("JPM Europe Equity Premium Income Active UCITS ETF EUR (dist)")).toBe(
      "JPM Europe Equity Premium Income Active",
    );
    expect(resolve("JPM US Equity Premium Income Active UCITS ETF USD (dist)")).toBe(
      "JPM US Equity Premium Income Active",
    );
    // Die Fonds unterscheiden sich nur im Regionswort — verwechselt werden
    // duerfen sie deshalb nicht.
    expect(resolve("JPM Global Equity Premium Income Active UCITS ETF")).toBeNull();
  });

  it("nutzt beim Import bestaetigte Schreibweisen", () => {
    const resolve = buildCompanyNameResolver(
      [company("Coca-Cola", { id: "s1" })],
      [{ aliasNormalized: "the coca-cola company", securityId: "s1" }],
    );

    expect(resolve("The Coca-Cola Company")).toBe("Coca-Cola");
  });

  it("laesst unbekannte Namen unangetastet", () => {
    const resolve = buildCompanyNameResolver([company("Allianz SE")]);

    expect(resolve("Apple Inc.")).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(resolve("   ")).toBeNull();
  });

  it("gleicht nicht an, wenn zwei Unternehmen in Frage kommen", () => {
    const resolve = buildCompanyNameResolver([
      company("Vonovia", { id: "s1" }),
      company("Vonovia SE", { id: "s2" }),
    ]);

    // Beide ergeben denselben Schluessel: Welcher gemeint ist, weiss nur der
    // Mensch — also bleibt der Name der Quelle stehen.
    expect(resolve("Vonovia AG")).toBeNull();
    // Der exakte Name bleibt eindeutig und greift weiterhin.
    expect(resolve("vonovia se")).toBe("Vonovia SE");
  });

  it("zieht das aktive Unternehmen dem archivierten vor", () => {
    const resolve = buildCompanyNameResolver([
      company("Apple", { id: "alt", archived: true }),
      company("Apple Inc.", { id: "neu" }),
    ]);

    expect(resolve("Apple Incorporated")).toBe("Apple Inc.");
  });

  it("nutzt auch archivierte Unternehmen, wenn es kein aktives gibt", () => {
    const resolve = buildCompanyNameResolver([
      company("Apple", { id: "alt", archived: true }),
    ]);

    expect(resolve("Apple Inc.")).toBe("Apple");
  });
});

describe("resolveCompanyNames", () => {
  const event = (companyName: string | null): CalendarEvent => ({
    id: "1",
    externalUid: "uid-1",
    eventType: "payment",
    eventState: "active",
    title: `${companyName ?? ""} 10,00 € Zahltag (Trade Republic)`,
    companyName,
    matchedCompanyName: null,
    expectedAmount: null,
    sourcePortfolio: null,
    description: null,
    location: null,
    externalUrl: null,
    categories: [],
    date: "2026-08-13",
    endDate: null,
    startsAt: null,
    endsAt: null,
    isAllDay: true,
  });

  it("haengt den eigenen Namen an, ohne den der Quelle zu verlieren", () => {
    const resolve = buildCompanyNameResolver([company("Realty Income")]);

    const [ergebnis] = resolveCompanyNames([event("Realty Income Corporation")], resolve);

    expect(ergebnis.matchedCompanyName).toBe("Realty Income");
    expect(ergebnis.companyName).toBe("Realty Income Corporation");
  });

  it("gibt unveraenderte Termine unveraendert zurueck", () => {
    const resolve = buildCompanyNameResolver([company("Allianz SE")]);
    const original = event("Apple Inc.");

    const [ergebnis] = resolveCompanyNames([original], resolve);

    // Dasselbe Objekt: React zeichnet nur neu, was sich geaendert hat.
    expect(ergebnis).toBe(original);
  });

  it("laesst Termine ohne erkannten Unternehmensnamen unberuehrt", () => {
    const resolve = buildCompanyNameResolver([company("Allianz SE")]);
    const original = event(null);

    expect(resolveCompanyNames([original], resolve)[0]).toBe(original);
  });
});
