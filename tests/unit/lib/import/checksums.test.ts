import { describe, expect, it } from "vitest";
import { computeChecksums } from "@/lib/import/checksums";

describe("computeChecksums", () => {
  it("summiert decimal-sicher (keine Float-Abweichung)", () => {
    const result = computeChecksums([
      { payDate: "2025-09-30", netAmount: "4.76", broker: "Trade Republic" },
      { payDate: "2025-09-30", netAmount: "7.84", broker: "Trade Republic" },
      { payDate: "2012-11-15", netAmount: "6.90", broker: "Consorsbank" },
    ]);
    expect(result.rowCount).toBe(3);
    expect(result.totalNet).toBe("19.50");
    expect(result.minDate).toBe("2012-11-15");
    expect(result.maxDate).toBe("2025-09-30");
    expect(result.byYear["2025"]).toEqual({ count: 2, sum: "12.60" });
    expect(result.byBroker["Trade Republic"]).toEqual({ count: 2, sum: "12.60" });
  });

  it("summiert 0,1 + 0,2 exakt zu 0,30 (Float-Falle)", () => {
    const result = computeChecksums([
      { payDate: "2025-01-01", netAmount: "0.1", broker: "X" },
      { payDate: "2025-01-01", netAmount: "0.2", broker: "X" },
    ]);
    expect(result.totalNet).toBe("0.30");
  });
});
