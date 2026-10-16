import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Bildschirmtastatur der Textfelder.
 *
 * iOS behaelt die Tastatur des zuvor fokussierten Feldes bei, wenn das neu
 * fokussierte Feld keinen eigenen `inputmode` nennt: Aus dem Betragsfeld von
 * „Neue Dividende“ (`inputMode="decimal"`) heraus stand im Suchfeld daneben
 * weiterhin der Zahlenblock. Textfelder nennen ihren Modus deshalb
 * ausdruecklich.
 */
describe("Tastaturmodus der Textfelder", () => {
  it("nennt beim Input ausdruecklich den Textmodus", () => {
    render(<Input aria-label="Name" />);

    expect(screen.getByLabelText("Name")).toHaveAttribute("inputmode", "text");
  });

  it("nennt ihn auch beim Suchfeld", () => {
    render(<Input type="search" aria-label="Suche" />);

    expect(screen.getByLabelText("Suche")).toHaveAttribute("inputmode", "text");
  });

  it("respektiert einen ausdruecklich gesetzten Modus", () => {
    render(<Input inputMode="decimal" aria-label="Betrag" />);

    expect(screen.getByLabelText("Betrag")).toHaveAttribute("inputmode", "decimal");
  });

  it("laesst Feldarten mit eigener Tastatur unberuehrt", () => {
    render(<Input type="date" aria-label="Datum" />);

    expect(screen.getByLabelText("Datum")).not.toHaveAttribute("inputmode");
  });

  it("nennt ihn bei der Textarea", () => {
    render(<Textarea aria-label="Notiz" />);

    expect(screen.getByLabelText("Notiz")).toHaveAttribute("inputmode", "text");
  });

  it("nennt ihn im Suchfeld der Combobox", () => {
    render(<Combobox id="test-combobox" options={[]} value="" onChange={vi.fn()} />);

    expect(screen.getByRole("combobox")).toHaveAttribute("inputmode", "text");
  });
});
