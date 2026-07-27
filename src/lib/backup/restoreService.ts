/**
 * Restore Service
 *
 * Client-side service for restoring backups:
 * - Parses backup files (JSON)
 * - Validates backup format and schema
 * - Detects conflicts in merge mode
 * - Orchestrates RPC call to restore_backup
 * - Handles cache invalidation after restore
 */

import {
  parseBackupSafe,
  validateBackupVersion,
  validateBackupCompleteness,
  validateBackupIntegrity,
  type BackupRoot,
} from "./backupFormat";
import { supabase } from "@/lib/supabase/client";
import { queryClient } from "@/lib/queryClient";

// ============================================================================
// Types
// ============================================================================

export type RestoreMode = "merge" | "replace";

export interface ConflictDetection {
  hasConflicts: boolean;
  conflicts: ConflictItem[];
}

export interface ConflictItem {
  type: "depot" | "security" | "dividend_payment" | "goal";
  id: string;
  field: string;
  backupValue: string;
  existingValue: string;
  resolution?: "skip" | "overwrite";
}

export interface RestoreResult {
  success: boolean;
  mode: RestoreMode;
  recordsRestored?: Record<string, number>;
  error?: string;
  errorDetails?: string;
  validationErrors?: Array<{ path: string; message: string }>;
}

export interface RestoreProgress {
  stage: "reading_file" | "validating" | "detecting_conflicts" | "restoring" | "invalidating_cache";
  itemsProcessed?: number;
  totalItems?: number;
}

// ============================================================================
// File Parsing
// ============================================================================

/**
 * Parse backup file from File object
 */
export async function parseBackupFile(file: File): Promise<{ success: true; data: BackupRoot } | { success: false; error: string }> {
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { success: false, error: "Invalid JSON format" };
    }

    const result = parseBackupSafe(parsed);
    if (!result.success) {
      const errors = result.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join("; ");
      return {
        success: false,
        error: `Backup format validation failed: ${errors}${result.errors.length > 3 ? "..." : ""}`,
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error reading file",
    };
  }
}

// ============================================================================
// Validation Pipeline
// ============================================================================

/**
 * Comprehensive pre-restore validation
 */
export function validateBeforeRestore(backup: BackupRoot): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check format version
  const versionCheck = validateBackupVersion(backup.format_version);
  if (!versionCheck.valid) {
    errors.push(versionCheck.message || "Unsupported backup format version");
  }

  // Check completeness (profile, depots, securities required)
  const completeness = validateBackupCompleteness(backup);
  if (!completeness.valid) {
    errors.push(`Missing required data: ${completeness.missing.join(", ")}`);
  }

  // Check integrity
  const integrity = validateBackupIntegrity(backup);
  if (!integrity.valid) {
    integrity.mismatches.forEach((m) => {
      errors.push(`Record count mismatch for ${m.entity}: expected ${m.expected}, got ${m.actual}`);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Conflict Detection (Merge Mode)
// ============================================================================

/**
 * Detect conflicts between backup and existing data (for merge mode)
 */
export async function detectConflicts(backup: BackupRoot): Promise<ConflictDetection> {
  const conflicts: ConflictItem[] = [];

  // Check for depot ID collisions
  if (backup.data.depots && backup.data.depots.length > 0) {
    const { data: existingDepots } = await supabase.from("depots").select("id, name");

    const existingDepotMap = new Map(
      (existingDepots || []).map((d: any) => [d.id, d.name])
    );

    for (const backupDepot of backup.data.depots) {
      const existingName = existingDepotMap.get(backupDepot.id);
      if (existingName && existingName !== backupDepot.name) {
        conflicts.push({
          type: "depot",
          id: backupDepot.id,
          field: "name",
          backupValue: backupDepot.name,
          existingValue: existingName,
        });
      }
    }
  }

  // Check for security ID collisions
  if (backup.data.securities && backup.data.securities.length > 0) {
    const { data: existingSecurities } = await supabase.from("securities").select("id, name, isin, ticker");

    const existingSecurityMap = new Map(
      (existingSecurities || []).map((s: any) => [s.id, s])
    );

    for (const backupSecurity of backup.data.securities) {
      const existing = existingSecurityMap.get(backupSecurity.id);
      if (existing && existing.name !== backupSecurity.name) {
        conflicts.push({
          type: "security",
          id: backupSecurity.id,
          field: "name",
          backupValue: backupSecurity.name,
          existingValue: existing.name,
        });
      }
    }
  }

  // Check for dividend payment ID collisions (by business fingerprint to detect real duplicates)
  if (backup.data.dividend_payments && backup.data.dividend_payments.length > 0) {
    const { data: existingPayments } = await supabase
      .from("dividend_payments")
      .select("id, business_fingerprint, net_amount, pay_date");

    const existingFingerprintMap = new Map(
      (existingPayments || []).map((p: any) => [p.business_fingerprint, p])
    );

    for (const backupPayment of backup.data.dividend_payments) {
      if (backupPayment.business_fingerprint) {
        const existing = existingFingerprintMap.get(backupPayment.business_fingerprint);
        if (existing && existing.id !== backupPayment.id) {
          conflicts.push({
            type: "dividend_payment",
            id: backupPayment.id,
            field: "business_fingerprint",
            backupValue: `${backupPayment.pay_date} ${backupPayment.net_amount}`,
            existingValue: `${existing.pay_date} ${existing.net_amount}`,
          });
        }
      }
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

// ============================================================================
// Cache Invalidation
// ============================================================================

/**
 * Invalidate all cache keys that might be affected by restore
 */
function invalidateBackupAffectedCaches(): void {
  // Query key patterns that should be invalidated
  const keysToInvalidate = [
    ["portfolios"],
    ["depots"],
    ["securities"],
    ["dividend_payments"],
    ["goals"],
    ["imports"],
    ["profile"],
    ["statistics"],
    ["dashboard"],
    ["payments"],
  ];

  for (const key of keysToInvalidate) {
    queryClient.invalidateQueries({ queryKey: key });
  }

  // Invalidate all queries as a safety net
  queryClient.invalidateQueries();
}

// ============================================================================
// Restore Orchestration
// ============================================================================

/**
 * Execute backup restoration via RPC
 */
export async function executeRestore(
  backup: BackupRoot,
  mode: RestoreMode,
  onProgress?: (progress: RestoreProgress) => void
): Promise<RestoreResult> {
  try {
    // Pre-restore validation
    onProgress?.({ stage: "validating" });

    const validation = validateBeforeRestore(backup);
    if (!validation.valid) {
      return {
        success: false,
        mode,
        error: "Backup validation failed",
        errorDetails: validation.errors.join("; "),
      };
    }

    // Detect conflicts in merge mode
    if (mode === "merge") {
      onProgress?.({ stage: "detecting_conflicts" });

      const conflicts = await detectConflicts(backup);
      if (conflicts.hasConflicts) {
        // In a real app, this would return conflicts for user resolution
        // For now, we'll use a default resolution strategy
        for (const conflict of conflicts.conflicts) {
          conflict.resolution = "overwrite";
        }
      }
    }

    // Execute restore via RPC
    onProgress?.({ stage: "restoring" });

    const { data, error } = await (supabase.rpc as any)("restore_backup", {
      p_backup_payload: backup,
      p_mode: mode,
    });

    if (error) {
      return {
        success: false,
        mode,
        error: "Restore RPC failed",
        errorDetails: error.message,
      };
    }

    // Invalidate cache after successful restore
    onProgress?.({ stage: "invalidating_cache" });
    invalidateBackupAffectedCaches();

    return {
      success: true,
      mode,
      recordsRestored: (data as any)?.records_restored || {},
    };
  } catch (error) {
    return {
      success: false,
      mode,
      error: error instanceof Error ? error.message : "Unknown error during restore",
    };
  }
}

// ============================================================================
// User Confirmation Helpers
// ============================================================================

/**
 * Summary for replace mode confirmation dialog
 */
export function getReplaceModeSummary(backup: BackupRoot): {
  willBeArchived: Record<string, number>;
  willBeRestored: Record<string, number>;
} {
  return {
    willBeArchived: {
      depots: 0, // Will be computed by RPC
      securities: 0,
      dividend_payments: 0,
      goals: 0,
    },
    willBeRestored: {
      depots: backup.data.depots?.length || 0,
      securities: backup.data.securities?.length || 0,
      dividend_payments: backup.data.dividend_payments?.length || 0,
      goals: backup.data.goals?.length || 0,
    },
  };
}
