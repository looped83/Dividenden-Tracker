import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asAnon,
  asSuperuser,
  asUser,
  closePool,
  createTestUser,
  firstRow,
} from "./support/db";

/**
 * Sicherheit der Kalenderintegration (Auftrag §20 „Sicherheit", §7).
 *
 * Geprueft wird das, was RLS und Grants tatsaechlich zulassen: Der Client darf
 * ausschliesslich seine **eigenen** Termine lesen und nichts schreiben —
 * geschrieben wird allein serverseitig durch die Edge Function (service_role).
 */
let userA: string;
let userB: string;

async function seedEvent(
  userId: string,
  overrides: { uid?: string; date?: string; title?: string; state?: string } = {},
): Promise<string> {
  return asSuperuser(async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into dividend_calendar_events
         (user_id, external_uid, title, event_date, event_state)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [
        userId,
        overrides.uid ?? "pay-a",
        overrides.title ?? "Muster AG",
        overrides.date ?? "2026-08-13",
        overrides.state ?? "active",
      ],
    );
    return firstRow(result).id;
  });
}

let eventA: string;

beforeAll(async () => {
  userA = await createTestUser("calendar-user-a@example.test");
  userB = await createTestUser("calendar-user-b@example.test");
  eventA = await seedEvent(userA);

  await asSuperuser((client) =>
    client.query(
      `insert into calendar_sync_status (user_id, state, last_success_at, events_read)
       values ($1, 'success', now(), 1)`,
      [userA],
    ),
  );
});

afterAll(async () => {
  await closePool();
});

describe("Kalendertermine: nur eigene Zeilen sind sichtbar", () => {
  it("A sieht seinen eigenen Termin", async () => {
    const result = await asUser(userA, (client) =>
      client.query("select id from dividend_calendar_events"),
    );
    expect(result.rows.map((row: { id: string }) => row.id)).toContain(eventA);
  });

  it("B sieht keinen Termin von A — auch nicht ueber die id", async () => {
    const alle = await asUser(userB, (client) =>
      client.query("select id from dividend_calendar_events"),
    );
    expect(alle.rowCount).toBe(0);

    const gezielt = await asUser(userB, (client) =>
      client.query("select * from dividend_calendar_events where id = $1", [eventA]),
    );
    expect(gezielt.rowCount).toBe(0);
  });

  it("anonyme Anfragen erhalten keinen Zugriff", async () => {
    await expect(
      asAnon((client) => client.query("select id from dividend_calendar_events")),
    ).rejects.toThrow(/permission denied|keine Berechtigung/i);
  });
});

describe("Kalendertermine: der Client darf nicht schreiben", () => {
  it("INSERT ist fuer angemeldete Nutzer gesperrt", async () => {
    await expect(
      asUser(userA, (client) =>
        client.query(
          `insert into dividend_calendar_events (user_id, external_uid, title, event_date)
           values ($1, 'selbst-gebaut', 'Erfundene AG', '2026-12-01')`,
          [userA],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("UPDATE ist gesperrt", async () => {
    await expect(
      asUser(userA, (client) =>
        client.query("update dividend_calendar_events set title = 'Umbenannt'"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("DELETE ist gesperrt", async () => {
    await expect(
      asUser(userA, (client) => client.query("delete from dividend_calendar_events")),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("Eindeutigkeit verhindert Dubletten", () => {
  it("dieselbe UID derselben Quelle laesst sich kein zweites Mal anlegen", async () => {
    await expect(seedEvent(userA, { uid: "pay-a" })).rejects.toThrow(
      /dividend_calendar_events_uid_unique|duplicate key/i,
    );
  });

  it("dieselbe UID bei einem anderen Nutzer ist erlaubt", async () => {
    const idB = await seedEvent(userB, { uid: "pay-a" });
    expect(idB).toBeTruthy();
  });
});

describe("Zerlegte SUMMARY (Migration 0028)", () => {
  it("nimmt Unternehmen, Betrag, Waehrung und Depot auf", async () => {
    const id = await asSuperuser(async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into dividend_calendar_events
           (user_id, external_uid, title, company_name, expected_amount,
            expected_currency, source_portfolio, event_date)
         values ($1, 'pay-parsed', 'Verizon Communications Inc 51,37 € Zahltag (Trade Republic)',
                 'Verizon Communications Inc', 51.37, 'EUR', 'Trade Republic', '2026-08-13')
         returning id`,
        [userA],
      );
      return firstRow(result).id;
    });

    const row = await asUser(userA, (client) =>
      client.query<{ expected_amount: string; expected_currency: string }>(
        "select expected_amount, expected_currency from dividend_calendar_events where id = $1",
        [id],
      ),
    );
    // numeric(14,2): der Betrag kommt exakt zurueck, nicht als Fliesskommazahl.
    expect(firstRow(row).expected_amount).toBe("51.37");
    expect(firstRow(row).expected_currency).toBe("EUR");
  });

  it("laesst Betrag ohne Waehrung nicht zu", async () => {
    await expect(
      asSuperuser((client) =>
        client.query(
          `insert into dividend_calendar_events
             (user_id, external_uid, title, expected_amount, event_date)
           values ($1, 'pay-ohne-waehrung', 'Beispiel AG', 12.00, '2026-08-13')`,
          [userA],
        ),
      ),
    ).rejects.toThrow(/dividend_calendar_events_amount_currency/);
  });

  it("laesst Waehrung ohne Betrag nicht zu", async () => {
    await expect(
      asSuperuser((client) =>
        client.query(
          `insert into dividend_calendar_events
             (user_id, external_uid, title, expected_currency, event_date)
           values ($1, 'pay-ohne-betrag', 'Beispiel AG', 'EUR', '2026-08-13')`,
          [userA],
        ),
      ),
    ).rejects.toThrow(/dividend_calendar_events_amount_currency/);
  });

  it("weist einen negativen Betrag zurueck", async () => {
    await expect(
      asSuperuser((client) =>
        client.query(
          `insert into dividend_calendar_events
             (user_id, external_uid, title, expected_amount, expected_currency, event_date)
           values ($1, 'pay-negativ', 'Beispiel AG', -1.00, 'EUR', '2026-08-13')`,
          [userA],
        ),
      ),
    ).rejects.toThrow(/expected_amount_check|violates check constraint/);
  });
});

describe("Synchronisationsstatus", () => {
  it("ist nur fuer den eigenen Nutzer lesbar", async () => {
    const eigen = await asUser(userA, (client) =>
      client.query("select user_id from calendar_sync_status"),
    );
    expect(eigen.rowCount).toBe(1);

    const fremd = await asUser(userB, (client) =>
      client.query("select user_id from calendar_sync_status"),
    );
    expect(fremd.rowCount).toBe(0);
  });

  it("laesst sich vom Client nicht schoenschreiben", async () => {
    await expect(
      asUser(userA, (client) =>
        client.query("update calendar_sync_status set state = 'success'"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("belegt einen Lauf nur einmal gleichzeitig", async () => {
    const claim = async (): Promise<boolean> =>
      asSuperuser(async (client) => {
        const result = await client.query<{ claim_calendar_sync: boolean }>(
          "select claim_calendar_sync($1) as claim_calendar_sync",
          [userB],
        );
        return firstRow(result).claim_calendar_sync;
      });

    expect(await claim()).toBe(true);
    // Der zweite Versuch trifft auf einen laufenden Abgleich.
    expect(await claim()).toBe(false);

    // Nach Ablauf der Frist ist der Lauf wieder frei (abgestuerzte Funktion).
    await asSuperuser((client) =>
      client.query(
        "update calendar_sync_status set last_attempt_at = now() - interval '10 minutes' where user_id = $1",
        [userB],
      ),
    );
    expect(await claim()).toBe(true);
  });

  it("ist fuer angemeldete Nutzer nicht ausfuehrbar", async () => {
    await expect(
      asUser(userA, (client) => client.query("select claim_calendar_sync($1)", [userA])),
    ).rejects.toThrow(/permission denied/i);
  });
});
