import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatTable, type StatColumn } from "@/features/statistics/components/StatTable";

interface Row {
  id: string;
  name: string;
  amount: number;
}

const columns: StatColumn<Row>[] = [
  {
    key: "name",
    header: "Name",
    headerLabel: "Name",
    compare: (a, b) => a.name.localeCompare(b.name),
    render: (row) => row.name,
  },
  {
    key: "amount",
    header: "Betrag",
    headerLabel: "Betrag",
    align: "right",
    compare: (a, b) => a.amount - b.amount,
    render: (row) => String(row.amount),
  },
];

const rows: Row[] = [
  { id: "1", name: "Alpha", amount: 30 },
  { id: "2", name: "Beta", amount: 10 },
  { id: "3", name: "Gamma", amount: 20 },
];

function bodyNames(): string[] {
  const table = screen.getByRole("table");
  const body = table.querySelectorAll("tbody tr");
  return [...body].map(
    (tr) => within(tr as HTMLElement).getAllByRole("cell")[0]?.textContent ?? "",
  );
}

describe("StatTable", () => {
  it("rendert alle Zeilen in Ausgangsreihenfolge", () => {
    render(
      <StatTable rows={rows} columns={columns} getRowKey={(r) => r.id} caption="Test" />,
    );
    expect(bodyNames()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("sortiert bei Klick auf einen Spaltenkopf (erst absteigend, dann aufsteigend)", async () => {
    const user = userEvent.setup();
    render(
      <StatTable rows={rows} columns={columns} getRowKey={(r) => r.id} caption="Test" />,
    );
    const amountHeader = screen.getByRole("button", { name: /Betrag sortieren/i });

    await user.click(amountHeader); // desc
    expect(bodyNames()).toEqual(["Alpha", "Gamma", "Beta"]); // 30,20,10

    await user.click(amountHeader); // asc
    expect(bodyNames()).toEqual(["Beta", "Gamma", "Alpha"]); // 10,20,30
  });

  it("respektiert initialSort", () => {
    render(
      <StatTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.id}
        caption="Test"
        initialSort={{ key: "amount", direction: "asc" }}
      />,
    );
    expect(bodyNames()).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("filtert über die Suche", async () => {
    const user = userEvent.setup();
    render(
      <StatTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.id}
        caption="Test"
        searchOf={(r) => r.name}
        searchPlaceholder="Suchen"
      />,
    );
    await user.type(screen.getByLabelText("Suchen"), "bet");
    expect(bodyNames()).toEqual(["Beta"]);
  });

  it("paginiert lange Listen", async () => {
    const user = userEvent.setup();
    const many: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      name: `Row ${String(i)}`,
      amount: i,
    }));
    render(
      <StatTable
        rows={many}
        columns={columns}
        getRowKey={(r) => r.id}
        caption="Test"
        pageSize={2}
      />,
    );
    expect(bodyNames()).toEqual(["Row 0", "Row 1"]);
    await user.click(screen.getByRole("button", { name: "Weiter" }));
    expect(bodyNames()).toEqual(["Row 2", "Row 3"]);
  });

  it("löst onRowClick per Tastatur aus (Drill-down)", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <StatTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.id}
        caption="Test"
        onRowClick={onRowClick}
        rowLabel={(r) => `Zeile ${r.name}`}
      />,
    );
    const firstRow = screen.getByRole("button", { name: "Zeile Alpha" });
    firstRow.focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});
