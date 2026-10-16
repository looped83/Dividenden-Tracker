import { describe, expect, it } from "vitest";
import { mapGoal, type GoalRow } from "@/lib/supabase/repositories/goalMapping";

function row(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: "g1",
    user_id: "u1",
    goal_type: "annual",
    year: 2027,
    month: null,
    target_amount: "12000.00",
    currency: "EUR",
    title: null,
    note: null,
    created_at: "2027-01-01T00:00:00Z",
    updated_at: "2027-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapGoal – decimal-sichere Betragsnormalisierung", () => {
  it("parst target_amount als kanonischen String", () => {
    expect(mapGoal(row()).targetAmount.toStringValue()).toBe("12000.00");
  });

  it("verarbeitet target_amount auch als JSON-Zahl (PostgREST-numeric)", () => {
    // supabase-js liefert numeric je nach Cast als Zahl statt String; das darf
    // Money.fromString/parseCanonicalDecimal (ruft .trim()) nicht zum Absturz
    // bringen ("e.trim is not a function").
    const goal = mapGoal(row({ target_amount: 1000 as unknown as string }));
    expect(goal.targetAmount.toStringValue()).toBe("1000.00");
  });

  it("verarbeitet Nachkommastellen aus einer JSON-Zahl", () => {
    const goal = mapGoal(row({ target_amount: 1234.5 as unknown as string }));
    expect(goal.targetAmount.toStringValue()).toBe("1234.50");
  });
});
