import { describe, expect, it } from "vitest";
import {
  classifyBody,
  compareWithExpected,
  describeShape,
  findPositionSignals,
  parseJson,
} from "../../../scripts/divvydiary-discovery/schemas.ts";

/**
 * Strukturanalyse der Antworten (Auftrag Phase B0 §22 „ungueltiges JSON",
 * „unerwarteter Content-Type", „leere Antwort", „unerwartete Schemaaenderung").
 */

describe("classifyBody", () => {
  it("erkennt JSON am Inhalt, auch wenn der Content-Type luegt", () => {
    expect(classifyBody("text/html", '{"a":1}')).toBe("json");
    expect(classifyBody(null, "[1,2]")).toBe("json");
  });

  it("erkennt eine HTML-Fehlerseite", () => {
    expect(classifyBody("application/json", "<!DOCTYPE html><html></html>")).toBe("html");
  });

  it("erkennt die leere Antwort", () => {
    expect(classifyBody("application/json", "   ")).toBe("empty");
  });

  it("faellt sonst auf den Content-Type zurueck", () => {
    expect(classifyBody("application/json; charset=utf-8", "kein json")).toBe("json");
    expect(classifyBody("text/csv", "a;b")).toBe("other");
  });
});

describe("parseJson", () => {
  it("liest gueltiges JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("meldet ungueltiges JSON, ohne den Inhalt zu zitieren", () => {
    const result = parseJson('{"a":');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("Antwort ist kein gueltiges JSON");
      expect(result.reason).not.toContain('"a"');
    }
  });
});

describe("describeShape", () => {
  it("beschreibt verschachtelte Felder in Punktnotation", () => {
    const shape = describeShape({
      portfolios: [
        { id: 4711, name: "Trade Republic" },
        { id: 4712, name: "Comdirect" },
      ],
    });
    const paths = shape.map((field) => field.path);

    expect(paths).toContain("portfolios");
    expect(paths).toContain("portfolios[].id");
    expect(paths).toContain("portfolios[].name");
  });

  it("gibt keine Werte preis", () => {
    const rendered = JSON.stringify(describeShape({ name: "Verizon", value: 12345.67 }));
    expect(rendered).not.toContain("Verizon");
    expect(rendered).not.toContain("12345");
  });

  it("fasst uneinheitliche Typen zusammen, statt einen zu unterschlagen", () => {
    const shape = describeShape({ items: [{ wkn: "A0X8ZS" }, { wkn: null }] });
    const wkn = shape.find((field) => field.path === "items[].wkn");

    expect(wkn?.type).toContain("null");
    expect(wkn?.type).toContain("WKN-Form");
  });

  it("beschreibt auch einen einfachen Wert an der Wurzel", () => {
    expect(describeShape(42)).toEqual([{ path: "<root>", type: "number (2 VK)" }]);
  });
});

describe("compareWithExpected", () => {
  const shapeOf = (paths: readonly string[]) =>
    paths.map((path) => ({ path, type: "string (3 Zeichen)" }));

  it("meldet fehlende belegte Felder als Schemaaenderung", () => {
    const { missing } = compareWithExpected("session", shapeOf(["portfolios"]));
    expect(missing).toEqual(["portfolios[].id", "portfolios[].name"]);
  });

  it("meldet zusaetzliche Felder als moegliche Neuerung", () => {
    const { additional } = compareWithExpected(
      "session",
      shapeOf([
        "portfolios",
        "portfolios[].id",
        "portfolios[].name",
        "portfolios[].currency",
      ]),
    );
    expect(additional).toEqual(["portfolios[].currency"]);
  });

  it("bewertet unbekannte Endpunkte nicht", () => {
    expect(compareWithExpected("documentation", shapeOf(["irgendwas"]))).toEqual({
      missing: [],
      additional: [],
    });
  });
});

describe("findPositionSignals", () => {
  it("erkennt Bestandsfelder in dem, was tatsaechlich zurueckkam", () => {
    const signals = findPositionSignals([
      { path: "positions", type: "array[2]" },
      { path: "positions[].quantity", type: "number (2 VK)" },
      { path: "positions[].marketValue", type: "number (5 VK, 2 NK)" },
      { path: "positions[].name", type: "string (7 Zeichen)" },
    ]);

    expect(signals.map((signal) => signal.path)).toEqual([
      "positions",
      "positions[].quantity",
      "positions[].marketValue",
    ]);
  });

  it("meldet nichts, wenn eine Antwort keine Bestandsdaten traegt", () => {
    expect(
      findPositionSignals([
        { path: "portfolios", type: "array[1]" },
        { path: "portfolios[].id", type: "number (4 VK)" },
        { path: "portfolios[].name", type: "string (5 Zeichen)" },
      ]),
    ).toEqual([]);
  });
});
