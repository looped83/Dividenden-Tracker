import { describe, expect, it } from "vitest";
import { parseIcalCalendar } from "../../../supabase/functions/_shared/ical.ts";
import {
  planSync,
  runCalendarSync,
  toWrite,
  type CalendarEventStore,
  type CalendarEventWrite,
  type StoredCalendarEvent,
} from "../../../supabase/functions/_shared/sync.ts";

/**
 * Abgleichslogik (Auftrag §20 „doppelte Synchronisation ohne Dubletten",
 * „aus dem Feed entferntes zukuenftiges Event", „aktualisiertes Event").
 */

const HEUTE = "2026-08-03";

function feed(...events: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
}

function vevent(options: {
  uid: string;
  date: string;
  summary?: string;
  status?: string;
}): string {
  const zeilen = [
    "BEGIN:VEVENT",
    `UID:${options.uid}`,
    `DTSTART;VALUE=DATE:${options.date.replaceAll("-", "")}`,
  ];
  if (options.summary) zeilen.push(`SUMMARY:${options.summary}`);
  if (options.status) zeilen.push(`STATUS:${options.status}`);
  zeilen.push("END:VEVENT");
  return zeilen.join("\r\n");
}

function parse(text: string) {
  return parseIcalCalendar(text);
}

/** Ein Speicher im Arbeitsspeicher — dieselbe Schnittstelle wie die Datenbank. */
function fakeStore(initial: StoredCalendarEvent[] = []) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  let nextId = initial.length + 1;

  const store: CalendarEventStore = {
    loadEvents: () => Promise.resolve([...rows.values()].map((row) => ({ ...row }))),
    insertEvents: (neue: CalendarEventWrite[]) => {
      for (const row of neue) {
        const id = `row-${String(nextId++)}`;
        rows.set(id, { ...row, id });
      }
      return Promise.resolve();
    },
    updateEvents: (geaendert: StoredCalendarEvent[]) => {
      for (const row of geaendert) rows.set(row.id, { ...row });
      return Promise.resolve();
    },
    markRemoved: (ids: string[]) => {
      for (const id of ids) {
        const row = rows.get(id);
        if (row) rows.set(id, { ...row, event_state: "removed_from_source" });
      }
      return Promise.resolve();
    },
  };

  return { store, rows };
}

function gespeichert(
  id: string,
  event: CalendarEventWrite,
  overrides: Partial<StoredCalendarEvent> = {},
): StoredCalendarEvent {
  return { ...event, id, ...overrides };
}

describe("planSync", () => {
  const zukunft = parse(
    feed(vevent({ uid: "a", date: "2026-08-13", summary: "Apple Inc." })),
  ).events;

  it("legt unbekannte Ereignisse an", () => {
    const plan = planSync(zukunft, [], HEUTE);

    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0].external_uid).toBe("a");
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toRemove).toHaveLength(0);
  });

  it("schreibt nichts, wenn sich nichts geaendert hat (idempotent)", () => {
    const bestand = [gespeichert("row-1", toWrite(zukunft[0]))];

    const plan = planSync(zukunft, bestand, HEUTE);

    expect(plan.toInsert).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toRemove).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("erkennt ein veraendertes Ereignis derselben UID", () => {
    const bestand = [gespeichert("row-1", toWrite(zukunft[0]))];
    const verschoben = parse(
      feed(vevent({ uid: "a", date: "2026-08-20", summary: "Apple Inc." })),
    ).events;

    const plan = planSync(verschoben, bestand, HEUTE);

    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].id).toBe("row-1");
    expect(plan.toUpdate[0].event_date).toBe("2026-08-20");
    expect(plan.toInsert).toHaveLength(0);
  });

  it("erkennt eine geaenderte Beschreibung und Sequenznummer", () => {
    const bestand = [gespeichert("row-1", toWrite(zukunft[0]))];
    const geaendert = parse(
      feed(
        [
          "BEGIN:VEVENT",
          "UID:a",
          "DTSTART;VALUE=DATE:20260813",
          "SUMMARY:Apple Inc.",
          "DESCRIPTION:Neu",
          "SEQUENCE:2",
          "END:VEVENT",
        ].join("\r\n"),
      ),
    ).events;

    const plan = planSync(geaendert, bestand, HEUTE);

    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].description).toBe("Neu");
    expect(plan.toUpdate[0].sequence_number).toBe(2);
  });

  it("markiert entfallene zukuenftige Ereignisse statt sie zu loeschen", () => {
    const bestand = [
      gespeichert("row-1", toWrite(zukunft[0])),
      gespeichert(
        "row-2",
        toWrite(
          parse(feed(vevent({ uid: "b", date: "2026-09-01", summary: "Weg" }))).events[0],
        ),
      ),
    ];

    const plan = planSync(zukunft, bestand, HEUTE);

    expect(plan.toRemove).toEqual(["row-2"]);
  });

  it("laesst vergangene Ereignisse unberuehrt", () => {
    const vergangen = parse(
      feed(vevent({ uid: "alt", date: "2026-05-01", summary: "Frueher" })),
    ).events;
    const bestand = [gespeichert("row-9", toWrite(vergangen[0]))];

    const plan = planSync(zukunft, bestand, HEUTE);

    expect(plan.toRemove).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it("aktiviert ein zuvor entfallenes Ereignis wieder", () => {
    const bestand = [
      gespeichert("row-1", toWrite(zukunft[0]), {
        event_state: "removed_from_source",
      }),
    ];

    const plan = planSync(zukunft, bestand, HEUTE);

    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].event_state).toBe("active");
  });

  it("uebernimmt eine Absage der Quelle", () => {
    const bestand = [gespeichert("row-1", toWrite(zukunft[0]))];
    const abgesagt = parse(
      feed(
        vevent({
          uid: "a",
          date: "2026-08-13",
          summary: "Apple Inc.",
          status: "CANCELLED",
        }),
      ),
    ).events;

    const plan = planSync(abgesagt, bestand, HEUTE);

    expect(plan.toUpdate[0].event_state).toBe("cancelled");
  });

  it("ignoriert eine abweichende Schluesselordnung in raw_data", () => {
    const write = toWrite(zukunft[0]);
    // jsonb bewahrt die Reihenfolge der Schluessel nicht; der Abgleich darf
    // daraus keine Aenderung ableiten.
    const gedreht = Object.fromEntries(Object.entries(write.raw_data).reverse());
    const bestand = [gespeichert("row-1", { ...write, raw_data: gedreht })];

    const plan = planSync(zukunft, bestand, HEUTE);

    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });
});

describe("runCalendarSync", () => {
  it("legt beim ersten Lauf an und beim zweiten nichts mehr (keine Dubletten)", async () => {
    const { store, rows } = fakeStore();
    const geparst = parse(
      feed(
        vevent({ uid: "a", date: "2026-08-13", summary: "Apple Inc." }),
        vevent({ uid: "b", date: "2026-09-01", summary: "Allianz SE" }),
      ),
    );

    const erster = await runCalendarSync({ ...geparst, store, today: HEUTE });
    expect(erster).toMatchObject({ eventsRead: 2, created: 2, updated: 0, removed: 0 });
    expect(rows.size).toBe(2);

    const zweiter = await runCalendarSync({ ...geparst, store, today: HEUTE });
    expect(zweiter).toMatchObject({ created: 0, updated: 0, removed: 0 });
    expect(rows.size).toBe(2);
  });

  it("markiert ein entfallenes zukuenftiges Ereignis, ohne Daten zu verlieren", async () => {
    const { store, rows } = fakeStore();
    const voll = parse(
      feed(
        vevent({ uid: "a", date: "2026-08-13", summary: "Apple Inc." }),
        vevent({ uid: "b", date: "2026-09-01", summary: "Allianz SE" }),
      ),
    );
    await runCalendarSync({ ...voll, store, today: HEUTE });

    const reduziert = parse(
      feed(vevent({ uid: "a", date: "2026-08-13", summary: "Apple Inc." })),
    );
    const ergebnis = await runCalendarSync({ ...reduziert, store, today: HEUTE });

    expect(ergebnis.removed).toBe(1);
    expect(rows.size).toBe(2);
    const entfallen = [...rows.values()].find((row) => row.external_uid === "b");
    expect(entfallen?.event_state).toBe("removed_from_source");
  });

  it("zaehlt uebersprungene Ereignisse mit", async () => {
    const { store } = fakeStore();
    const geparst = parse(
      feed(
        vevent({ uid: "a", date: "2026-08-13", summary: "Apple Inc." }),
        ["BEGIN:VEVENT", "SUMMARY:Ohne UID", "END:VEVENT"].join("\r\n"),
      ),
    );

    const ergebnis = await runCalendarSync({ ...geparst, store, today: HEUTE });

    expect(ergebnis).toMatchObject({ eventsRead: 1, created: 1, skipped: 1 });
  });
});
