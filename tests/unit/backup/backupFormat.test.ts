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
      const result = validateBackupVersion(1);
      expect(result.valid).toBe(true);
    });

    it("should reject newer format version", () => {
      const result = validateBackupVersion(2);
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
