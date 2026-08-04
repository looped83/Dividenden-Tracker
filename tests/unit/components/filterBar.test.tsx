import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FilterBar,
  FilterField,
  FilterReset,
  FilterSort,
} from "@/components/ui/filter-bar";

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

/**
 * Sortierfeld und Zuruecksetzen sind geteilte Bausteine: Dieselbe Auswahl,
 * derselbe Richtungsschalter und dieselbe Schaltflaeche in jeder Leiste. Zuvor
 * stand beides dreimal im Code — und dreimal leicht anders.
 */
describe("FilterSort", () => {
  const OPTIONS = [
    { value: "name", label: "Nach Name" },
    { value: "depot", label: "Nach Depot" },
  ];

  function renderSort(direction: "asc" | "desc" = "asc") {
    const onValueChange = vi.fn();
    const onDirectionChange = vi.fn();
    render(
      <FilterBar activeCount={1}>
        <FilterSort
          id="sort"
          value="name"
          direction={direction}
          options={OPTIONS}
          onValueChange={onValueChange}
          onDirectionChange={onDirectionChange}
        />
      </FilterBar>,
    );
    return { onValueChange, onDirectionChange };
  }

  it("benennt die Auswahl auch ohne sichtbare Beschriftung", () => {
    renderSort();
    expect(screen.getByRole("combobox", { name: "Sortierung" })).toBeInTheDocument();
  });

  it("meldet die gewaehlte Sortierung", async () => {
    const user = userEvent.setup();
    const { onValueChange } = renderSort();

    await user.selectOptions(screen.getByRole("combobox"), "depot");

    expect(onValueChange).toHaveBeenCalledWith("depot");
  });

  it("sagt an, in welche Richtung der Schalter wechselt", async () => {
    const user = userEvent.setup();
    const { onDirectionChange } = renderSort("asc");

    const schalter = screen.getByRole("button", {
      name: "Aufsteigend sortiert — zu absteigend wechseln",
    });
    await user.click(schalter);

    expect(onDirectionChange).toHaveBeenCalledWith("desc");
  });
});

describe("FilterReset", () => {
  it("setzt auf Klick zurueck", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <FilterBar activeCount={1}>
        <FilterReset onClick={onClick} />
      </FilterBar>,
    );

    await user.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
