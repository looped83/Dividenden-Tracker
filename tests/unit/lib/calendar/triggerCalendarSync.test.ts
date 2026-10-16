import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aufruf der Edge Function aus dem Client.
 *
 * Kern der Pruefung: Dem Nutzer wird **nur** eine Meldung der eigenen Funktion
 * gezeigt. Auf demselben Weg antworten auch das Supabase-Gateway und mögliche
 * Zwischenstationen — deren englische Techniktexte dürfen nicht durchschlagen
 * (Auftrag §12).
 */
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

const { triggerCalendarSync, CalendarSyncError } =
  await import("@/lib/supabase/repositories/calendarEvents");

const GENERISCH =
  "Der Dividendenkalender konnte gerade nicht aktualisiert werden. Die zuletzt gespeicherten Termine werden weiterhin angezeigt.";

/** Bildet nach, was supabase-js bei einem Fehlerstatus liefert. */
function fehler(status: number, body: unknown) {
  return {
    data: null,
    error: Object.assign(new Error("FunctionsHttpError"), {
      context: new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    }),
  };
}

beforeEach(() => {
  invoke.mockReset();
});

describe("triggerCalendarSync", () => {
  it("liefert die Zähler eines erfolgreichen Laufs", async () => {
    invoke.mockResolvedValue({
      data: {
        status: "success",
        eventsRead: 12,
        created: 3,
        updated: 1,
        removed: 0,
        skipped: 2,
      },
      error: null,
    });

    await expect(triggerCalendarSync()).resolves.toEqual({
      eventsRead: 12,
      created: 3,
      updated: 1,
      removed: 0,
      skipped: 2,
    });
  });

  it("zeigt die Meldung der eigenen Funktion unverändert", async () => {
    const meldung = "Die Kalenderquelle hat nicht rechtzeitig geantwortet.";
    invoke.mockResolvedValue(fehler(502, { status: "error", message: meldung }));

    await expect(triggerCalendarSync()).rejects.toThrow(meldung);
  });

  it("erkennt einen bereits laufenden Abgleich", async () => {
    invoke.mockResolvedValue(
      fehler(409, { status: "running", message: "Die Aktualisierung läuft bereits." }),
    );

    const error = await triggerCalendarSync().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CalendarSyncError);
    expect((error as InstanceType<typeof CalendarSyncError>).alreadyRunning).toBe(true);
  });

  it("nennt die fehlende Einrichtung, wenn die Funktion nicht ausgerollt ist", async () => {
    // Antwort des Supabase-Gateways, nicht der Funktion.
    invoke.mockResolvedValue(
      fehler(404, { code: 404, message: "Requested function was not found" }),
    );

    await expect(triggerCalendarSync()).rejects.toThrow(
      "Die Kalender-Synchronisation ist im Supabase-Projekt noch nicht eingerichtet.",
    );
  });

  it("reicht fremde Techniktexte nicht an den Nutzer durch", async () => {
    for (const body of [
      { code: 500, message: "Internal Server Error at 10.0.0.1:5432" },
      { message: "Requested function was not found" },
      { error: "invalid_grant" },
      "<html>502 Bad Gateway</html>",
    ]) {
      invoke.mockResolvedValue(fehler(500, body));

      const error = await triggerCalendarSync().catch((caught: unknown) => caught);
      expect((error as Error).message).toBe(GENERISCH);
    }
  });

  it("meldet auch eine unbrauchbare Antwort ohne Fehlerobjekt verständlich", async () => {
    invoke.mockResolvedValue({ data: null, error: null });

    await expect(triggerCalendarSync()).rejects.toThrow(GENERISCH);
  });
});
