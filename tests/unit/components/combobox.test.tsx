import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "@/components/ui/combobox";

/**
 * Suchfeld mit Vorschlagsliste.
 *
 * Der Schwerpunkt liegt darauf, **wann** die Liste aufgeht: Als erstes Feld
 * des Formulars „Neue Dividende" verdeckte sie alles darunter, sobald der
 * Fokus sie streifte — geoeffnet wird nur auf ausdrueckliche Absicht.
 */
const OPTIONS = [
  { value: "1", label: "Apple Inc.", hint: "AAPL" },
  { value: "2", label: "Allianz SE", hint: "ALV" },
];

function renderCombobox(value = "") {
  const onChange = vi.fn();
  render(
    <Combobox id="test-combobox" options={OPTIONS} value={value} onChange={onChange} />,
  );
  return { onChange, field: screen.getByRole("combobox") };
}

describe("Combobox", () => {
  it("bleibt geschlossen, wenn das Feld nur den Fokus bekommt", async () => {
    const user = userEvent.setup();
    const { field } = renderCombobox();

    await user.tab();

    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("oeffnet die Liste beim Antippen des Feldes", async () => {
    const user = userEvent.setup();
    const { field } = renderCombobox();

    await user.click(field);

    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  // iOS liest den `inputmode` nur beim Setzen des Fokus. Klappt die Liste
  // schon beim Beruehren auf (pointerdown), aendert sich der Baum mitten in
  // der Fokusvergabe und die Tastatur des vorherigen Feldes bleibt stehen —
  // aus dem Betragsfeld heraus der Zahlenblock (siehe combobox.tsx).
  it("oeffnet die Liste nicht schon beim Beruehren, sondern erst beim Klick", async () => {
    const user = userEvent.setup();
    const { field } = renderCombobox();

    await user.pointer({ keys: "[MouseLeft>]", target: field });

    expect(field).toHaveAttribute("aria-expanded", "false");

    await user.pointer({ keys: "[/MouseLeft]", target: field });

    expect(field).toHaveAttribute("aria-expanded", "true");
  });

  it("oeffnet die Liste beim Tippen und filtert", async () => {
    const user = userEvent.setup();
    const { field } = renderCombobox();

    await user.tab();
    await user.keyboard("alli");

    expect(field).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: /Allianz SE/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Apple/ })).not.toBeInTheDocument();
  });

  it("oeffnet die Liste mit Pfeil nach unten", async () => {
    const user = userEvent.setup();
    const { field } = renderCombobox();

    await user.tab();
    await user.keyboard("{ArrowDown}");

    expect(field).toHaveAttribute("aria-expanded", "true");
  });

  it("uebernimmt die Auswahl und schliesst die Liste", async () => {
    const user = userEvent.setup();
    const { field, onChange } = renderCombobox();

    await user.click(field);
    await user.click(screen.getByRole("option", { name: /Apple Inc\./ }));

    expect(onChange).toHaveBeenCalledWith("1");
    expect(field).toHaveAttribute("aria-expanded", "false");
  });

  // Am Desktop: tippen, Pfeil nach unten markiert den **ersten** Vorschlag,
  // Enter uebernimmt ihn. Frueher war die erste Zeile beim Tippen schon
  // vormarkiert, der Pfeil sprang damit auf die zweite.
  it("markiert mit Pfeil nach unten den ersten Treffer, Enter uebernimmt ihn", async () => {
    const user = userEvent.setup();
    const { field, onChange } = renderCombobox();

    await user.tab();
    await user.keyboard("a");
    expect(field).not.toHaveAttribute("aria-activedescendant");

    await user.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute("aria-activedescendant", "test-combobox-option-1");

    await user.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute("aria-activedescendant", "test-combobox-option-2");

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("2");
    expect(field).toHaveAttribute("aria-expanded", "false");
  });

  it("springt mit Pfeil nach oben ohne Markierung auf den letzten Treffer", async () => {
    const user = userEvent.setup();
    const { field } = renderCombobox();

    await user.tab();
    await user.keyboard("a{ArrowUp}");

    expect(field).toHaveAttribute("aria-activedescendant", "test-combobox-option-2");
  });

  it("uebernimmt mit Enter ohne Markierung den ersten Treffer der Suche", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.tab();
    await user.keyboard("alv{Enter}");

    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("schliesst mit Escape die Liste, ohne etwas zu uebernehmen", async () => {
    const user = userEvent.setup();
    const { field, onChange } = renderCombobox();

    await user.tab();
    await user.keyboard("a{ArrowDown}{Escape}");

    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("zeigt geschlossen die getroffene Auswahl", () => {
    const { field } = renderCombobox("2");

    expect(field).toHaveValue("Allianz SE");
  });
});
