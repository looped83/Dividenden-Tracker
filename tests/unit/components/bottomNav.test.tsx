import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { BottomNav } from "@/components/layout/BottomNav";

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
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
      expect(screen.getByRole("link", { name: "Mehr" })).toHaveClass("text-primary");
      expect(screen.getByRole("link", { name: "Übersicht" })).not.toHaveClass(
        "text-primary",
      );
      unmount();
    }
  });

  it("markiert „Mehr“ nicht in den direkt erreichbaren Bereichen", () => {
    renderNav("/eingaenge");
    expect(screen.getByRole("link", { name: "Mehr" })).not.toHaveClass("text-primary");
    expect(screen.getByRole("link", { name: "Dividenden" })).toHaveClass("text-primary");
  });
});
