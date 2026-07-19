import { describe, expect, it } from "vitest";
import { parseDateValue, detectDateFormat } from "@/lib/import/parseDate";

describe("parseDateValue", () => {
  it("liest echte Date-Objekte als reines Datum (UTC)", () => {
    const d = new Date(Date.UTC(2025, 8, 30));
    const out = parseDateValue(d, "iso");
    expect(out.ok && out.value.iso).toBe("2025-09-30");
  });

  it("parst deutsche Datumsformate", () => {
    const out = parseDateValue("15.11.2012", "de");
    expect(out.ok && out.value.iso).toBe("2012-11-15");
  });

  it("parst zweistellige Jahre im deutschen Format", () => {
    expect(
      (parseDateValue("15.11.12", "de") as { value: { iso: string } }).value.iso,
    ).toBe("2012-11-15");
  });

  it("parst ISO-Daten", () => {
    expect(
      (parseDateValue("2026-07-17", "iso") as { value: { iso: string } }).value.iso,
    ).toBe("2026-07-17");
  });

  it("unterscheidet TT/MM und MM/TT nach Format", () => {
    expect(
      (parseDateValue("04/03/2024", "dmy_slash") as { value: { iso: string } }).value.iso,
    ).toBe("2024-03-04");
    expect(
      (parseDateValue("04/03/2024", "mdy_slash") as { value: { iso: string } }).value.iso,
    ).toBe("2024-04-03");
  });

  it("weist ungueltige Daten ab, statt sie stillschweigend zu korrigieren", () => {
    const out = parseDateValue("31.02.2024", "de");
    expect(out.ok).toBe(false);
  });

  it("interpretiert eine nackte Zahl nie als Unix-Datum", () => {
    const out = parseDateValue(1700000000, "iso");
    expect(out.ok).toBe(false);
  });

  it("liest Excel-Serienwerte im excel_serial-Format", () => {
    expect(
      (parseDateValue(41228, "excel_serial") as { value: { iso: string } }).value.iso,
    ).toBe("2012-11-15");
  });
});

describe("detectDateFormat", () => {
  it("erkennt reine Date-Objekte", () => {
    expect(detectDateFormat([new Date(), new Date()]).format).toBe("iso");
  });

  it("erkennt deutsches Format", () => {
    expect(detectDateFormat(["01.01.2020", "15.11.2012"]).format).toBe("de");
  });

  it("meldet Mehrdeutigkeit bei nicht unterscheidbaren Slash-Daten", () => {
    const result = detectDateFormat(["03/04/2024", "05/06/2024"]);
    expect(result.ambiguous).toBe(true);
    expect(result.format).toBeNull();
  });

  it("erkennt TT/MM eindeutig, wenn ein Tag > 12 vorkommt", () => {
    expect(detectDateFormat(["13/04/2024", "05/06/2024"]).format).toBe("dmy_slash");
  });
});
