import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";
import { useArchiveToggle } from "@/components/domain/useArchiveToggle";

interface Options {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

function Probe({
  archivedAt,
  mutate,
}: {
  archivedAt: string | null;
  mutate: (variables: { id: string; archived: boolean }, options?: Options) => void;
}) {
  const toggle = useArchiveToggle({ mutate });
  return (
    <button
      type="button"
      onClick={() => {
        toggle({ id: "dep-1", archived_at: archivedAt }, "Depot „Comdirect“");
      }}
    >
      Umschalten
    </button>
  );
}

function renderProbe(archivedAt: string | null, outcome: "success" | Error) {
  const mutate = vi.fn(
    (_variables: { id: string; archived: boolean }, options?: Options) => {
      if (outcome === "success") options?.onSuccess?.();
      else options?.onError?.(outcome);
    },
  );
  render(
    <ToastProvider>
      <Probe archivedAt={archivedAt} mutate={mutate} />
    </ToastProvider>,
  );
  return mutate;
}

describe("useArchiveToggle", () => {
  it("archiviert und bestaetigt es", async () => {
    const mutate = renderProbe(null, "success");
    await userEvent.setup().click(screen.getByRole("button", { name: "Umschalten" }));

    expect(mutate).toHaveBeenCalledWith(
      { id: "dep-1", archived: false },
      expect.any(Object),
    );
    expect(await screen.findByText("Depot „Comdirect“ archiviert.")).toBeInTheDocument();
  });

  it("reaktiviert einen archivierten Datensatz", async () => {
    const mutate = renderProbe("2026-01-01T00:00:00Z", "success");
    await userEvent.setup().click(screen.getByRole("button", { name: "Umschalten" }));

    expect(mutate).toHaveBeenCalledWith(
      { id: "dep-1", archived: true },
      expect.any(Object),
    );
    expect(await screen.findByText("Depot „Comdirect“ reaktiviert.")).toBeInTheDocument();
  });

  it("meldet einen Fehler, statt ihn zu verschlucken", async () => {
    renderProbe(null, new Error("Keine Verbindung."));
    await userEvent.setup().click(screen.getByRole("button", { name: "Umschalten" }));

    expect(await screen.findByText("Keine Verbindung.")).toBeInTheDocument();
  });
});
