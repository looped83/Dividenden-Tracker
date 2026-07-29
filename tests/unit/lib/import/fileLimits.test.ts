import { describe, expect, it } from "vitest";
import { checkImportFile, MAX_IMPORT_BYTES } from "@/lib/import/fileLimits";

describe("checkImportFile", () => {
  it("laesst die drei unterstuetzten Formate zu", () => {
    for (const name of ["Dividenden.csv", "Historie.xlsx", "Alt.xls"]) {
      expect(checkImportFile({ name, size: 1024 })).toBeNull();
    }
  });

  it("prueft die Endung unabhaengig von der Schreibweise", () => {
    expect(checkImportFile({ name: "HISTORIE.XLSX", size: 1024 })).toBeNull();
  });

  it("weist andere Dateitypen ab", () => {
    expect(checkImportFile({ name: "urlaub.mp4", size: 1024 })).toMatch(/CSV/);
  });

  it("weist zu grosse Dateien mit der Groesse in der Meldung ab", () => {
    const message = checkImportFile({ name: "gross.xlsx", size: MAX_IMPORT_BYTES + 1 });
    expect(message).toMatch(/25 MB/);
  });

  it("laesst eine Datei genau an der Grenze zu", () => {
    expect(checkImportFile({ name: "grenze.xlsx", size: MAX_IMPORT_BYTES })).toBeNull();
  });

  it("weist eine leere Datei ab, statt sie in den Parser zu geben", () => {
    expect(checkImportFile({ name: "leer.csv", size: 0 })).toMatch(/leer/);
  });
});
