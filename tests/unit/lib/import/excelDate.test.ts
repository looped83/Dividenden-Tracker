import { describe, expect, it } from "vitest";
import { excelSerialToIso, ExcelDateError } from "@/lib/import/excelDate";

describe("excelSerialToIso — 1900-System", () => {
  it("wandelt reale Serienwerte korrekt um", () => {
    // 2012-11-15 (fruehestes Datum der realen Datei)
    expect(excelSerialToIso(41228).iso).toBe("2012-11-15");
    // 2026-07-17 (spaetestes Datum der realen Datei)
    expect(excelSerialToIso(46220).iso).toBe("2026-07-17");
  });

  it("beruecksichtigt den 1900-Schaltjahr-Bug (Serie 60 = 29.02.1900 existiert)", () => {
    // Serie 61 = 1900-03-01 dank Epoche 1899-12-30
    expect(excelSerialToIso(61).iso).toBe("1900-03-01");
  });

  it("erkennt einen Zeitanteil", () => {
    const result = excelSerialToIso(41228.5);
    expect(result.iso).toBe("2012-11-15");
    expect(result.hasTimeComponent).toBe(true);
  });

  it("lehnt Serien vor dem gueltigen Bereich ab", () => {
    expect(() => excelSerialToIso(0)).toThrow(ExcelDateError);
  });
});

describe("excelSerialToIso — 1904-System", () => {
  it("nutzt die 1904-Epoche", () => {
    // 1904-System: Serie 0 = 1904-01-01
    expect(excelSerialToIso(0, true).iso).toBe("1904-01-01");
    // Dasselbe Kalenderdatum hat im 1904-System eine um 1462 kleinere Serie
    expect(excelSerialToIso(41228 - 1462, true).iso).toBe("2012-11-15");
  });
});
