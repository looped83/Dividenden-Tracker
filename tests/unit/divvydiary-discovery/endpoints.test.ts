import { describe, expect, it } from "vitest";
import {
  API_ORIGIN,
  ENDPOINTS,
  buildUrl,
  selectEndpoints,
} from "../../../scripts/divvydiary-discovery/endpoints.ts";

/**
 * Die Allowlist (Auftrag Phase B0 §4: „keine Endpunkte automatisch erraten").
 *
 * Diese Tests bewachen eine Regel, die sich sonst leise aufweichen laesst:
 * Ein Endpunkt darf nur in der Liste stehen, wenn ein Beleg dabei steht.
 */

describe("ENDPOINTS", () => {
  it("fragt ausschliesslich den bekannten Host ueber HTTPS an", () => {
    expect(API_ORIGIN).toBe("https://api.divvydiary.com");
    for (const endpoint of ENDPOINTS) {
      const url = new URL(buildUrl(endpoint, "DE0007164600"));
      expect(url.protocol).toBe("https:");
      expect(url.origin).toBe(API_ORIGIN);
    }
  });

  it("nennt fuer jeden Endpunkt einen nachpruefbaren Beleg", () => {
    for (const endpoint of ENDPOINTS) {
      expect(endpoint.source.length).toBeGreaterThan(20);
      expect(["third_party_source", "own_integration", "vendor_documented"]).toContain(
        endpoint.evidence,
      );
    }
  });

  it("verwendet eindeutige Kennungen", () => {
    const ids = ENDPOINTS.map((endpoint) => endpoint.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildUrl", () => {
  it("setzt die ISIN ein", () => {
    const symbol = ENDPOINTS.find((endpoint) => endpoint.id === "symbol");
    if (!symbol) throw new Error("Endpunkt symbol fehlt in der Allowlist");
    expect(buildUrl(symbol, "DE0007164600")).toBe(
      "https://api.divvydiary.com/symbols/DE0007164600",
    );
  });
});

describe("selectEndpoints", () => {
  it("laesst ISIN-Endpunkte ohne ISIN aus, statt einen Platzhalter zu senden", () => {
    const withoutIsin = selectEndpoints(null).map((endpoint) => endpoint.id);
    expect(withoutIsin).not.toContain("symbol");
    expect(withoutIsin).toContain("session");
  });

  it("nimmt sie mit, sobald eine ISIN vorliegt", () => {
    expect(selectEndpoints("DE0007164600").map((endpoint) => endpoint.id)).toContain(
      "symbol",
    );
  });
});
