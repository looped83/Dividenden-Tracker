import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Erzeugt eine vollstaendige Sicherung gegen einen nachgebildeten Supabase-
 * Client und prueft das Ergebnis.
 *
 * Bisher pruefte kein Test die tatsaechlich erzeugte Sicherungsdatei — weder
 * ihre Vollstaendigkeit noch den Integritaetsblock. Genau dort lagen die
 * Fehler: eine bei 1.000 Zeilen gekappte Abfrage und ein Integritaetsblock,
 * der die gekappte Menge als korrekt bestaetigte.
 */

/** Erzeugt eine gueltige UUID aus einer laufenden Nummer. */
function uuid(prefix: string, index: number): string {
  const tail = String(index).padStart(12, "0");
  return `${prefix}-0000-4000-8000-${tail}`;
}

const USER_ID = uuid("00000001", 1);
const DEPOT_ID = uuid("00000002", 1);
const SECURITY_ID = uuid("00000003", 1);

/** Baut `count` Zahlungszeilen mit fortlaufender ID und Datum. */
function paymentRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: uuid("00000004", index),
    user_id: USER_ID,
    security_id: SECURITY_ID,
    depot_id: DEPOT_ID,
    import_id: null,
    pay_date: "2025-06-15",
    gross_amount: "100.00",
    net_amount: "85.00",
    withholding_tax: "15.00",
    domestic_tax: "0.00",
    solidarity_surcharge: "0.00",
    church_tax: "0.00",
    fees: "0.00",
    original_currency: "EUR",
    original_gross: null,
    original_net: null,
    fx_rate: null,
    quantity: null,
    amount_per_share: null,
    payment_type: "regular",
    source: "excel_import",
    source_file_name: null,
    source_row_number: index + 1,
    row_fingerprint: null,
    business_fingerprint: `fp-${String(index)}`,
    note: null,
    created_at: "2025-06-15T00:00:00Z",
    updated_at: "2025-06-15T00:00:00Z",
    // Zwei Zeilen sind storniert. Eine Sicherung muss sie enthalten — sonst
    // ginge beim Wiederherstellen die Storno-Historie verloren.
    archived_at: index < 2 ? "2025-07-01T00:00:00Z" : null,
    archive_reason: index < 2 ? "Testfall" : null,
  }));
}

/** Zeilenbestand der nachgebildeten Datenbank. */
const tables: Record<string, unknown[]> = {};

/** Erlaubt es, die gemeldete Zeilenzahl von den gelieferten Zeilen abweichen zu lassen. */
const countOverride: Record<string, number> = {};

/**
 * Minimaler Supabase-Ersatz: beherrscht `select`, `order`, `range`, `eq`,
 * `single` und `count: "exact", head: true` — genau so viel, wie der
 * Sicherungsdienst nutzt. Die Zeilenzahl je Antwort ist wie bei PostgREST auf
 * 1.000 begrenzt, damit eine fehlende Paginierung im Test denselben Effekt
 * hat wie in der Produktion.
 */
const POSTGREST_MAX_ROWS = 1000;

function makeQuery(table: string, options?: { count?: string; head?: boolean }) {
  let from = 0;
  let to = POSTGREST_MAX_ROWS - 1;
  let filterId: string | null = null;

  const query = {
    order: () => query,
    eq: (_column: string, value: string) => {
      filterId = value;
      return query;
    },
    range: (start: number, end: number) => {
      from = start;
      to = end;
      return query;
    },
    single: () => {
      const rows = tables[table] ?? [];
      const row = filterId
        ? rows.find((r) => (r as { id: string }).id === filterId)
        : rows[0];
      return Promise.resolve({
        data: row ?? null,
        error: row ? null : { message: "not found" },
      });
    },
    then: (resolve: (value: unknown) => unknown) => {
      const rows = tables[table] ?? [];
      if (options?.head) {
        return Promise.resolve({
          data: null,
          count: Number.isFinite(countOverride[table] ?? Number.NaN)
            ? countOverride[table]
            : rows.length,
          error: null,
        }).then(resolve);
      }
      const span = Math.min(to - from + 1, POSTGREST_MAX_ROWS);
      return Promise.resolve({
        data: rows.slice(from, from + span),
        count: options?.count === "exact" ? rows.length : null,
        error: null,
      }).then(resolve);
    },
  };
  return query;
}

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }),
    },
    from: (table: string) => ({
      select: (_columns: string, options?: { count?: string; head?: boolean }) =>
        makeQuery(table, options),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

const { createBackup } = await import("@/lib/backup/backupService");
const { parseBackupSafe, validateBackupIntegrity } =
  await import("@/lib/backup/backupFormat");

beforeEach(() => {
  Object.keys(countOverride).forEach((key) => {
    countOverride[key] = Number.NaN;
  });
  tables["profiles"] = [
    {
      id: USER_ID,
      base_currency: "EUR",
      locale: "de-DE",
      theme: "system",
      backup_reminder_days: 30,
      last_backup_at: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ];
  tables["portfolios"] = [];
  tables["depots"] = [
    {
      id: DEPOT_ID,
      user_id: USER_ID,
      name: "Testdepot",
      broker: null,
      base_currency: "EUR",
      portfolio_id: null,
      note: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      archived_at: null,
    },
  ];
  tables["securities"] = [
    {
      id: SECURITY_ID,
      user_id: USER_ID,
      name: "Muster AG",
      ticker: null,
      isin: null,
      wkn: null,
      country: null,
      sector: null,
      currency: null,
      note: null,
      data_quality: "ok",
      default_depot_id: null,
      payout_months: [],
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      archived_at: null,
    },
  ];
  tables["goals"] = [];
  tables["imports"] = [];
});

describe("createBackup — Vollstaendigkeit", () => {
  it("sichert eine Historie jenseits der 1.000-Zeilen-Grenze vollstaendig", async () => {
    // Der reale Fall: 1.441 Zahlungen. Ohne Paginierung enthielte die Datei
    // 1.000 — und der Integritaetsblock bestaetigte diese Zahl als korrekt.
    tables["dividend_payments"] = paymentRows(1441);

    const result = await createBackup();

    expect(result.success).toBe(true);
    expect(result.backup?.data.dividend_payments).toHaveLength(1441);
  });

  it("enthaelt stornierte Zahlungen", async () => {
    tables["dividend_payments"] = paymentRows(10);

    const result = await createBackup();
    const archived = result.backup?.data.dividend_payments.filter((p) => p.archived_at);

    expect(archived).toHaveLength(2);
  });
});

describe("createBackup — Integritaetsblock", () => {
  it("nennt die Zeilenzahl je Entitaet als Zahl", async () => {
    tables["dividend_payments"] = paymentRows(1441);

    const counts = (await createBackup()).backup?.integrity.record_counts;

    expect(counts).toBeDefined();
    expect(counts?.["dividend_payment"]).toBe(1441);
    expect(counts?.["security"]).toBe(1);
    expect(counts?.["depot"]).toBe(1);
    expect(counts?.["portfolio"]).toBe(0);
    expect(counts?.["goal"]).toBe(0);
    expect(counts?.["import"]).toBe(0);
  });

  it("summiert nur die aktiven Zahlungen in den Gesamtbetraegen", async () => {
    tables["dividend_payments"] = paymentRows(10);

    const totals = (await createBackup()).backup?.integrity.totals;

    // 8 aktive à 85,00 € (zwei der zehn sind storniert).
    expect(totals?.net_sum).toBe("680.00");
    expect(totals?.gross_sum).toBe("800.00");
  });

  it("stimmt mit den tatsaechlichen Daten ueberein", async () => {
    tables["dividend_payments"] = paymentRows(1441);

    const backup = (await createBackup()).backup;
    if (!backup) throw new Error("Es wurde keine Sicherung erzeugt.");
    const check = validateBackupIntegrity(backup);

    expect(check.mismatches).toEqual([]);
    expect(check.valid).toBe(true);
  });
});

describe("createBackup — Formatgueltigkeit", () => {
  it("erzeugt eine Datei, die die eigene Formatpruefung besteht", async () => {
    tables["dividend_payments"] = paymentRows(5);

    const backup = (await createBackup()).backup;
    // Ueber JSON, wie beim spaeteren Einlesen — so faellt auf, wenn ein Feld
    // die Serialisierung nicht uebersteht.
    const parsed = parseBackupSafe(JSON.parse(JSON.stringify(backup)));

    if (!parsed.success) {
      throw new Error(
        `Die erzeugte Sicherung ist nicht einlesbar: ${parsed.errors
          .map((e) => `${e.path}: ${e.message}`)
          .join("; ")}`,
      );
    }
    expect(parsed.data.data.dividend_payments).toHaveLength(5);
  });
});

describe("createBackup — Fehlerfaelle", () => {
  it("liefert keine Sicherung, wenn weniger geladen wurde als vorhanden ist", async () => {
    tables["dividend_payments"] = paymentRows(10);
    // Die Zaehlung meldet mehr Zeilen, als die Abfrage liefert — genau das
    // Bild, das eine stille Kappung erzeugt.
    countOverride["dividend_payments"] = 20;

    const result = await createBackup();

    expect(result.success).toBe(false);
    expect(result.errorDetails).toMatch(/von 20 Dividendeneingänge/);
  });
});
