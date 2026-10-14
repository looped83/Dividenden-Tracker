import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useToday } from "@/lib/hooks/useToday";

describe("useToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 31, 23, 59, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("wechselt um Mitternacht auf den neuen Tag", () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toEqual({ year: 2026, month: 10, day: 31 });

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(result.current).toEqual({ year: 2026, month: 11, day: 1 });
  });

  it("liest den Tag neu, wenn die App wieder sichtbar wird", () => {
    const { result } = renderHook(() => useToday());

    // Im Hintergrund laeuft auf dem iPhone kein Zeitgeber — nur die Uhr.
    vi.setSystemTime(new Date(2026, 10, 2, 7, 30, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toEqual({ year: 2026, month: 11, day: 2 });
  });

  it("bleibt am selben Tag dasselbe Objekt (kein unnoetiges Neuzeichnen)", () => {
    const { result } = renderHook(() => useToday());
    const first = result.current;

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(first);
  });
});
