// @vitest-environment jsdom
// Der Download laeuft ueber einen Link im echten `document`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "@/lib/utils/downloadBlob";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("gibt die Objekt-URL erst nach dem Klick frei (Safari auf iOS)", () => {
    vi.useFakeTimers();
    // jsdom kennt keine Objekt-URLs; beide Funktionen werden gestellt.
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadBlob(new Blob(["a;b"]), "export.csv");

    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:test");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
