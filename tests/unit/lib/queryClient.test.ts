import { describe, expect, it } from "vitest";
import { shouldRetry } from "@/lib/queryClient";

describe("shouldRetry", () => {
  it("wiederholt einen fehlgeschlagenen Abruf genau einmal", () => {
    const error = new Error("Netzwerkfehler");
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it('wiederholt „nicht gefunden" nicht', () => {
    expect(shouldRetry(0, { code: "PGRST116", message: "0 rows" })).toBe(false);
  });
});
