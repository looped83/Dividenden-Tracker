import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SecurityFormDialog } from "@/features/securities/SecurityFormDialog";

/**
 * Ausschuettungsmonate sind Pflicht (seit 2.23.0): Ohne Monat speichert das
 * Formular nicht und nennt den Grund; die Notiz gibt es nicht mehr.
 */
const createSecurity = vi.hoisted(() => vi.fn());

vi.mock("@/features/securities/hooks", () => ({
  useCreateSecurity: () => ({ mutateAsync: createSecurity }),
  useUpdateSecurity: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({ data: [] }),
}));

function renderDialog() {
  render(<SecurityFormDialog security={null} open onOpenChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alpha AG" } });
}

describe("SecurityFormDialog", () => {
  beforeEach(() => {
    createSecurity.mockReset();
  });

  it("verlangt mindestens einen Ausschüttungsmonat", async () => {
    renderDialog();
    expect(screen.getByText("Ausschüttungsmonate")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    expect(await screen.findByText("Wähle mindestens einen Monat.")).toBeInTheDocument();
    expect(createSecurity).not.toHaveBeenCalled();

    // Ein Monat genügt, der Hinweis verschwindet sofort.
    fireEvent.click(screen.getByRole("button", { name: "Mär" }));
    expect(screen.queryByText("Wähle mindestens einen Monat.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => {
      expect(createSecurity).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alpha AG", payout_months: [3] }),
      );
    });
  });

  it("speichert die Reinvestition mit", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Jun" }));
    const toggle = screen.getByRole("switch", { name: "Dividenden reinvestieren" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => {
      expect(createSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          reinvest_since: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
        }),
      );
    });
  });
});
