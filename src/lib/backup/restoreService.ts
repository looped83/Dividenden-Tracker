/**
 * Wiederherstellung: liest eine Sicherungsdatei, prueft sie und uebergibt sie
 * der Datenbank.
 *
 * Der eigentliche Vorgang laeuft **vollstaendig** in der RPC `restore_backup`
 * (Migration 0022/0023) und damit in einer einzigen Transaktion. Hier wird
 * bewusst nichts zusammengefuehrt, verglichen oder teilweise geschrieben: Ein
 * clientseitiger Abgleich koennte einen halb fertigen Zustand hinterlassen,
 * den niemand zurueckdrehen kann.
 */

import {
  parseBackupSafe,
  validateBackupVersion,
  validateBackupCompleteness,
  validateBackupIntegrity,
  type BackupRoot,
} from "./backupFormat";
import { supabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { queryClient } from "@/lib/queryClient";

// ============================================================================
// Types
// ============================================================================

export type RestoreMode = "merge" | "replace";

export interface RestoreResult {
  success: boolean;
  mode: RestoreMode;
  recordsRestored?: Record<string, number>;
  error?: string;
  errorDetails?: string;
  validationErrors?: { path: string; message: string }[];
}

export interface RestoreProgress {
  stage: "reading_file" | "validating" | "restoring" | "invalidating_cache";
  itemsProcessed?: number;
  totalItems?: number;
}

// ============================================================================
// File Parsing
// ============================================================================

/** Liest eine Sicherungsdatei ein und prueft sie gegen das Format-Schema. */
export async function parseBackupFile(
  file: File,
): Promise<{ success: true; data: BackupRoot } | { success: false; error: string }> {
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        success: false,
        error: "Die Datei ist kein gültiges JSON.",
      };
    }

    const result = parseBackupSafe(parsed);
    if (!result.success) {
      const errors = result.errors
        .slice(0, 3)
        .map((e) => `${e.path}: ${e.message}`)
        .join("; ");
      return {
        success: false,
        error: `Die Datei entspricht nicht dem Sicherungsformat: ${errors}${result.errors.length > 3 ? " …" : ""}`,
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Die Datei konnte nicht gelesen werden.",
    };
  }
}

// ============================================================================
// Validation Pipeline
// ============================================================================

/**
 * Vollstaendige Pruefung vor dem Einspielen: Formatversion, Vollstaendigkeit
 * und der Integritaetsblock der Datei (Mengen gegen die tatsaechlichen Daten).
 */
export function validateBeforeRestore(backup: BackupRoot): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check format version
  const versionCheck = validateBackupVersion(backup.format_version);
  if (!versionCheck.valid) {
    errors.push(
      versionCheck.message ?? "Die Version des Sicherungsformats wird nicht unterstützt.",
    );
  }

  // Check completeness (profile, depots, securities required)
  const completeness = validateBackupCompleteness(backup);
  if (!completeness.valid) {
    errors.push(`Es fehlen Pflichtangaben: ${completeness.missing.join(", ")}.`);
  }

  // Check integrity
  const integrity = validateBackupIntegrity(backup);
  if (!integrity.valid) {
    integrity.mismatches.forEach((m) => {
      errors.push(
        `Die Datei ist beschädigt: Für ${m.entity} sind ${String(m.expected)} Datensätze angekündigt, enthalten sind ${String(m.actual)}.`,
      );
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Cache Invalidation
// ============================================================================

/** Laedt nach dem Einspielen alle Ansichten neu. */
function invalidateBackupAffectedCaches(): void {
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    queryClient.invalidateQueries({ queryKey: key });
  }

  // Sicherheitsnetz: Nach einem Restore ist jede zwischengespeicherte Antwort
  // veraltet — auch die, die oben nicht namentlich steht.
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  queryClient.invalidateQueries();
}

// ============================================================================
// Restore Orchestration
// ============================================================================

/** Spielt die Sicherung ueber die RPC ein (eine Transaktion, alles oder nichts). */
export async function executeRestore(
  backup: BackupRoot,
  mode: RestoreMode,
  onProgress?: (progress: RestoreProgress) => void,
): Promise<RestoreResult> {
  try {
    onProgress?.({ stage: "validating" });

    const validation = validateBeforeRestore(backup);
    if (!validation.valid) {
      return {
        success: false,
        mode,
        error: "Die Sicherung konnte nicht geprüft werden.",
        errorDetails: validation.errors.join("; "),
      };
    }

    // Die eigentliche Wiederherstellung laeuft vollstaendig in **einer**
    // Transaktion in der Datenbank (RPC `restore_backup`, Migration 0022/0023):
    // entweder alles oder nichts. Ein clientseitiges Zusammenfuehren gaebe es
    // keinen Weg, halb fertige Zustaende zurueckzunehmen.
    onProgress?.({ stage: "restoring" });

    const { data, error } = await supabase.rpc("restore_backup", {
      p_backup_payload: backup as unknown as Json,
      p_mode: mode,
    });

    if (error) {
      return {
        success: false,
        mode,
        error: "Die Wiederherstellung ist fehlgeschlagen.",
        errorDetails: error.message,
      };
    }

    onProgress?.({ stage: "invalidating_cache" });
    invalidateBackupAffectedCaches();

    return {
      success: true,
      mode,
      recordsRestored: data.records_restored,
    };
  } catch (error) {
    return {
      success: false,
      mode,
      error:
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler bei der Wiederherstellung.",
    };
  }
}

/**
 * Mengen fuer den Bestaetigungsdialog: was die Sicherung mitbringt. Wie viele
 * bestehende Datensaetze im Modus „Ersetzen" archiviert werden, weiss nur die
 * Datenbank — der Dialog nennt deshalb den bestehenden Bestand aus dem
 * laufenden Betrieb, nicht eine hier geratene Zahl.
 */
export function getBackupContents(backup: BackupRoot): Record<string, number> {
  return {
    depots: backup.data.depots.length,
    securities: backup.data.securities.length,
    dividend_payments: backup.data.dividend_payments.length,
    goals: backup.data.goals.length,
  };
}
