import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";

function renderBar(activeCount?: number) {
  return render(
    <FilterBar {...(activeCount === undefined ? {} : { activeCount })}>
      <FilterField id="f-year" label="Jahr">
        <select id="f-year" defaultValue="">
          <option value="">Alle Jahre</option>
          <option value="2026">2026</option>
        </select>
      </FilterField>
    </FilterBar>,
  );
}

/**
 * Die Leiste ist auf schmalen Viewports eine aufklappbare Zeile. Die
 * Sichtbarkeit selbst haengt an Media Queries (jsdom rendert kein CSS) —
 * geprueft wird deshalb der Zustand, den Bedienung und Screenreader auswerten.
 */
describe("FilterBar", () => {
  it("startet eingeklappt, wenn kein Filter wirkt", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /Filter/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("zeigt wirkende Filter an und startet ausgeklappt", () => {
    renderBar(2);
    const toggle = screen.getByRole("button", { name: /Filter/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("2 aktiv");
  });

  it("klappt auf Bedienung um", async () => {
    const user = userEvent.setup();
    renderBar();
    const toggle = screen.getByRole("button", { name: /Filter/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("benennt jedes Feld auch ohne sichtbare Beschriftung", () => {
    renderBar();
    // Zugaenglicher Name aus dem sr-only-Label — ohne ihn waere das Feld im
    // Screenreader nur „Kombinationsfeld".
    expect(screen.getByRole("combobox", { name: "Jahr" })).toBeInTheDocument();
  });
});
