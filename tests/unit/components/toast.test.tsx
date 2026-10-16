import { describe, expect, it } from "vitest";
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";

function Probe() {
  const { notify } = useToast();
  return (
    <>
      <Button
        onClick={() => {
          notify("Dividende gespeichert.");
        }}
      >
        Speichern
      </Button>
      <Button
        onClick={() => {
          notify("Das hat nicht geklappt.", "negative");
        }}
      >
        Fehler
      </Button>
    </>
  );
}

function renderProbe() {
  return render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  it("zeigt eine Bestaetigung erst nach der Aktion", async () => {
    const user = userEvent.setup();
    renderProbe();
    expect(screen.queryByText("Dividende gespeichert.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Dividende gespeichert.")).toBeInTheDocument();
  });

  it("meldet sich hoeflich statt zu unterbrechen", () => {
    renderProbe();
    // role="status" + aria-live="polite": Screenreader lesen den Hinweis nach
    // dem laufenden Satz vor, nicht mittendrin.
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("laesst sich von Hand schliessen", async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole("button", { name: "Fehler" }));
    const message = screen.getByText("Das hat nicht geklappt.");
    expect(message).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByText("Das hat nicht geklappt.")).not.toBeInTheDocument();
  });

  it("blendet den Hinweis von selbst wieder aus", async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await waitForElementToBeRemoved(() => screen.queryByText("Dividende gespeichert."), {
      timeout: 6000,
    });
  });

  it("stapelt mehrere Hinweise", async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await user.click(screen.getByRole("button", { name: "Fehler" }));
    expect(screen.getByText("Dividende gespeichert.")).toBeInTheDocument();
    expect(screen.getByText("Das hat nicht geklappt.")).toBeInTheDocument();
  });
});
