import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyText } from "@/components/ui/copy-text";
import { ToastProvider } from "@/components/ui/toast";

function renderCopyText() {
  return render(
    <ToastProvider>
      <CopyText label="ISIN" value="US0378331005" />
    </ToastProvider>,
  );
}

describe("CopyText", () => {
  it("legt die Kennung in die Zwischenablage und bestaetigt es", async () => {
    const user = userEvent.setup();
    renderCopyText();

    await user.click(screen.getByRole("button", { name: "ISIN US0378331005 kopieren" }));

    await expect(navigator.clipboard.readText()).resolves.toBe("US0378331005");
    expect(await screen.findByText("ISIN kopiert")).toBeInTheDocument();
  });

  it("meldet, wenn das Kopieren scheitert", async () => {
    const user = userEvent.setup();
    renderCopyText();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("verweigert"),
    );

    await user.click(screen.getByRole("button", { name: "ISIN US0378331005 kopieren" }));

    expect(
      await screen.findByText("ISIN konnte nicht kopiert werden"),
    ).toBeInTheDocument();
  });
});
