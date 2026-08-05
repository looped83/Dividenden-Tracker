/**
 * Backup Format Tests
 *
 * Unit tests for backup format schema validation and version checking.
 */

import { describe, it, expect } from "vitest";
import {
  parseBackupSafe,
  validateBackupVersion,
  validateBackupCompleteness,
  validateBackupIntegrity,
  toIsoTimestamp,
  type BackupRoot,
} from "@/lib/backup/backupFormat";

describe("Backup Format Validation", () => {
  describe("parseBackupSafe", () => {
    it("should parse valid backup", () => {
      const validBackup = {
        format: "dividend-tracker-backup",
        format_version: 1,
        schema_version: "0022",
        exported_at: "2026-07-27T12:00:00Z",
        base_currency: "EUR",
        data: {
          profile: {
            id: "550e8400-e29b-41d4-a716-446655440000",
            base_currency: "EUR",
            locale: "de-DE",
            theme: "light" as const,
            backup_reminder_days: 30,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-07-27T12:00:00Z",
          },
          depots: [],
          securities: [],
          dividend_payments: [],
          portfolios: [],
          goals: [],
          imports: [],
        },
        integrity: {
          record_counts: {
            depot: 0,
            security: 0,
            dividend_payment: 0,
            goal: 0,
          },
        },
      };

      const result = parseBackupSafe(validBackup);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe("dividend-tracker-backup");
        expect(result.data.format_version).toBe(1);
      }
    });

    it("should reject invalid JSON format", () => {
      const result = parseBackupSafe({ invalid: "structure" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("should reject missing required fields", () => {
      const result = parseBackupSafe({
        format: "dividend-tracker-backup",
        // missing format_version
        schema_version: "0022",
        exported_at: "2026-07-27T12:00:00Z",
        base_currency: "EUR",
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe("validateBackupVersion", () => {
    it("should accept correct format version", () => {
      const result = validateBackupVersion(2);
      expect(result.valid).toBe(true);
    });

    it("nimmt eine Sicherung der Version 1 weiterhin an", () => {
      // Version 2 ergaenzt die Depotstaende. Eine aeltere Datei enthaelt sie
      // nicht — das ist kein Fehler, sondern der Stand, den sie beschreibt.
      // Sie abzuweisen, weil das Format gewachsen ist, waere genau der
      // Moment, in dem eine Datensicherung nichts mehr wert ist.
      const result = validateBackupVersion(1);
      expect(result.valid).toBe(true);
    });

    it("should reject newer format version", () => {
      const result = validateBackupVersion(3);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("newer");
    });

    it("should reject older format version", () => {
      const result = validateBackupVersion(0);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("not supported");
    });
  });

  describe("validateBackupCompleteness", () => {
    const minimalBackup: BackupRoot = {
      format: "dividend-tracker-backup",
      format_version: 1,
      schema_version: "0022",
      exported_at: "2026-07-27T12:00:00Z",
      base_currency: "EUR",
      data: {
        profile: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          base_currency: "EUR",
          locale: "de-DE",
          theme: "light",
          backup_reminder_days: 30,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-07-27T12:00:00Z",
        },
        depots: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            user_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Test Depot",
            base_currency: "EUR",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-07-27T12:00:00Z",
          },
        ],
        securities: [
          {
            id: "550e8400-e29b-41d4-a716-446655440002",
            user_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Test Company",
            data_quality: "ok",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-07-27T12:00:00Z",
          },
        ],
        dividend_payments: [],
        portfolios: [],
        goals: [],
        imports: [],
        security_aliases: [],
        security_snapshot_runs: [],
        security_snapshots: [],
      },
      integrity: {
        record_counts: {
          depot: 1,
          security: 1,
          dividend_payment: 0,
          goal: 0,
        },
      },
    };

    it("should validate complete backup", () => {
      const result = validateBackupCompleteness(minimalBackup);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("should not require profile in backup data", () => {
      const backup = {
        ...minimalBackup,
        data: { ...minimalBackup.data },
      };
      const result = validateBackupCompleteness(backup);
      // Profile is optional - only depots and securities are required
      expect(result.missing).not.toContain("profile");
    });

    it("should detect missing depots", () => {
      const backup = { ...minimalBackup, data: { ...minimalBackup.data, depots: [] } };
      const result = validateBackupCompleteness(backup);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("depots");
    });

    it("should detect missing securities", () => {
      const backup = {
        ...minimalBackup,
        data: { ...minimalBackup.data, securities: [] },
      };
      const result = validateBackupCompleteness(backup);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("securities");
    });
  });

  describe("validateBackupIntegrity", () => {
    const backupWithCounts: BackupRoot = {
      format: "dividend-tracker-backup",
      format_version: 1,
      schema_version: "0022",
      exported_at: "2026-07-27T12:00:00Z",
      base_currency: "EUR",
      data: {
        depots: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            user_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Depot 1",
            base_currency: "EUR",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-07-27T12:00:00Z",
          },
        ],
        securities: [
          {
            id: "550e8400-e29b-41d4-a716-446655440002",
            user_id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Security 1",
            data_quality: "ok",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-07-27T12:00:00Z",
          },
        ],
        dividend_payments: [],
        portfolios: [],
        goals: [],
        imports: [],
        security_aliases: [],
        security_snapshot_runs: [],
        security_snapshots: [],
      },
      integrity: {
        record_counts: {
          depot: 1,
          security: 1,
          dividend_payment: 0,
          goal: 0,
          portfolio: 0,
          import: 0,
        },
      },
    };

    it("should validate matching record counts", () => {
      const result = validateBackupIntegrity(backupWithCounts);
      expect(result.valid).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it("should detect count mismatch", () => {
      const backup = {
        ...backupWithCounts,
        integrity: {
          record_counts: {
            depot: 2, // Should be 1
            security: 1,
            dividend_payment: 0,
            goal: 0,
            portfolio: 0,
            import: 0,
          },
        },
      };
      const result = validateBackupIntegrity(backup);
      expect(result.valid).toBe(false);
      expect(result.mismatches).toContainEqual(
        expect.objectContaining({
          entity: "depot",
          expected: 2,
          actual: 1,
        }),
      );
    });
  });

  describe("Decimal string validation", () => {
    it("should accept valid decimal strings in payments", () => {
      const backup = {
        format: "dividend-tracker-backup",
        format_version: 1,
        schema_version: "0022",
        exported_at: "2026-07-27T12:00:00Z",
        base_currency: "EUR",
        data: {
          dividend_payments: [
            {
              id: "550e8400-e29b-41d4-a716-446655440003",
              user_id: "550e8400-e29b-41d4-a716-446655440000",
              security_id: "550e8400-e29b-41d4-a716-446655440002",
              depot_id: "550e8400-e29b-41d4-a716-446655440001",
              pay_date: "2026-07-27",
              gross_amount: "123.45",
              net_amount: "100.00",
              withholding_tax: "23.45",
              domestic_tax: "0.00",
              solidarity_surcharge: "0.00",
              church_tax: "0.00",
              fees: "0.00",
              original_currency: "EUR",
              payment_type: "regular",
              source: "manual",
              created_at: "2026-07-27T12:00:00Z",
              updated_at: "2026-07-27T12:00:00Z",
            },
          ],
          depots: [],
          securities: [],
          portfolios: [],
          goals: [],
          imports: [],
        },
        integrity: {
          record_counts: {
            dividend_payment: 1,
            depot: 0,
            security: 0,
            portfolio: 0,
            goal: 0,
            import: 0,
          },
        },
      };

      const result = parseBackupSafe(backup);
      expect(result.success).toBe(true);
    });

    it("should reject invalid decimal strings", () => {
      const backup = {
        format: "dividend-tracker-backup",
        format_version: 1,
        schema_version: "0022",
        exported_at: "2026-07-27T12:00:00Z",
        base_currency: "EUR",
        data: {
          dividend_payments: [
            {
              id: "550e8400-e29b-41d4-a716-446655440003",
              user_id: "550e8400-e29b-41d4-a716-446655440000",
              security_id: "550e8400-e29b-41d4-a716-446655440002",
              depot_id: "550e8400-e29b-41d4-a716-446655440001",
              pay_date: "2026-07-27",
              gross_amount: "123.456", // 3 decimal places, max is 2
              net_amount: "100.00",
              withholding_tax: "23.45",
              domestic_tax: "0.00",
              solidarity_surcharge: "0.00",
              church_tax: "0.00",
              fees: "0.00",
              original_currency: "EUR",
              payment_type: "regular",
              source: "manual",
              created_at: "2026-07-27T12:00:00Z",
              updated_at: "2026-07-27T12:00:00Z",
            },
          ],
          depots: [],
          securities: [],
          portfolios: [],
          goals: [],
          imports: [],
        },
        integrity: {
          record_counts: {
            dividend_payment: 1,
            depot: 0,
            security: 0,
            portfolio: 0,
            goal: 0,
            import: 0,
          },
        },
      };

      const result = parseBackupSafe(backup);
      expect(result.success).toBe(false);
    });
  });
});

describe("Depotstände in der Sicherung (Formatversion 2)", () => {
  const USER = "550e8400-e29b-41d4-a716-446655440000";
  const SECURITY = "550e8400-e29b-41d4-a716-446655440002";
  const RUN = "550e8400-e29b-41d4-a716-446655440010";
  const SNAPSHOT = "550e8400-e29b-41d4-a716-446655440011";
  const ALIAS = "550e8400-e29b-41d4-a716-446655440012";

  function datei(data: Record<string, unknown>) {
    return {
      format: "dividend-tracker-backup",
      format_version: 2,
      schema_version: "0031",
      exported_at: "2026-08-04T12:00:00Z",
      base_currency: "EUR",
      data: {
        depots: [],
        securities: [],
        dividend_payments: [],
        portfolios: [],
        goals: [],
        imports: [],
        ...data,
      },
      integrity: { record_counts: {} },
    };
  }

  const lauf = {
    id: RUN,
    user_id: USER,
    as_of: "2026-08-03",
    source: "divvydiary_csv",
    file_name: "portfolio-1754236800000.csv",
    rows_total: 3,
    rows_imported: 2,
    rows_skipped: 1,
    rows_invalid: 0,
    created_at: "2026-08-03T18:00:00Z",
  };

  const stand = {
    id: SNAPSHOT,
    user_id: USER,
    security_id: SECURITY,
    run_id: RUN,
    as_of: "2026-08-03",
    quantity: "12.500000",
    buyin_per_share: "84.120000",
    buyin_total: "1051.50",
    price: "96.400000",
    market_value: "1205.00",
    gain_absolute: "153.50",
    gain_relative: "0.146000",
    allocation: "0.077971",
    dividend_yield: "0.031200",
    dividend_yield_on_buyin: "0.035700",
    annual_dividend_total: "37.60",
    dividend_per_share: "3.008000",
    dividend_frequency: "quarterly",
    dividend_cagr: "0.052000",
    dividend_cagr_period: "5y",
    next_ex_date: "2026-08-14",
    next_pay_date: "2026-09-15",
    asset_type: "equity",
    currency: "EUR",
    created_at: "2026-08-03T18:00:00Z",
  };

  it("liest Stände, Läufe und bestätigte Schreibweisen ein", () => {
    const result = parseBackupSafe(
      datei({
        security_snapshot_runs: [lauf],
        security_snapshots: [stand],
        security_aliases: [
          {
            id: ALIAS,
            user_id: USER,
            alias_normalized: "coca cola company",
            security_id: SECURITY,
            created_at: "2026-03-01T09:00:00Z",
          },
        ],
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.data.security_snapshots[0].annual_dividend_total).toBe("37.60");
    expect(result.data.data.security_snapshot_runs[0].as_of).toBe("2026-08-03");
    expect(result.data.data.security_aliases[0].alias_normalized).toBe(
      "coca cola company",
    );
  });

  it("hält eine Datei der Version 1 lesbar", () => {
    // Der eigentliche Grund für den `default([])` an den drei neuen Feldern:
    // Ohne ihn wäre jede vor dieser Änderung erstellte Sicherung unlesbar —
    // also genau die Dateien, die der Nutzer heute besitzt.
    const result = parseBackupSafe({ ...datei({}), format_version: 1 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.data.security_snapshots).toEqual([]);
    expect(result.data.data.security_snapshot_runs).toEqual([]);
    expect(result.data.data.security_aliases).toEqual([]);
  });

  it("weist eine Datei ab, deren angekündigte Menge nicht stimmt", () => {
    const roh = datei({
      security_snapshot_runs: [lauf],
      security_snapshots: [stand],
    });
    const result = parseBackupSafe({
      ...roh,
      integrity: { record_counts: { security_snapshot: 2 } },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const geprüft = validateBackupIntegrity(result.data);
    expect(geprüft.valid).toBe(false);
    expect(geprüft.mismatches).toContainEqual(
      expect.objectContaining({ entity: "security_snapshot", expected: 2, actual: 1 }),
    );
  });

  it("weist einen Bestand ohne Menge ab", () => {
    // `quantity` ist die einzige Zahl, ohne die ein Stand nichts aussagt —
    // die Datenbank verlangt sie ebenso (0029, NOT NULL und > 0).
    const ohneMenge = { ...stand, quantity: undefined };
    const result = parseBackupSafe(
      datei({ security_snapshot_runs: [lauf], security_snapshots: [ohneMenge] }),
    );
    expect(result.success).toBe(false);
  });
});

describe("Zeitstempel beim Einlesen", () => {
  /**
   * Der Fall, an dem die erste echte Wiederherstellung scheiterte: Die
   * Formatpruefung verlangte starr `Z` und hoechstens drei Nachkommastellen,
   * PostgREST liefert aber Zeitzonenversatz und Mikrosekunden. Die App konnte
   * ihre eigene Sicherungsdatei nicht einlesen.
   *
   * Diese Faelle muessen dauerhaft lesbar bleiben — auch Dateien, die vor der
   * Korrektur entstanden sind.
   */
  const akzeptiert = [
    [
      "Zeitzonenversatz und Mikrosekunden (PostgREST)",
      "2025-06-15T10:30:00.123456+00:00",
    ],
    ["Zeitzonenversatz ohne Nachkommastellen", "2025-06-15T10:30:00+00:00"],
    ["Versatz ohne Doppelpunkt", "2025-06-15T10:30:00+0000"],
    ["anderer Zeitzonenversatz", "2025-06-15T12:30:00+02:00"],
    ["kanonische Form mit Z", "2025-06-15T10:30:00.123Z"],
    ["Z ohne Nachkommastellen", "2025-06-15T10:30:00Z"],
    ["Leerzeichen statt T (psql-Ausgabe)", "2025-06-15 10:30:00+00"],
  ] as const;

  for (const [name, value] of akzeptiert) {
    it(`akzeptiert ${name}`, () => {
      expect(toIsoTimestamp(value)).not.toBeNull();
    });
  }

  it("normalisiert auf die kanonische Form", () => {
    expect(toIsoTimestamp("2025-06-15T10:30:00.123456+00:00")).toBe(
      "2025-06-15T10:30:00.123Z",
    );
  });

  it("rechnet einen Zeitzonenversatz korrekt um", () => {
    expect(toIsoTimestamp("2025-06-15T12:30:00+02:00")).toBe("2025-06-15T10:30:00.000Z");
  });

  it("weist unbrauchbare Werte ab", () => {
    for (const value of ["", "gestern", "2025-06-15", "2025-13-45T99:99:99Z"]) {
      expect(toIsoTimestamp(value)).toBeNull();
    }
  });
});
