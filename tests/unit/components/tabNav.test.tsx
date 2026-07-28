import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TabNav, type TabNavItem } from "@/components/layout/TabNav";

const TABS: readonly TabNavItem[] = [
  { to: "/statistiken", label: "Übersicht", end: true },
  { to: "/statistiken/jahre", label: "Jahre" },
  { to: "/statistiken/depots", label: "Depots" },
];

function renderNav(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TabNav label="Statistikbereiche" tabs={TABS} />
    </MemoryRouter>,
  );
}

describe("TabNav", () => {
  it("zeigt alle Unterbereiche — auch die, die seitlich aus dem Bild laufen", () => {
    renderNav("/statistiken");
    for (const tab of TABS) {
      expect(screen.getByRole("link", { name: tab.label })).toBeInTheDocument();
    }
  });

  it("kennzeichnet den aktiven Unterbereich", () => {
    renderNav("/statistiken/depots");
    expect(screen.getByRole("link", { name: "Depots" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // `end` am Elternpfad: „Übersicht" darf auf Unterseiten nicht mitleuchten.
    expect(screen.getByRole("link", { name: "Übersicht" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("benennt den Navigationsbereich", () => {
    renderNav("/statistiken");
    expect(
      screen.getByRole("navigation", { name: "Statistikbereiche" }),
    ).toBeInTheDocument();
  });
});
