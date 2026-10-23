import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { AmountInput } from "@/components/ui/amount-input";

function Form({ onValue }: { onValue: (value: string) => void }) {
  const { register, watch } = useForm({ defaultValues: { amount: "" } });
  onValue(watch("amount"));
  return <AmountInput aria-label="Betrag" {...register("amount")} />;
}

describe("AmountInput", () => {
  it("setzt den Tausenderpunkt beim Tippen und gibt ihn an react-hook-form weiter", async () => {
    let value = "";
    render(<Form onValue={(next) => (value = next)} />);
    const field = screen.getByLabelText("Betrag");
    await userEvent.type(field, "1500.5");
    expect(field).toHaveValue("1.500,5");
    expect(value).toBe("1.500,5");
  });

  it("behaelt die Zahlentastatur", () => {
    render(<AmountInput aria-label="Betrag" />);
    expect(screen.getByLabelText("Betrag")).toHaveAttribute("inputmode", "decimal");
  });
});
