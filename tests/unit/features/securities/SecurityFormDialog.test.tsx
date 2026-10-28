import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SecurityFormDialog } from "@/features/securities/SecurityFormDialog";

/**
 * Ausschuettungsmonate sind Pflicht (seit 2.23.0): Ohne Monat speichert das
 * Formular nicht und nennt den Grund.
 */
const createSecurity = vi.hoisted(() => vi.fn());
const saveCaps = vi.hoisted(() => vi.fn());
const savePlans = vi.hoisted(() => vi.fn());

vi.mock("@/features/securities/hooks", () => ({
  useCreateSecurity: () => ({ mutateAsync: createSecurity }),
  useUpdateSecurity: () => ({ mutateAsync: vi.fn() }),
  useSecuritySnapshots: () => ({ data: [] }),
}));

// Seit 2.44.0 gehoeren Zielgewichtung und Sparplan zum Formular.
vi.mock("@/features/planner/positionCaps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/planner/positionCaps")>()),
  usePositionCaps: () => ({ data: new Map() }),
  useSavePositionCap: () => ({ mutateAsync: saveCaps }),
}));
vi.mock("@/features/planner/savingsPlanHooks", () => ({
  useSavingsPlans: () => ({ data: [] }),
  useSaveSavingsPlans: () => ({ mutateAsync: savePlans }),
  newSavingsPlanId: () => "plan1",
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
    createSecurity.mockResolvedValue({ id: "new-id" });
    saveCaps.mockReset();
    savePlans.mockReset();
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

  it("speichert Zielgewichtung und Sparplan zum neuen Asset", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Jun" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Zielgewichtung" }), {
      target: { value: "2,5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sparplan" }));
    fireEvent.change(screen.getByLabelText("Rate (€)"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    await waitFor(() => {
      expect(savePlans).toHaveBeenCalled();
    });
    expect(saveCaps).toHaveBeenCalledWith({ caps: new Map([["new-id", 2.5]]) });
    const [saved] = savePlans.mock.calls[0] as [
      { securityId: string; interval: string }[],
    ];
    expect(saved).toEqual([
      expect.objectContaining({ securityId: "new-id", interval: "monthly" }),
    ]);
  });

  it("speichert nichts, solange der Sparplan keine Rate hat", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Jun" }));
    fireEvent.click(screen.getByRole("button", { name: "Sparplan" }));
    fireEvent.click(screen.getByRole("button", { name: "Anlegen" }));
    expect(await screen.findByText("Sparplan: Gib eine Rate ein.")).toBeInTheDocument();
    expect(createSecurity).not.toHaveBeenCalled();
  });
});
