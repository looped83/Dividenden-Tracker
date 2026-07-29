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

/**
 * Zeitstempel **so, wie PostgREST sie liefert**: mit Zeitzonenversatz statt
 * `Z` und mit Mikrosekunden. Die frueheren Fixtures schrieben hier
 * `"2025-06-15T00:00:00Z"` — eine Form, die in der Produktion nie vorkommt.
 * Dadurch bestand der Formattest, waehrend die echte Sicherungsdatei von der
 * eigenen Formatpruefung abgelehnt wurde und sich nicht wiederherstellen
 * liess. Fixtures muessen das liefern, was der Server liefert.
 */
const PG_CREATED = "2025-01-01T08:15:30.123456+00:00";
const PG_UPDATED = "2025-06-15T10:30:00.654321+00:00";
const PG_ARCHIVED = "2025-07-01T12:00:00+00:00";

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
    created_at: PG_CREATED,
    updated_at: PG_UPDATED,
    // Zwei Zeilen sind storniert. Eine Sicherung muss sie enthalten — sonst
    // ginge beim Wiederherstellen die Storno-Historie verloren.
    archived_at: index < 2 ? PG_ARCHIVED : null,
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
      last_backup_at: PG_UPDATED,
      created_at: PG_CREATED,
      updated_at: PG_UPDATED,
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
      created_at: PG_CREATED,
      updated_at: PG_UPDATED,
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
      created_at: PG_CREATED,
      updated_at: PG_UPDATED,
      archived_at: null,
    },
  ];
  tables["goals"] = [];
  // Eine Importzeile **so, wie die Pipeline sie schreibt** (buildCommitPayload,
  // checksums.ts). Zuvor war diese Tabelle in den Tests immer leer — deshalb
  // fiel nicht auf, dass das Schema `column_mapping` als Record<string,string>
  // beschrieb, obwohl dort Spaltenindizes (Zahlen) stehen. Jede Sicherung mit
  // Importhistorie wurde dadurch beim Einlesen abgelehnt.
  tables["imports"] = [
    {
      id: uuid("00000005", 1),
      user_id: USER_ID,
      file_name: "Details-Dividenden.xlsx",
      file_hash: "a".repeat(64),
      file_size_bytes: 48412,
      file_type: "xlsx",
      sheet_name: "Tabelle1",
      status: "committed",
      column_mapping: { pay_date: 0, security: 1, net_amount: 2, broker: 3 },
      detected_formats: { date: "de", decimal: "comma" },
      row_balance: {
        analyzed: 1439,
        imported: 1439,
        invalid: 0,
        excluded: 0,
        needs_dedupe: 0,
      },
      row_report: [{ row: 1, status: "imported" }],
      checksums: {
        rowCount: 1439,
        totalNet: "49391.57",
        minDate: "2012-05-15",
        maxDate: "2026-07-15",
        byYear: { "2012": { count: 2, sum: "13.80" } },
        byBroker: { Musterbank: { count: 2, sum: "13.80" } },
      },
      created_at: PG_CREATED,
      committed_at: PG_UPDATED,
      rolled_back_at: null,
    },
    // Zweiter Vorgang mit leeren Metadaten. `removeNulls` schreibt solche
    // Felder gar nicht erst in die Datei — die Schluessel **fehlen** dann.
    // Genau dieser Fall fehlte in den Fixtures und liess unbemerkt, dass
    // `z.unknown()` in Zod 4 ein Pflichtfeld ist.
    {
      id: uuid("00000005", 2),
      user_id: USER_ID,
      file_name: "Nachtrag.csv",
      file_hash: "b".repeat(64),
      file_size_bytes: 128,
      file_type: "csv",
      sheet_name: null,
      status: "committed",
      column_mapping: null,
      detected_formats: null,
      row_balance: null,
      row_report: null,
      checksums: null,
      created_at: PG_CREATED,
      committed_at: PG_UPDATED,
      rolled_back_at: null,
    },
  ];
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
    expect(counts?.["import"]).toBe(2);
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

describe("createBackup — Zeitstempel", () => {
  it("schreibt kanonische Zeitstempel mit Z, nicht die Rohform der Datenbank", async () => {
    tables["dividend_payments"] = paymentRows(3);

    const backup = (await createBackup()).backup;
    if (!backup) throw new Error("Es wurde keine Sicherung erzeugt.");

    // Alle Zeitstempel der Datei einsammeln — auch die verschachtelten.
    const stamps: string[] = [];
    JSON.stringify(backup, (key, value) => {
      if (
        typeof value === "string" &&
        key.endsWith("_at") &&
        /^\d{4}-\d{2}-\d{2}[T ]\d{2}:/.test(value)
      ) {
        stamps.push(value);
      }
      return value as unknown;
    });

    expect(stamps.length).toBeGreaterThan(5);
    for (const stamp of stamps) {
      // Der Zeitzonenversatz der Datenbank darf es nicht in die Datei
      // schaffen: Die Datei ist ein Langzeitartefakt und soll eine Form haben.
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it("erhält den Zeitpunkt beim Normalisieren", async () => {
    tables["dividend_payments"] = paymentRows(1);

    const backup = (await createBackup()).backup;
    const created = backup?.data.dividend_payments[0]?.created_at;

    // Gleiche Zeit, andere Schreibweise — nicht etwa auf Sekunden gerundet
    // oder um den Versatz verschoben.
    expect(new Date(created ?? "").getTime()).toBe(new Date(PG_CREATED).getTime());
  });
});

describe("createBackup — leere Felder", () => {
  /**
   * Jede in der Datenbank nullbare Spalte steht hier auf `null`. `removeNulls`
   * laesst solche Felder aus der Datei weg, der Schluessel **fehlt** also
   * vollstaendig.
   *
   * Diesen Fall deckte keine Fixture ab — und genau daran scheiterte das
   * Einlesen dreimal hintereinander in der Praxis. Ein einzelner Test mit
   * durchweg leeren Feldern erreicht alle diese Pfade gleichzeitig und
   * ersetzt das Suchen nach dem jeweils naechsten Feld.
   */
  it("erzeugt eine einlesbare Datei, wenn jedes optionale Feld leer ist", async () => {
    tables["profiles"] = [
      {
        id: USER_ID,
        base_currency: "EUR",
        locale: "de-DE",
        theme: "system",
        backup_reminder_days: 30,
        last_backup_at: null,
        created_at: PG_CREATED,
        updated_at: PG_UPDATED,
      },
    ];
    tables["portfolios"] = [
      {
        id: uuid("00000006", 1),
        user_id: USER_ID,
        name: "Leer",
        note: null,
        created_at: PG_CREATED,
        updated_at: PG_UPDATED,
        archived_at: null,
      },
    ];
    tables["depots"] = [
      {
        id: DEPOT_ID,
        user_id: USER_ID,
        name: "Leer",
        broker: null,
        base_currency: "EUR",
        portfolio_id: null,
        note: null,
        created_at: PG_CREATED,
        updated_at: PG_UPDATED,
        archived_at: null,
      },
    ];
    tables["securities"] = [
      {
        id: SECURITY_ID,
        user_id: USER_ID,
        name: "Leer AG",
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
        created_at: PG_CREATED,
        updated_at: PG_UPDATED,
        archived_at: null,
      },
    ];
    tables["goals"] = [
      {
        id: uuid("00000007", 1),
        user_id: USER_ID,
        goal_type: "annual",
        year: 2026,
        month: null,
        target_amount: "1000.00",
        currency: "EUR",
        title: null,
        note: null,
        created_at: PG_CREATED,
        updated_at: PG_UPDATED,
      },
    ];
    tables["imports"] = [
      {
        id: uuid("00000005", 3),
        user_id: USER_ID,
        file_name: "leer.csv",
        file_hash: "c".repeat(64),
        file_size_bytes: 1,
        file_type: "csv",
        sheet_name: null,
        status: "committed",
        column_mapping: null,
        detected_formats: null,
        row_balance: null,
        row_report: null,
        checksums: null,
        created_at: PG_CREATED,
        committed_at: null,
        rolled_back_at: null,
      },
    ];
    tables["dividend_payments"] = [
      {
        id: uuid("00000004", 1),
        user_id: USER_ID,
        security_id: SECURITY_ID,
        depot_id: DEPOT_ID,
        import_id: null,
        pay_date: "2025-06-15",
        gross_amount: "100.00",
        net_amount: "100.00",
        withholding_tax: "0.00",
        domestic_tax: "0.00",
        solidarity_surcharge: null,
        church_tax: null,
        fees: null,
        original_currency: "EUR",
        original_gross: null,
        original_net: null,
        fx_rate: null,
        quantity: null,
        amount_per_share: null,
        payment_type: "regular",
        source: "manual",
        source_file_name: null,
        source_row_number: null,
        row_fingerprint: null,
        business_fingerprint: null,
        note: null,
        created_at: PG_CREATED,
        updated_at: PG_UPDATED,
        archived_at: null,
        archive_reason: null,
      },
    ];

    const backup = (await createBackup()).backup;
    const parsed = parseBackupSafe(JSON.parse(JSON.stringify(backup)));

    if (!parsed.success) {
      throw new Error(
        `Die erzeugte Sicherung ist nicht einlesbar: ${parsed.errors
          .map((e) => `${e.path}: ${e.message}`)
          .join("; ")}`,
      );
    }
    expect(parsed.data.data.dividend_payments).toHaveLength(1);
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
