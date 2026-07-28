/**
 * Backup Summary Component
 *
 * Displays summary information about a backup:
 * - Record counts (depots, securities, payments, goals)
 * - Total size
 * - Export timestamp
 */

import { type BackupRoot } from "@/lib/backup/backupFormat";
import { formatCountNumber } from "@/lib/utils/formatNumber";

interface BackupSummaryProps {
  backup: BackupRoot;
}

export default function BackupSummary({ backup }: BackupSummaryProps) {
  const counts = {
    depots: backup.data.depots.length,
    securities: backup.data.securities.length,
    dividends: backup.data.dividend_payments.length,
    goals: backup.data.goals.length,
  };

  const exportedDate = new Date(backup.exported_at);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold mb-3">Sicherungsinhalt</h3>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">Depots</p>
            <p className="text-lg sm:text-2xl font-bold">
              {formatCountNumber(counts.depots)}
            </p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">Wertpapiere</p>
            <p className="text-lg sm:text-2xl font-bold">
              {formatCountNumber(counts.securities)}
            </p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Dividendenzahlungen
            </p>
            <p className="text-lg sm:text-2xl font-bold">
              {formatCountNumber(counts.dividends)}
            </p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">Ziele</p>
            <p className="text-lg sm:text-2xl font-bold">
              {formatCountNumber(counts.goals)}
            </p>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400">
        <p className="mb-1">
          <strong>Exportiert:</strong> {exportedDate.toLocaleString("de-DE")}
        </p>
        <p className="mb-1">
          <strong>Schemaversion:</strong> {backup.schema_version}
        </p>
        <p>
          <strong>Basiswährung:</strong> {backup.base_currency}
        </p>
      </div>
    </div>
  );
}
