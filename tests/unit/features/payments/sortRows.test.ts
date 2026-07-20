import { describe, expect, it } from "vitest";
import { sortRows, type SortableRow } from "@/features/payments/sortRows";

function row(partial: Partial<SortableRow> & { id: string }): SortableRow {
  return {
    effectiveDate: "2026-01-15",
    netAmount: "10.00",
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
    companyName: "Alpha",
    depotName: "Depot 1",
    ...partial,
  };
}

describe("sortRows (§2)", () => {
  it("sortiert Zahlungsdatum absteigend als Standard", () => {
    const rows = [
      row({ id: "a", effectiveDate: "2026-01-01" }),
      row({ id: "b", effectiveDate: "2026-03-01" }),
      row({ id: "c", effectiveDate: "2026-02-01" }),
    ];
    const sorted = sortRows(rows, { field: "payment_date", direction: "desc" });
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sortiert Zahlungsdatum aufsteigend", () => {
    const rows = [
      row({ id: "a", effectiveDate: "2026-01-01" }),
      row({ id: "b", effectiveDate: "2026-03-01" }),
    ];
    const sorted = sortRows(rows, { field: "payment_date", direction: "asc" });
    expect(sorted.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sortiert Beträge decimal-sicher", () => {
    const rows = [
      row({ id: "a", netAmount: "9.90" }),
      row({ id: "b", netAmount: "100.00" }),
      row({ id: "c", netAmount: "12.34" }),
    ];
    const desc = sortRows(rows, { field: "amount", direction: "desc" });
    expect(desc.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sortiert Unternehmen alphabetisch", () => {
    const rows = [
      row({ id: "a", companyName: "Zeta" }),
      row({ id: "b", companyName: "alpha" }),
      row({ id: "c", companyName: "Mu" }),
    ];
    const sorted = sortRows(rows, { field: "company", direction: "asc" });
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("ist stabil: Gleichstände brechen deterministisch über created_at und id auf", () => {
    const rows = [
      row({ id: "b", effectiveDate: "2026-01-01", createdAt: "2026-01-01T09:00:00Z" }),
      row({ id: "a", effectiveDate: "2026-01-01", createdAt: "2026-01-01T09:00:00Z" }),
      row({ id: "c", effectiveDate: "2026-01-01", createdAt: "2026-01-01T12:00:00Z" }),
    ];
    const first = sortRows(rows, { field: "payment_date", direction: "desc" });
    const second = sortRows([...rows].reverse(), {
      field: "payment_date",
      direction: "desc",
    });
    // c wurde zuletzt erstellt → zuerst; danach a vor b (id-Fallback).
    expect(first.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it("verändert die Eingabe nicht (reine Funktion)", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    const snapshot = rows.map((r) => r.id);
    sortRows(rows, { field: "amount", direction: "asc" });
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });
});
