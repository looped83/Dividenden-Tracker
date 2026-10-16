import { describe, expect, it, vi } from "vitest";
import { fetchAllPages, PAGE_SIZE } from "@/lib/supabase/fetchAllPages";

/** Erzeugt `count` Platzhalterzeilen. */
function rows(count: number): { id: number }[] {
  return Array.from({ length: count }, (_, index) => ({ id: index }));
}

/** Simuliert PostgREST: liefert je Aufruf hoechstens `PAGE_SIZE` Zeilen. */
function pagedSource(total: number) {
  return vi.fn((from: number, to: number) =>
    Promise.resolve({
      data: rows(total).slice(from, to + 1),
      error: null,
    }),
  );
}

describe("fetchAllPages", () => {
  it("liefert eine Teilseite in einem Aufruf", async () => {
    const source = pagedSource(3);
    await expect(fetchAllPages(source)).resolves.toHaveLength(3);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("laedt ueber die Seitengrenze hinaus vollstaendig", async () => {
    // Der Fall, an dem Sicherung und Export still Daten verloren: eine
    // Abfrage ohne Paginierung haette hier 1.000 statt 1.439 Zeilen geliefert
    // und dabei keinen Fehler gemeldet.
    const source = pagedSource(1439);
    const result = await fetchAllPages(source);
    expect(result).toHaveLength(1439);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("holt bei genau voller letzter Seite eine weitere ab", async () => {
    // Grenzfall: Bei exakt PAGE_SIZE Zeilen ist nicht erkennbar, ob es weitere
    // gibt — es muss eine zusaetzliche, leere Seite geholt werden.
    const source = pagedSource(PAGE_SIZE);
    const result = await fetchAllPages(source);
    expect(result).toHaveLength(PAGE_SIZE);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("liefert bei leerer Tabelle eine leere Liste", async () => {
    await expect(fetchAllPages(pagedSource(0))).resolves.toEqual([]);
  });

  it("wirft den Fehler weiter, statt ein Teilergebnis zu liefern", async () => {
    const source = vi.fn((from: number) =>
      Promise.resolve(
        from === 0
          ? { data: rows(PAGE_SIZE), error: null }
          : { data: null, error: { message: "Verbindung unterbrochen" } },
      ),
    );
    await expect(fetchAllPages(source)).rejects.toThrow("Verbindung unterbrochen");
  });
});
