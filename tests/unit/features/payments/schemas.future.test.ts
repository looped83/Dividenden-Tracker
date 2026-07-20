import { describe, expect, it } from "vitest";
import {
  checkPositiveMoney,
  paymentFormSchema,
  todayIso,
} from "@/features/payments/schemas";

const base = {
  securityId: "00000000-0000-0000-0000-000000000001",
  depotId: "00000000-0000-0000-0000-000000000002",
  netAmount: "10,00",
};

describe("payment date validation (§8)", () => {
  it("akzeptiert das heutige Datum", () => {
    const result = paymentFormSchema.safeParse({ ...base, payDate: todayIso() });
    expect(result.success).toBe(true);
  });

  it("lehnt ein zukünftiges Zahlungsdatum ab", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const result = paymentFormSchema.safeParse({ ...base, payDate: todayIso(future) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Zukunft"))).toBe(true);
    }
  });

  it("lehnt ein Datum vor 1970 ab", () => {
    const result = paymentFormSchema.safeParse({ ...base, payDate: "1969-12-31" });
    expect(result.success).toBe(false);
  });
});

describe("checkPositiveMoney (§8, decimal-sicher)", () => {
  it("akzeptiert einen gültigen positiven Betrag", () => {
    expect(checkPositiveMoney("73.63")).toEqual({ ok: true });
  });

  it.each(["0", "0.00"])("lehnt null ab (%s)", (value) => {
    expect(checkPositiveMoney(value)).toEqual({ ok: false, reason: "not_positive" });
  });

  it("lehnt negative Beträge ab", () => {
    expect(checkPositiveMoney("-5")).toEqual({ ok: false, reason: "not_positive" });
  });

  it("lehnt mehr als zwei Nachkommastellen ab", () => {
    expect(checkPositiveMoney("1.234")).toEqual({
      ok: false,
      reason: "too_many_decimals",
    });
  });

  it.each(["abc", "", "NaN", "Infinity", "1e5"])(
    "lehnt nicht-numerische Eingaben ab (%s)",
    (value) => {
      expect(checkPositiveMoney(value).ok).toBe(false);
    },
  );

  it("lehnt Beträge außerhalb der technischen Grenzen ab", () => {
    expect(checkPositiveMoney("1000000000000")).toEqual({
      ok: false,
      reason: "out_of_range",
    });
  });
});

describe("paymentFormSchema Notiz", () => {
  it("akzeptiert eine Notiz", () => {
    const result = paymentFormSchema.safeParse({
      ...base,
      payDate: todayIso(),
      note: "Quartalsdividende",
    });
    expect(result.success).toBe(true);
  });

  it("lehnt eine zu lange Notiz ab", () => {
    const result = paymentFormSchema.safeParse({
      ...base,
      payDate: todayIso(),
      note: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});
