import { describe, expect, it } from "vitest";
import {
  collectSecrets,
  describeValue,
  maskHeaders,
  maskSecret,
  maskUrl,
  redactText,
} from "../../../scripts/divvydiary-discovery/sanitize.ts";

/**
 * Maskierung und Reduktion (Auftrag Phase B0 §22 „Maskierung sensibler Werte").
 *
 * Geprueft wird nicht nur, dass maskiert wird, sondern dass das Geheimnis in
 * der Ausgabe nicht mehr **vorkommt** — das ist die Eigenschaft, auf die es
 * ankommt.
 */

const KEY = "dd_live_1234567890abcdef";

describe("maskSecret", () => {
  it("gibt den Schluessel nicht preis", () => {
    const masked = maskSecret(KEY);
    expect(masked).not.toContain(KEY);
    expect(masked).not.toContain("7890abcdef");
  });

  it("bleibt wiedererkennbar, ohne benutzbar zu sein", () => {
    expect(maskSecret(KEY)).toContain("dd_l");
    expect(maskSecret(KEY)).toContain("24 Zeichen");
  });

  it("ersetzt kurze Werte vollstaendig", () => {
    expect(maskSecret("kurz")).toBe("****");
    expect(maskSecret("12345678")).toBe("****");
  });

  it("behandelt den leeren Wert", () => {
    expect(maskSecret("")).toBe("");
  });
});

describe("maskUrl", () => {
  it("entfernt den Token aus einer Feed-Adresse", () => {
    const masked = maskUrl(
      "https://api.divvydiary.com/dividends/upcoming/ical?dates=pay&token=abc123",
    );
    expect(masked).not.toContain("abc123");
    expect(masked).toContain("dates=pay");
  });

  it.each(["key", "apikey", "api_key", "access_token", "sig"])(
    "maskiert den Parameter %s",
    (name) => {
      expect(maskUrl(`https://api.divvydiary.com/x?${name}=streng-geheim`)).not.toContain(
        "streng-geheim",
      );
    },
  );

  it("laesst harmlose Parameter stehen", () => {
    expect(maskUrl("https://api.divvydiary.com/symbols?isin=DE0007164600")).toContain(
      "DE0007164600",
    );
  });

  it("gibt bei einer unlesbaren Adresse nichts weiter", () => {
    expect(maskUrl("kein-url token=abc123")).toBe("<unlesbare Adresse>");
  });
});

describe("maskHeaders", () => {
  it("maskiert Zugangsdaten und laesst technische Kopfzeilen stehen", () => {
    const masked = maskHeaders({
      "X-API-Key": KEY,
      Authorization: `Bearer ${KEY}`,
      Cookie: "session=xyz1234567",
      "Content-Type": "application/json",
    });

    expect(JSON.stringify(masked)).not.toContain(KEY);
    expect(masked["Cookie"]).not.toContain("xyz1234567");
    expect(masked["Content-Type"]).toBe("application/json");
  });
});

describe("redactText", () => {
  it("entfernt Geheimnisse aus einer Fehlermeldung", () => {
    const message = `request to https://api.divvydiary.com/session with key ${KEY} failed`;
    expect(redactText(message, [KEY])).not.toContain(KEY);
  });

  it("kuerzt ausufernde Antworten", () => {
    expect(redactText("x".repeat(500), []).length).toBeLessThanOrEqual(301);
  });

  it("ignoriert zu kurze Geheimnisse, statt den Text zu zerstoeren", () => {
    expect(redactText("abc def", ["ab"])).toBe("abc def");
  });
});

describe("describeValue", () => {
  it("reduziert Geldbetraege auf ihre Gestalt", () => {
    const described = describeValue(12345.67);
    expect(described).toBe("number (5 VK, 2 NK)");
    expect(described).not.toContain("12345");
  });

  it("beschreibt ganze Zahlen ohne Nachkommastellen", () => {
    expect(describeValue(42)).toBe("number (2 VK)");
  });

  it.each([
    ["DE0007164600", "ISIN"],
    ["A0X8ZS", "WKN-Form"],
    ["EUR", "Waehrungscode"],
    ["XETR", "MIC-Form"],
    ["2026-08-03", "Datum (ISO)"],
    ["2026-08-03T10:00:00Z", "Zeitpunkt (ISO)"],
  ])("erkennt %s als %s", (value, label) => {
    expect(describeValue(value)).toBe(`string (${label})`);
  });

  it("gibt unbekannte Zeichenketten nicht wieder", () => {
    const described = describeValue("Verizon Communications Inc");
    expect(described).toBe("string (26 Zeichen)");
    expect(described).not.toContain("Verizon");
  });

  it("beschreibt null, Wahrheitswerte, Listen und Objekte", () => {
    expect(describeValue(null)).toBe("null");
    expect(describeValue(true)).toBe("boolean (true)");
    expect(describeValue([1, 2, 3])).toBe("array[3]");
    expect(describeValue({ a: 1, b: 2 })).toBe("object{2 Felder}");
  });
});

describe("collectSecrets", () => {
  it("sammelt gesetzte Werte und verwirft leere", () => {
    expect(collectSecrets(KEY, ["", "token"])).toEqual([KEY, "token"]);
    expect(collectSecrets(null)).toEqual([]);
  });
});
