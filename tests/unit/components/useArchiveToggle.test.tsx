import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";
import { useArchiveToggle } from "@/components/domain/useArchiveToggle";

type MutateAsync = (variables: { id: string; archived: boolean }) => Promise<unknown>;

function Probe({ mutateAsync }: { mutateAsync: MutateAsync }) {
  const toggle = useArchiveToggle({ mutateAsync });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          toggle({ id: "dep-1", archived_at: null }, 'Depot „Comdirect"');
        }}
      >
        Comdirect
      </button>
      <button
        type="button"
        onClick={() => {
          toggle(
            { id: "dep-2", archived_at: "2026-01-01T00:00:00Z" },
            'Depot „Scalable"',
          );
        }}
      >
        Scalable
      </button>
    </>
  );
}

function renderProbe(mutateAsync: MutateAsync) {
  render(
    <ToastProvider>
      <Probe mutateAsync={mutateAsync} />
    </ToastProvider>,
  );
}

describe("useArchiveToggle", () => {
  it("archiviert bzw. reaktiviert und bestaetigt es", async () => {
    const mutateAsync = vi.fn(() => Promise.resolve());
    renderProbe(mutateAsync);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Comdirect" }));
    await user.click(screen.getByRole("button", { name: "Scalable" }));

    expect(mutateAsync).toHaveBeenCalledWith({ id: "dep-1", archived: false });
    expect(mutateAsync).toHaveBeenCalledWith({ id: "dep-2", archived: true });
    expect(await screen.findByText('Depot „Comdirect" archiviert.')).toBeInTheDocument();
    expect(await screen.findByText('Depot „Scalable" reaktiviert.')).toBeInTheDocument();
  });

  it("meldet jeden Fehler — auch bei zwei Aufrufen kurz nacheinander", async () => {
    // Beide Aufrufe laufen noch, wenn der zweite startet. Rueckrufe an
    // `mutate` haetten nur den zweiten gemeldet.
    const mutateAsync = vi.fn(({ id }: { id: string }) =>
      Promise.reject(new Error(`Keine Verbindung (${id}).`)),
    );
    renderProbe(mutateAsync);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Comdirect" }));
    await user.click(screen.getByRole("button", { name: "Scalable" }));

    expect(await screen.findByText("Keine Verbindung (dep-1).")).toBeInTheDocument();
    expect(await screen.findByText("Keine Verbindung (dep-2).")).toBeInTheDocument();
  });
});
