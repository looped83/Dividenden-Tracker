/**
 * Restore Preview Component
 *
 * Shows summary of what will be restored from a backup file.
 * Displays record counts and export metadata.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type BackupRoot } from "@/lib/backup/backupFormat";

interface RestorePreviewProps {
  backup: BackupRoot;
}

export default function RestorePreview({ backup }: RestorePreviewProps) {
  const counts = {
    depots: backup.data.depots.length,
    securities: backup.data.securities.length,
    dividends: backup.data.dividend_payments.length,
    goals: backup.data.goals.length,
  };

  const exportedDate = new Date(backup.exported_at);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sicherungsvorschau</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Data Summary */}
        <div>
          <h3 className="font-semibold mb-3">Daten in dieser Sicherung</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-gray-600 dark:text-gray-400">Depots</p>
              <p className="text-2xl font-bold">{counts.depots}</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-gray-600 dark:text-gray-400">Wertpapiere</p>
              <p className="text-2xl font-bold">{counts.securities}</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Dividendenzahlungen
              </p>
              <p className="text-2xl font-bold">{counts.dividends}</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-gray-600 dark:text-gray-400">Ziele</p>
              <p className="text-2xl font-bold">{counts.goals}</p>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Erstellt:</span>
            <span className="font-medium">{exportedDate.toLocaleString("de-DE")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Schemaversion:</span>
            <span className="font-medium">{backup.schema_version}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Basiswährung:</span>
            <span className="font-medium">{backup.base_currency}</span>
          </div>
          {backup.app_version && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">App-Version:</span>
              <span className="font-medium">{backup.app_version}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
