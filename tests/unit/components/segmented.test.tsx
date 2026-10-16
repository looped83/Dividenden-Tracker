import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedControl } from "@/components/ui/segmented";

describe("SegmentedControl", () => {
  it("nennt die Gruppe, zeigt die Wahl und meldet einen Wechsel", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Darstellung"
        options={[
          { value: "a", label: "Liste" },
          { value: "b", label: "Monat" },
        ]}
        value="a"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Darstellung" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Liste" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Monat" })).not.toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Monat" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
