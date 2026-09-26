import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PaymentComposerProvider,
  useNewPaymentTrigger,
} from "@/features/payments/PaymentComposer";

// Das echte Formular braucht Stammdaten und Abfragen; hier geht es nur um das
// Oeffnen, Nachladen und Schliessen des Overlays.
vi.mock("@/features/payments/PaymentForm", () => ({
  PaymentForm: ({ onDone }: { onDone: () => void }) => (
    <button type="button" onClick={onDone}>
      Speichern
    </button>
  ),
}));

function Trigger() {
  const trigger = useNewPaymentTrigger();
  return (
    <button type="button" {...trigger}>
      Neue Dividende
    </button>
  );
}

describe("PaymentComposer", () => {
  it("haengt den Dialog erst beim Oeffnen ein und schliesst ihn nach dem Speichern", async () => {
    const user = userEvent.setup();
    render(
      <PaymentComposerProvider>
        <Trigger />
      </PaymentComposerProvider>,
    );

    // Geschlossen: kein Dialog im DOM (und damit nichts davon im Startpaket).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Neue Dividende" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Neue Dividende");

    await user.click(await screen.findByRole("button", { name: "Speichern" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("verlangt den Anbieter", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow(/PaymentComposerProvider/);
  });
});
