import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
  PaymentComposerProvider,
  PaymentComposerRoute,
  usePaymentComposer,
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
  const trigger = usePaymentComposer();
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

  it.each([
    ["/eingaenge/neu", "Neue Dividende", "/eingaenge"],
    ["/eingaenge/p1/bearbeiten", "Dividende bearbeiten", "/eingaenge/p1"],
  ])(
    "öffnet die alte Adresse %s als Overlay über der passenden Seite",
    async (path, title, target) => {
      function Path() {
        return <output aria-label="Pfad">{useLocation().pathname}</output>;
      }
      render(
        <MemoryRouter initialEntries={[path]}>
          <PaymentComposerProvider>
            <Routes>
              <Route path="/eingaenge/neu" element={<PaymentComposerRoute />} />
              <Route
                path="/eingaenge/:id/bearbeiten"
                element={<PaymentComposerRoute />}
              />
              <Route path="*" element={<Path />} />
            </Routes>
          </PaymentComposerProvider>
        </MemoryRouter>,
      );

      expect(await screen.findByRole("dialog")).toHaveAccessibleName(title);
      expect(
        screen.getByRole("status", { name: "Pfad", hidden: true }),
      ).toHaveTextContent(target);
    },
  );
});
