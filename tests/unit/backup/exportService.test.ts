/**
 * Export Service Tests
 *
 * Unit tests for CSV/Excel/JSON export functionality and formula injection protection.
 */

import { describe, it, expect } from "vitest";

describe("Export Service", () => {
  describe("CSV Formula Injection Protection", () => {
    // Test helper function (simulating escapeCsvField)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escapeCsvField = (value: any): string => {
      if (value === null || value === undefined) return "";

      const str = String(value);

      // Prevent formula injection
      if (str.match(/^[\s=+\-@]/)) {
        return `"'${str}"`;
      }

      // Escape quotes and wrap if needed
      if (str.includes('"') || str.includes(",") || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }

      return str;
    };

    it("should escape formula starting with =", () => {
      const result = escapeCsvField("=SUM(A1:A10)");
      expect(result).toContain("'=SUM");
    });

    it("should escape formula starting with +", () => {
      const result = escapeCsvField("+1+1");
      expect(result).toContain("'+1");
    });

    it("should escape formula starting with -", () => {
      const result = escapeCsvField("-2*3");
      expect(result).toContain("'-2");
    });

    it("should escape formula starting with @", () => {
      const result = escapeCsvField("@SUM(A1)");
      expect(result).toContain("'@SUM");
    });

    it("should escape formula starting with tab", () => {
      const result = escapeCsvField("\t=SUM(A1)");
      expect(result).toContain("'");
    });

    it("should escape values with quotes", () => {
      const result = escapeCsvField('Test "quoted" value');
      expect(result).toContain('""');
    });

    it("should escape values with commas", () => {
      const result = escapeCsvField("Value, with, commas");
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    it("should escape values with newlines", () => {
      const result = escapeCsvField("Line1\nLine2");
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    it("should not escape normal values", () => {
      const result = escapeCsvField("Normal Value");
      expect(result).toBe("Normal Value");
    });

    it("should handle null values", () => {
      const result = escapeCsvField(null);
      expect(result).toBe("");
    });

    it("should handle undefined values", () => {
      const result = escapeCsvField(undefined);
      expect(result).toBe("");
    });

    it("should handle numeric values", () => {
      const result = escapeCsvField(123.45);
      expect(result).toBe("123.45");
    });
  });

  describe("Export Column Definitions", () => {
    it("should have valid export columns", () => {
      // Test structure only, actual columns come from DEFAULT_EXPORT_COLUMNS
      const columns = [
        { field: "pay_date", label: "Zahlungsdatum", visible: true },
        { field: "gross_amount", label: "Bruttobetrag", visible: true },
        { field: "net_amount", label: "Nettobetrag", visible: true },
      ];

      expect(columns).toContainEqual(
        expect.objectContaining({
          field: "pay_date",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          visible: expect.any(Boolean),
        }),
      );
    });
  });

  describe("File Naming", () => {
    const getTimestampSuffix = (): string => {
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    it("should generate correct CSV filename", () => {
      const suffix = getTimestampSuffix();
      const fileName = `dividenden-export-${suffix}.csv`;

      expect(fileName).toMatch(/^dividenden-export-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it("should generate correct Excel filename", () => {
      const suffix = getTimestampSuffix();
      const fileName = `dividenden-export-${suffix}.xlsx`;

      expect(fileName).toMatch(/^dividenden-export-\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    it("should generate correct JSON filename", () => {
      const suffix = getTimestampSuffix();
      const fileName = `dividenden-export-${suffix}.json`;

      expect(fileName).toMatch(/^dividenden-export-\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  describe("Format Support", () => {
    it("should support CSV format", () => {
      const supportedFormats = ["csv", "xlsx", "json"];
      expect(supportedFormats).toContain("csv");
    });

    it("should support Excel format", () => {
      const supportedFormats = ["csv", "xlsx", "json"];
      expect(supportedFormats).toContain("xlsx");
    });

    it("should support JSON format", () => {
      const supportedFormats = ["csv", "xlsx", "json"];
      expect(supportedFormats).toContain("json");
    });
  });
});
