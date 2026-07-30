import { useQuery } from "@tanstack/react-query";
import { fetchLastBackupAt } from "@/lib/backup/backupService";
import { formatTimestampDate } from "@/lib/utils/formatDate";

export const LAST_BACKUP_KEY = ["profile", "last-backup"] as const;

/** Ganze Tage zwischen zwei Zeitpunkten (nur zur Anzeige, keine Geldarithmetik). */
function daysSince(iso: string, now: Date): number {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * Zeitpunkt der letzten Sicherung als fertiger Satz.
 *
 * `profiles.last_backup_at` besteht seit Migration 0004 und wurde nie
 * geschrieben; die Frage „wann habe ich zuletzt gesichert?" war damit nicht zu
 * beantworten. Eine Sicherung, an die niemand erinnert wird, ist keine.
 */
export function useLastBackup(): { label: string; refetch: () => void } {
  const query = useQuery({
    queryKey: LAST_BACKUP_KEY,
    queryFn: fetchLastBackupAt,
  });

  return {
    label: describeLastBackup(query.data ?? null, query.isLoading),
    refetch: () => void query.refetch(),
  };
}

/** Reine Formatierung — isoliert testbar. */
export function describeLastBackup(
  lastBackupAt: string | null,
  isLoading = false,
  now: Date = new Date(),
): string {
  if (isLoading) return "Sicherungsstand wird geladen …";
  if (!lastBackupAt) return "Noch keine Sicherung erstellt.";

  const days = daysSince(lastBackupAt, now);
  const date = formatTimestampDate(lastBackupAt);
  if (days <= 0) return `Zuletzt gesichert: heute (${date}).`;
  if (days === 1) return `Zuletzt gesichert: gestern (${date}).`;
  return `Zuletzt gesichert: vor ${String(days)} Tagen (${date}).`;
}
