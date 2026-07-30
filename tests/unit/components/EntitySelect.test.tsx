import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { EntitySelect } from "@/components/domain/EntitySelect";

/**
 * Gemeinsames Auswahlfeld fuer Unternehmen und Depots.
 *
 * Es ersetzt drei handgebaute Varianten, die sich unterschieden, ohne dass der
 * Unterschied jemandem genutzt haette. Die Tests halten genau das fest, worin
 * sie sich unterschieden: Gruppierung, Sortierung und die Behandlung
 * archivierter Eintraege.
 */

const OPTIONS = [
  { id: "c", name: "Zeta AG", archived: false },
  { id: "a", name: "Älpha SE", archived: false },
  { id: "b", name: "Beta NV", archived: true },
];

function renderSelect(options = OPTIONS, onChange = vi.fn()) {
  render(
    <EntitySelect
      id="test-select"
      options={options}
      value=""
      onChange={onChange}
      allLabel="Alle Unternehmen"
    />,
  );
  return { onChange, select: screen.getByRole("combobox") };
}

describe("EntitySelect", () => {
  it("beginnt mit der neutralen Auswahl", () => {
    const { select } = renderSelect();
    expect(within(select).getAllByRole("option")[0]).toHaveTextContent(
      "Alle Unternehmen",
    );
  });

  it("trennt aktive und archivierte Eintraege in Gruppen", () => {
    renderSelect();
    // `optgroup` traegt die Rolle „group"; die Beschriftung ist ihr Name.
    expect(screen.getByRole("group", { name: "Aktiv" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Archiviert" })).toBeInTheDocument();
  });

  it("haengt nichts an den Namen an", () => {
    // Die frühere Statistikfassung schrieb „ (archiviert)" hinter den Namen.
    renderSelect();
    expect(screen.getByRole("option", { name: "Beta NV" })).toBeInTheDocument();
  });

  it("sortiert nach deutschem Alphabet, Umlaute eingeschlossen", () => {
    renderSelect();
    const aktiv = screen.getByRole("group", { name: "Aktiv" });
    const namen = within(aktiv)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(namen).toEqual(["Älpha SE", "Zeta AG"]);
  });

  it("laesst eine leere Gruppe ganz weg", () => {
    // Eine Ueberschrift „Archiviert" ohne Eintraege waere nur Rauschen.
    renderSelect([{ id: "a", name: "Alpha AG", archived: false }]);
    expect(screen.queryByRole("group", { name: "Archiviert" })).not.toBeInTheDocument();
  });

  it("meldet die gewaehlte Kennung", () => {
    const { onChange, select } = renderSelect();
    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("meldet die Aufhebung als leeren Wert", () => {
    const { onChange, select } = renderSelect();
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });
});
