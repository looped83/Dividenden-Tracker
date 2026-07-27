/**
 * Restore Backup RPC Wrapper
 *
 * Thin client wrapper around the restore_backup PostgreSQL function.
 * The actual RPC is defined in supabase/migrations/0022_restore_backup_rpc.sql
 */

import { supabase } from "./client";
import type { BackupRoot } from "@/lib/backup/backupFormat";

export interface RestoreBackupRpcResult {
  success: boolean;
  mode: "merge" | "replace";
  records_restored?: Record<string, number>;
  error?: string;
}

/**
 * Call restore_backup RPC to atomically restore a backup
 *
 * @param backup - The backup data to restore
 * @param mode - 'merge' to add/update, 'replace' to archive and restore
 * @returns Result object with success status and record counts
 */
export async function callRestoreBackupRpc(
  backup: BackupRoot,
  mode: "merge" | "replace"
): Promise<{ success: boolean; data?: RestoreBackupRpcResult; error?: Error }> {
  try {
    const { data, error } = await (supabase.rpc as any)("restore_backup", {
      p_backup_payload: backup,
      p_mode: mode,
    });

    if (error) {
      return {
        success: false,
        error: new Error(`Restore RPC failed: ${error.message}`),
      };
    }

    return {
      success: true,
      data: data as unknown as RestoreBackupRpcResult,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Unknown error calling restore_backup RPC"),
    };
  }
}
