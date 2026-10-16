import { describe, expect, it } from "vitest";
import {
  applyHistoryGrain,
  parseHistoryGrain,
} from "@/features/statistics/historyParams";

describe("parseHistoryGrain", () => {
  it("liest die Ebene des Verlaufs aus der Adresse, Vorgabe sind die Jahre", () => {
    expect(parseHistoryGrain(new URLSearchParams(""))).toBe("jahre");
    expect(parseHistoryGrain(new URLSearchParams("nach=monate"))).toBe("monate");
    expect(parseHistoryGrain(new URLSearchParams("nach=unbekannt"))).toBe("jahre");
  });

  it("schreibt nur die Abweichung von der Vorgabe in die Adresse", () => {
    const params = new URLSearchParams("year=2025");
    expect(applyHistoryGrain(params, "monate").toString()).toBe("year=2025&nach=monate");
    expect(
      applyHistoryGrain(new URLSearchParams("nach=monate"), "jahre").toString(),
    ).toBe("");
  });
});
