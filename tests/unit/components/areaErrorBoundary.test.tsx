import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AreaErrorBoundary } from "@/components/ErrorBoundary";

function Broken(): never {
  throw new Error("kaputt");
}

describe("AreaErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("zeigt den Fehler im Bereich und gibt ihn beim Pfadwechsel wieder frei", () => {
    // React meldet den abgefangenen Fehler zusaetzlich auf der Konsole.
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { rerender } = render(
      <AreaErrorBoundary resetKey="/depot">
        <Broken />
      </AreaErrorBoundary>,
    );
    expect(
      screen.getByText("Dieser Bereich konnte nicht angezeigt werden"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neu laden" })).toBeInTheDocument();

    rerender(
      <AreaErrorBoundary resetKey="/statistiken">
        <p>Statistik</p>
      </AreaErrorBoundary>,
    );
    expect(screen.getByText("Statistik")).toBeInTheDocument();
  });

  it("bleibt beim selben Pfad im Fehlerzustand", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { rerender } = render(
      <AreaErrorBoundary resetKey="/depot">
        <Broken />
      </AreaErrorBoundary>,
    );
    rerender(
      <AreaErrorBoundary resetKey="/depot">
        <p>Inhalt</p>
      </AreaErrorBoundary>,
    );
    expect(screen.queryByText("Inhalt")).not.toBeInTheDocument();
  });
});
