import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Der Import fragt dieselbe Datei mehrfach an — erst die Blaetter, dann die
 * Zellen, bei jedem Blattwechsel erneut. Entpackt und gelesen wird sie dabei
 * nur einmal.
 */
const load = vi.hoisted(() => vi.fn());

vi.mock("exceljs", () => {
  const sheet = {
    name: "Dividenden",
    state: "visible",
    rowCount: 2,
    columnCount: 2,
    getRows: () => [
      { values: [undefined, "Datum", "Betrag"] },
      { values: [undefined, new Date("2026-07-29T00:00:00Z"), 12.5] },
    ],
  };
  class Workbook {
    xlsx = { load };
    worksheets = [sheet];
    getWorksheet(name: string) {
      return name === sheet.name ? sheet : undefined;
    }
  }
  return { default: { Workbook } };
});

const { analyzeWorkbook, parseFirstWorksheet, readSheet } =
  await import("@/lib/import/parseWorkbook");

beforeEach(() => {
  load.mockReset();
  load.mockResolvedValue(undefined);
});

describe("parseWorkbook", () => {
  it("laedt eine Datei fuer Analyse und Blattwechsel nur einmal", async () => {
    const buffer = new ArrayBuffer(8);

    await analyzeWorkbook(buffer);
    await readSheet(buffer, "Dividenden");
    await readSheet(buffer, "Dividenden");

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("laedt eine andere Datei neu", async () => {
    await analyzeWorkbook(new ArrayBuffer(8));
    await analyzeWorkbook(new ArrayBuffer(8));

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("liefert das erste Blatt als Kopfzeile und Datenzeilen, Datum als Kalendertag", async () => {
    const file = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as File;

    await expect(parseFirstWorksheet(file)).resolves.toEqual({
      headers: ["Datum", "Betrag"],
      rows: [["2026-07-29", 12.5]],
    });
  });
});
