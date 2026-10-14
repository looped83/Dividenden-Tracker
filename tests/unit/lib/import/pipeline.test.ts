import { describe, expect, it } from "vitest";
import { normalizeRows } from "@/lib/import/pipeline";
import { buildCommitPayload } from "@/lib/import/buildCommitPayload";
import type { ImportCellValue } from "@/lib/import/parseWorkbook";

const COLUMNS = { date: 0, investment: 1, amount: 2, broker: 3 };
const OPTIONS = {
  dateFormat: "iso" as const,
  numberFormat: "auto" as const,
  date1904: false,
  currency: "EUR",
  minDate: "1970-01-01",
  maxDate: "2026-12-31",
};

function normalize(amounts: ImportCellValue[]) {
  return normalizeRows(
    amounts.map((amount) => ["2025-03-14", "Allianz", amount, "Trade Republic"]),
    COLUMNS,
    OPTIONS,
  );
}

describe("normalizeRows — Beträge", () => {
  it("weist negative Beträge und 0 als fehlerhafte Zeile aus", async () => {
    const rows = await normalize(["-5,00", "(1,50)", "0,00", 0]);

    for (const row of rows) {
      expect(row.status).toBe("invalid");
      expect(row.errors.join(" ")).toMatch(/größer als 0/);
    }
  });

  it("rundet mehr als zwei Nachkommastellen kaufmännisch (R-1) und warnt", async () => {
    const [fromNumber, fromText] = await normalize([12.3456789, "1,0050"]);

    expect(fromNumber.netAmount).toBe("12.35");
    expect(fromNumber.status).toBe("valid_warning");
    expect(fromNumber.warnings.join(" ")).toMatch(/12,3456789.*12,35/);
    expect(fromText.netAmount).toBe("1.01");
  });

  it("laesst Beträge mit bis zu zwei Nachkommastellen unverändert", async () => {
    const [row] = await normalize(["12,50"]);

    expect(row.netAmount).toBe("12.50");
    expect(row.status).toBe("valid");
  });

  it("erwartet dieselben Summen, die die Datenbank aus gerundeten Zeilen bildet", async () => {
    // Je Zeile gerundet: 1,01 + 1,01 = 2,02 — ungerundet summiert waeren es
    // 2,01, und der Server haette den Import abgelehnt.
    const rows = await normalize([1.005, 1.005]);
    const payload = buildCommitPayload({
      rows,
      companyDecisions: new Map(),
      brokerDecisions: new Map(),
    });

    expect(payload.expected.total_net).toBe("2.02");
    expect(payload.rows.map((row) => row.net_amount)).toEqual(["1.01", "1.01"]);
  });
});
