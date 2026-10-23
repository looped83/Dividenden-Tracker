import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Name und Broker eines Depots sind dasselbe: Der Dialog fragt nur den Broker
 * ab und schreibt ihn in beide Felder.
 */
const create = vi.hoisted(() => vi.fn());

vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({
    data: [
      {
        id: "d1",
        name: "Trade Republic",
        broker: "Trade Republic",
        base_currency: "EUR",
        note: null,
        archived_at: null,
      },
    ],
    isLoading: false,
  }),
  useCreateDepot: () => ({ mutateAsync: create }),
  useUpdateDepot: () => ({ mutateAsync: vi.fn() }),
  useArchiveDepot: () => ({ mutateAsync: vi.fn() }),
}));

const { DepotsPage } = await import("@/features/depots/DepotsPage");

describe("DepotsPage", () => {
  it("zeigt den Broker nicht doppelt in der Liste", () => {
    render(
      <ToastProvider>
        <DepotsPage />
      </ToastProvider>,
    );
    expect(screen.getAllByText(/Trade Republic/)).toHaveLength(1);
    expect(screen.getByText("EUR")).toBeInTheDocument();
  });

  it("fragt nur den Broker ab und speichert ihn als Name und Broker", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <DepotsPage />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Neues Depot" }));

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Notiz")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Broker"), "Scalable Capital");
    await user.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Scalable Capital", broker: "Scalable Capital" }),
    );
  });
});
