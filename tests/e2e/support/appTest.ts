import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { asSuperuser, asUser } from "./db";
import { mintAccessToken } from "./jwt";
import { APP_ORIGIN, SUPABASE_URL } from "./ports";

/**
 * Testrahmen der angemeldeten Browsertests (TEST_STRATEGY.md, Phase A).
 *
 * Jeder Test bekommt ein **eigenes Konto** mit eigenem Depot und Unternehmen.
 * Dadurch trennt die echte RLS die Tests voneinander: Sie können parallel
 * laufen, ohne sich Daten zu überschreiben, und ein Test sieht ausschließlich,
 * was er selbst angelegt hat.
 *
 * Die Anmeldung wird nicht durch das Formular geklickt, sondern als fertige
 * Sitzung im `localStorage` hinterlegt — genau wie supabase-js sie ablegt. Der
 * Anmeldeweg selbst hat einen eigenen Test (`anmeldung.spec.ts`), alle übrigen
 * starten dort, wo ihr Ablauf beginnt.
 */
export interface Konto {
  userId: string;
  email: string;
  depotId: string;
  depotName: string;
  securityId: string;
  securityName: string;
  /** Ids der über `seed.payments` vorab angelegten Eingänge, in derselben Reihenfolge. */
  paymentIds: string[];
}

/** Schlüssel, unter dem supabase-js die Sitzung ablegt (`sb-<host>-auth-token`). */
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0] ?? "127"}-auth-token`;

export interface SeedOptions {
  /** Zusätzliche Zahlungen, die vor dem Test angelegt werden. */
  payments?: { payDate: string; netAmount: string }[];
  /** Ausschüttungsmonate des angelegten Unternehmens (§10). */
  payoutMonths?: number[];
  /**
   * Angekündigte Termine des Dividendenkalenders. Sie entstehen sonst
   * ausschließlich serverseitig (Edge Function, service_role) — im Test legt
   * sie deshalb der Superuser an, nicht der angemeldete Nutzer.
   */
  calendarEvents?: {
    date: string;
    title: string;
    description?: string;
    /** Unternehmensname, wie ihn die Synchronisation aus der SUMMARY loest. */
    company?: string;
    /** Erwarteter Betrag laut Quelle, kanonischer Dezimalstring. */
    amount?: string;
    currency?: string;
    portfolio?: string;
  }[];
}

async function createAccount(options: SeedOptions = {}): Promise<Konto> {
  const email = `e2e-${randomUUID()}@example.test`;
  const userId = await asSuperuser(async (client) => {
    const result = await client.query<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      [email],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Testkonto konnte nicht angelegt werden.");
    return row.id;
  });

  const depotName = "Testdepot";
  const securityName = "Muster AG";

  const { depotId, securityId, paymentIds } = await asUser(userId, async (client) => {
    const depot = await client.query<{ id: string }>(
      "insert into depots (name) values ($1) returning id",
      [depotName],
    );
    const security = await client.query<{ id: string }>(
      "insert into securities (name, ticker, payout_months) values ($1, $2, $3) returning id",
      [securityName, "MSTR", options.payoutMonths ?? []],
    );
    const depotRow = depot.rows[0];
    const securityRow = security.rows[0];
    if (!depotRow || !securityRow)
      throw new Error("Stammdaten konnten nicht angelegt werden.");

    const paymentIds: string[] = [];
    for (const payment of options.payments ?? []) {
      const inserted = await client.query<{ id: string }>(
        `insert into dividend_payments
           (security_id, depot_id, pay_date, gross_amount, net_amount,
            withholding_tax, domestic_tax, original_currency, payment_type, source)
         values ($1, $2, $3, $4, $4, 0, 0, 'EUR', 'regular', 'manual')
         returning id`,
        [securityRow.id, depotRow.id, payment.payDate, payment.netAmount],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Zahlung konnte nicht angelegt werden.");
      paymentIds.push(row.id);
    }
    return { depotId: depotRow.id, securityId: securityRow.id, paymentIds };
  });

  await seedCalendarEvents(userId, options.calendarEvents ?? []);

  return { userId, email, depotId, depotName, securityId, securityName, paymentIds };
}

/**
 * Legt angekündigte Kalendertermine an. Der angemeldete Nutzer darf in
 * `dividend_calendar_events` nicht schreiben (Migration 0027) — im Betrieb tut
 * das allein die Edge Function mit service_role. Der Test bildet genau das ab
 * und schreibt als Superuser.
 */
async function seedCalendarEvents(
  userId: string,
  events: NonNullable<SeedOptions["calendarEvents"]>,
): Promise<void> {
  if (events.length === 0) return;
  await asSuperuser(async (client) => {
    for (const [index, event] of events.entries()) {
      await client.query(
        `insert into dividend_calendar_events
           (user_id, external_uid, title, company_name, expected_amount,
            expected_currency, source_portfolio, description, event_date)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          `e2e-${String(index)}-${event.date}`,
          event.title,
          // Die Synchronisation loest diese Felder aus der SUMMARY; der Test
          // legt sie direkt an, statt den Parser hier ein zweites Mal zu fahren.
          event.company ?? event.title,
          event.amount ?? null,
          event.amount ? (event.currency ?? "EUR") : null,
          event.portfolio ?? null,
          event.description ?? null,
          event.date,
        ],
      );
    }
    await client.query(
      `insert into calendar_sync_status (user_id, state, last_attempt_at, last_success_at, events_read, events_created)
       values ($1, 'success', now(), now(), $2, $2)
       on conflict (user_id, source) do update
         set state = 'success', last_success_at = now()`,
      [userId, events.length],
    );
  });
}

function storageStateFor(konto: Konto) {
  const { token, expiresAt } = mintAccessToken(konto.userId, konto.email);
  const session = {
    access_token: token,
    token_type: "bearer",
    expires_in: expiresAt - Math.floor(Date.now() / 1000),
    expires_at: expiresAt,
    refresh_token: `refresh-${konto.userId}`,
    user: {
      id: konto.userId,
      aud: "authenticated",
      role: "authenticated",
      email: konto.email,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
  return {
    cookies: [],
    origins: [
      {
        origin: APP_ORIGIN,
        localStorage: [{ name: STORAGE_KEY, value: JSON.stringify(session) }],
      },
    ],
  };
}

export const test = base.extend<{ seed: SeedOptions; konto: Konto }>({
  // Über `test.use({ seed: … })` können einzelne Tests ihren Startbestand
  // bestimmen, ohne dass jeder Test denselben Aufbau wiederholt.
  seed: [{}, { option: true }],

  konto: async ({ seed }, use) => {
    const konto = await createAccount(seed);
    await use(konto);
  },

  // Die Sitzung des jeweiligen Kontos liegt beim Laden der Seite bereits im
  // Speicher — supabase-js findet sie und die App startet angemeldet.
  storageState: async ({ konto }, use) => {
    await use(storageStateFor(konto));
  },
});

export { expect };
