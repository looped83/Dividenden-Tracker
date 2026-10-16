import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { BottomNav } from "@/components/layout/BottomNav";
import { PaymentComposerProvider } from "@/features/payments/PaymentComposer";

vi.mock("@/features/payments/PaymentForm", () => ({
  PaymentForm: () => <p>Formular</p>,
}));

function Path() {
  return <output aria-label="Pfad">{useLocation().pathname}</output>;
}

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PaymentComposerProvider>
        <Routes>
          <Route path="*" element={<Path />} />
        </Routes>
        <BottomNav />
      </PaymentComposerProvider>
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("markiert „Mehr“ auch in den Bereichen dahinter", () => {
    // Kalender, Depot, Ziele und Einstellungen stehen hinter „Mehr"; ohne
    // Markierung war dort kein Eintrag hervorgehoben.
    for (const path of [
      "/kalender",
      "/depot/abc",
      "/ziele/bevorstehend",
      "/einstellungen",
    ]) {
      const { unmount } = renderNav(path);
      expect(screen.getByRole("link", { name: "Mehr" })).toHaveClass("text-foreground");
      expect(screen.getByRole("link", { name: "Übersicht" })).not.toHaveClass(
        "text-foreground",
      );
      unmount();
    }
  });

  it("markiert „Mehr“ nicht in den direkt erreichbaren Bereichen", () => {
    renderNav("/eingaenge");
    expect(screen.getByRole("link", { name: "Mehr" })).not.toHaveClass("text-foreground");
    expect(screen.getByRole("link", { name: "Dividenden" })).toHaveClass(
      "text-foreground",
    );
  });

  it("öffnet „Neue Dividende“ als Sheet über der aktuellen Seite", async () => {
    const user = userEvent.setup();
    renderNav("/kalender");

    await user.click(screen.getByRole("button", { name: "Neue Dividende erfassen" }));

    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Neue Dividende");
    // Kein Seitenwechsel: Darunter steht weiter der Kalender.
    expect(screen.getByRole("status", { name: "Pfad", hidden: true })).toHaveTextContent(
      "/kalender",
    );
  });
});
