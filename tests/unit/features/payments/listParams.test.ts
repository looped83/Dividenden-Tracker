import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  parseSort,
  parseStatus,
  statusNeedsArchived,
} from "@/features/payments/listParams";

describe("parseStatus", () => {
  it("liest gültige Werte", () => {
    expect(parseStatus("active")).toBe("active");
    expect(parseStatus("cancelled")).toBe("cancelled");
    expect(parseStatus("all")).toBe("all");
  });
  it("fällt bei ungültigen Werten sicher auf 'active' zurück (§4)", () => {
    expect(parseStatus(null)).toBe("active");
    expect(parseStatus("deleted")).toBe("active");
    expect(parseStatus("<script>")).toBe("active");
  });
});

describe("parseSort", () => {
  it("liest Feld und Richtung", () => {
    expect(parseSort("amount", "asc")).toEqual({ field: "amount", direction: "asc" });
  });
  it("nutzt sinnvolle Standardrichtung je Feld", () => {
    expect(parseSort("company", null)).toEqual({ field: "company", direction: "asc" });
    expect(parseSort("payment_date", null)).toEqual({
      field: "payment_date",
      direction: "desc",
    });
  });
  it("fällt bei ungültigem Feld auf den Standard zurück", () => {
    expect(parseSort("bogus", "bogus")).toEqual(DEFAULT_SORT);
  });
});

describe("statusNeedsArchived", () => {
  it("lädt stornierte nur, wenn nötig", () => {
    expect(statusNeedsArchived("active")).toBe(false);
    expect(statusNeedsArchived("cancelled")).toBe(true);
    expect(statusNeedsArchived("all")).toBe(true);
  });
});
