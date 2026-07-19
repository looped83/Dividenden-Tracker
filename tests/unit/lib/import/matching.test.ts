import { describe, expect, it } from "vitest";
import { matchCompany, type ExistingSecurity } from "@/lib/import/matchCompany";
import { matchBroker, type ExistingDepot } from "@/lib/import/brokerMatch";
import { normalizeCompareName, normalizeBrokerName } from "@/lib/import/normalizeName";
import { suggestColumnMapping, missingRequiredFields } from "@/lib/import/columnMapping";

const sec = (id: string, name: string, archived = false): ExistingSecurity => ({
  id,
  name,
  isin: null,
  wkn: null,
  archived,
});

describe("matchCompany — Stufe B (exakter Name)", () => {
  it("ordnet exakten Namen automatisch zu", () => {
    const match = matchCompany("Allianz SE", [sec("1", "Allianz SE")]);
    expect(match.reason).toBe("exact_name");
    expect(match.autoAssignable).toBe(true);
    expect(match.securityId).toBe("1");
  });

  it("ignoriert Gross-/Kleinschreibung und Whitespace", () => {
    const match = matchCompany("  realty   income  ", [sec("9", "Realty Income")]);
    expect(match.reason).toBe("exact_name");
  });
});

describe("matchCompany — Stufe D (nur Hinweis, nie automatisch)", () => {
  it("fuehrt 'Allianz' und 'Allianz SE' NICHT automatisch zusammen", () => {
    const match = matchCompany("Allianz", [sec("1", "Allianz SE")]);
    expect(match.autoAssignable).toBe(false);
    expect(match.reason).toBe("similar");
    expect(match.securityId).toBeNull();
    expect(match.suggestions[0].securityName).toBe("Allianz SE");
  });

  it("fuehrt 'Realty Income' und 'Realty Income Corporation' NICHT automatisch zusammen", () => {
    const match = matchCompany("Realty Income Corporation", [sec("9", "Realty Income")]);
    expect(match.autoAssignable).toBe(false);
    expect(match.reason).toBe("similar");
  });

  it("haelt JPM EU Equity und JPM US Equity strikt getrennt", () => {
    const match = matchCompany("JPM US Equity", [sec("5", "JPM EU Equity")]);
    // Aehnlich, aber niemals automatisch — Nutzer muss entscheiden.
    expect(match.autoAssignable).toBe(false);
  });

  it("schlaegt 'JP Morgan' nicht automatisch als 'JPMorgan Chase & Co' zu", () => {
    const match = matchCompany("JP Morgan", [sec("7", "JPMorgan Chase & Co")]);
    expect(match.autoAssignable).toBe(false);
  });
});

describe("matchCompany — Stufe C (Alias)", () => {
  it("loest bestaetigten Alias auf genau ein Unternehmen auf", () => {
    const match = matchCompany(
      "Allianz",
      [sec("1", "Allianz SE")],
      [{ aliasNormalized: normalizeCompareName("Allianz"), securityId: "1" }],
    );
    expect(match.reason).toBe("alias");
    expect(match.autoAssignable).toBe(true);
    expect(match.securityId).toBe("1");
  });
});

describe("matchCompany — keine Kandidaten", () => {
  it("liefert reason none, wenn nichts passt", () => {
    const match = matchCompany("Völlig Anderes Wertpapier XYZ", [sec("1", "Allianz SE")]);
    expect(match.reason).toBe("none");
    expect(match.autoAssignable).toBe(false);
  });
});

describe("matchBroker", () => {
  const depots: ExistingDepot[] = [
    { id: "d1", name: "Trade Republic", broker: "Trade Republic", archived: false },
    { id: "d2", name: "Consorsbank", broker: null, archived: false },
  ];

  it("ordnet exakten (normalisierten) Namen automatisch zu", () => {
    const match = matchBroker("trade republic", depots);
    expect(match.autoAssignable).toBe(true);
    expect(match.depotId).toBe("d1");
  });

  it("liefert keinen Treffer fuer unbekannten Broker", () => {
    const match = matchBroker("Scalable Capital", depots);
    expect(match.reason).toBe("none");
    expect(match.depotId).toBeNull();
  });

  it("normalisiert nur Format, nicht Inhalt", () => {
    expect(normalizeBrokerName("  Trade   Republic ")).toBe("trade republic");
  });
});

describe("suggestColumnMapping", () => {
  it("erkennt die vier Spalten der realen Datei", () => {
    const mapping = suggestColumnMapping(["Datum", "Investment", "Betrag", "Broker"]);
    expect(mapping.pay_date).toBe(0);
    expect(mapping.security).toBe(1);
    expect(mapping.net_amount).toBe(2);
    expect(mapping.broker).toBe(3);
    expect(missingRequiredFields(mapping)).toEqual([]);
  });

  it("erkennt englische Synonyme", () => {
    const mapping = suggestColumnMapping([
      "Payment Date",
      "Security",
      "Net Amount",
      "Account",
    ]);
    expect(missingRequiredFields(mapping)).toEqual([]);
  });

  it("meldet fehlende Pflichtfelder", () => {
    const mapping = suggestColumnMapping(["Datum", "Investment"]);
    expect(missingRequiredFields(mapping)).toContain("net_amount");
    expect(missingRequiredFields(mapping)).toContain("broker");
  });
});
