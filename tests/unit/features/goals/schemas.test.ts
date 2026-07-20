import { describe, expect, it } from "vitest";
import { makeGoalFormSchema } from "@/features/goals/schemas";

const schema = makeGoalFormSchema(new Date("2027-06-01T00:00:00Z"));

function parse(input: Record<string, unknown>) {
  return schema.safeParse(input);
}

const base = {
  goalType: "annual" as const,
  year: "2027",
  month: "",
  targetAmount: "1.000,00",
  title: "",
  note: "",
};

describe("goalFormSchema – Zielbetrag", () => {
  it("akzeptiert einen gültigen deutschen Betrag und normalisiert ihn", () => {
    const result = parse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetAmount).toBe("1000.00");
  });

  it("lehnt Betrag <= 0 ab", () => {
    expect(parse({ ...base, targetAmount: "0" }).success).toBe(false);
    expect(parse({ ...base, targetAmount: "-5" }).success).toBe(false);
  });

  it("lehnt leeren, nicht numerischen und zu genauen Betrag ab", () => {
    expect(parse({ ...base, targetAmount: "" }).success).toBe(false);
    expect(parse({ ...base, targetAmount: "abc" }).success).toBe(false);
    expect(parse({ ...base, targetAmount: "1,234" }).success).toBe(false);
  });
});

describe("goalFormSchema – Jahr", () => {
  it("akzeptiert historische, aktuelle und begrenzt zukünftige Jahre", () => {
    expect(parse({ ...base, year: "1990" }).success).toBe(true);
    expect(parse({ ...base, year: "2037" }).success).toBe(true); // 2027 + 10
  });
  it("lehnt Jahre außerhalb der technischen Grenzen ab", () => {
    expect(parse({ ...base, year: "1989" }).success).toBe(false);
    expect(parse({ ...base, year: "2038" }).success).toBe(false);
  });
});

describe("goalFormSchema – Monat/Zielart-Konsistenz", () => {
  it("Monatsziel benötigt einen gültigen Monat", () => {
    const ok = parse({ ...base, goalType: "monthly", month: "3" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.month).toBe(3);

    expect(parse({ ...base, goalType: "monthly", month: "" }).success).toBe(false);
    expect(parse({ ...base, goalType: "monthly", month: "13" }).success).toBe(false);
    expect(parse({ ...base, goalType: "monthly", month: "0" }).success).toBe(false);
  });

  it("Jahresziel darf keinen Monat enthalten", () => {
    expect(parse({ ...base, goalType: "annual", month: "3" }).success).toBe(false);
    const ok = parse({ ...base, goalType: "annual", month: "" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.month).toBeNull();
  });
});
