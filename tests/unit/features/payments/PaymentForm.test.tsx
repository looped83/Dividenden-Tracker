import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Das Depot ergibt sich aus dem Asset; gefragt wird nur, wenn es offen ist.
 * Die Abfragen sind durch Fixtures ersetzt — geprueft wird das Formular.
 */
const depots = vi.hoisted(() => ({
  current: [] as { id: string; name: string; base_currency: string; archived_at: null }[],
}));
const create = vi.hoisted(() => vi.fn());

vi.mock("@/features/securities/hooks", () => ({
  useSecurities: () => ({
    data: [
      {
        id: "s1",
        name: "Apple Inc.",
        ticker: "AAPL",
        archived_at: null,
        default_depot_id: "d2",
      },
      {
        id: "s2",
        name: "Allianz SE",
        ticker: "ALV",
        archived_at: null,
        default_depot_id: null,
      },
    ],
  }),
}));

vi.mock("@/features/depots/hooks", () => ({
  useDepots: () => ({ data: depots.current }),
}));

vi.mock("@/features/payments/hooks", () => ({
  usePayment: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }),
  useCreatePayment: () => ({ mutateAsync: create }),
  useUpdatePayment: () => ({ mutateAsync: vi.fn() }),
}));

const { PaymentForm } = await import("@/features/payments/PaymentForm");

const depot = (id: string, name: string) => ({
  id,
  name,
  base_currency: "EUR",
  archived_at: null,
});

function renderForm() {
  return render(
    <ToastProvider>
      <PaymentForm onDone={vi.fn()} onCancel={vi.fn()} />
    </ToastProvider>,
  );
}

async function pick(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Asset" }));
  await user.click(screen.getByRole("option", { name: new RegExp(name) }));
  return user;
}

describe("PaymentForm", () => {
  afterEach(() => {
    create.mockReset();
  });

  it("bucht ins Standard-Depot des Assets, ohne danach zu fragen", async () => {
    depots.current = [depot("d1", "Depot A"), depot("d2", "Depot B")];
    renderForm();
    expect(screen.queryByLabelText("Depot")).not.toBeInTheDocument();

    const user = await pick("Apple");
    expect(screen.queryByLabelText("Depot")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Nettobetrag"), "12,50");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ security_id: "s1", depot_id: "d2", net_amount: "12.50" }),
    );
  });

  it("nimmt das einzige Depot, wenn das Asset keines vorgibt", async () => {
    depots.current = [depot("d1", "Depot A")];
    renderForm();

    const user = await pick("Allianz");
    expect(screen.queryByLabelText("Depot")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Nettobetrag"), "5");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ depot_id: "d1" }));
  });

  it("fragt nur nach, wenn das Depot offen bleibt", async () => {
    depots.current = [depot("d1", "Depot A"), depot("d2", "Depot B")];
    renderForm();

    await pick("Allianz");
    expect(screen.getByLabelText("Depot")).toHaveValue("");

    // Zurueck zu einem Asset mit Standard-Depot: Die Frage verschwindet wieder.
    await pick("Apple");
    expect(screen.queryByLabelText("Depot")).not.toBeInTheDocument();
  });

  it("schlaegt im Suchfeld weder Kontakte noch Woerter vor", () => {
    depots.current = [depot("d1", "Depot A")];
    renderForm();
    const search = screen.getByRole("combobox", { name: "Asset" });

    expect(search).toHaveAttribute("autocomplete", "off");
    expect(search).toHaveAttribute("autocorrect", "off");
    expect(search).toHaveAttribute("spellcheck", "false");
    // Safari erkennt Namensfelder auch am Platzhalter.
    expect(search.getAttribute("placeholder")).not.toMatch(/name/i);
  });
});
