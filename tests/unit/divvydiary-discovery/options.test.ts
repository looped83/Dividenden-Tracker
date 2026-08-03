import { describe, expect, it } from "vitest";
import {
  UsageError,
  parseOptions,
} from "../../../scripts/divvydiary-discovery/options.ts";

/**
 * Aufrufpruefung (Auftrag Phase B0 §22 „fehlende Environment-Variable",
 * „ungueltiger API-Schluessel").
 *
 * Jeder dieser Faelle endet, bevor eine Anfrage hinausgeht — das ist der Punkt:
 * Ein falsch aufgerufenes Werkzeug darf einen fremden Dienst nicht erreichen.
 */

const KEY = "dd_live_0123456789abcdef";
const ENV = { DIVVYDIARY_API_KEY: KEY };

describe("parseOptions", () => {
  it("bricht ohne Schluessel ab und erklaert, wie er uebergeben wird", () => {
    expect(() => parseOptions([], {})).toThrow(UsageError);
    expect(() => parseOptions([], {})).toThrow(/DIVVYDIARY_API_KEY/);
    expect(() => parseOptions([], {})).toThrow(/npm run discover:divvydiary/);
  });

  it("behandelt einen leeren Schluessel wie einen fehlenden", () => {
    expect(() => parseOptions([], { DIVVYDIARY_API_KEY: "   " })).toThrow(UsageError);
  });

  it("liest den Schluessel ausschliesslich aus der Umgebung", () => {
    expect(parseOptions([], ENV)).toEqual({ apiKey: KEY, isin: null, outFile: null });
  });

  it("nimmt eine gueltige ISIN an und schreibt sie gross", () => {
    expect(parseOptions(["--isin", "de0007164600"], ENV).isin).toBe("DE0007164600");
  });

  it.each(["keine-isin", "DE00071646", "", "DE000716460X"])(
    "weist die unbrauchbare ISIN %s zurueck, statt sie zu senden",
    (value) => {
      expect(() => parseOptions(["--isin", value], ENV)).toThrow(/--isin/);
    },
  );

  it("weist unbekannte Optionen zurueck", () => {
    expect(() => parseOptions(["--alles-abfragen"], ENV)).toThrow(/Unbekannte Option/);
  });

  it("verlangt zu --out einen Dateinamen", () => {
    expect(() => parseOptions(["--out"], ENV)).toThrow(/Dateinamen/);
    expect(parseOptions(["--out", "/tmp/schema.md"], ENV).outFile).toBe("/tmp/schema.md");
  });

  it("nennt den Schluessel in keiner Fehlermeldung", () => {
    try {
      parseOptions(["--isin", "kaputt"], ENV);
      expect.unreachable("parseOptions haette werfen muessen");
    } catch (error) {
      expect((error as Error).message).not.toContain(KEY);
    }
  });
});
