/**
 * Progress Indicator Component
 *
 * Shows progress during backup creation, restoration, or export operations.
 * Displays current stage and item counts when available.
 */

import { Card, CardContent } from "@/components/ui/card";
import type { BackupProgress } from "@/lib/backup/backupService";

interface ProgressIndicatorProps {
  progress: BackupProgress;
}

const stageLabels: Record<BackupProgress["stage"], string> = {
  fetching_profiles: "Profil wird geladen...",
  fetching_data: "Daten werden geladen...",
  serializing: "Daten werden serialisiert...",
  generating: "Datei wird generiert...",
  reading_file: "Datei wird gelesen...",
  validating: "Sicherung wird validiert...",
  detecting_conflicts: "Konflikte werden erkannt...",
  restoring: "Daten werden wiederhergestellt...",
  invalidating_cache: "Cache wird aktualisiert...",
  filtering: "Daten werden gefiltert...",
  formatting: "Daten werden formatiert...",
};

export default function ProgressIndicator({ progress }: ProgressIndicatorProps) {
  const percentage = progress.totalItems
    ? Math.round(((progress.itemsProcessed ?? 0) / progress.totalItems) * 100)
    : undefined;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <p className="font-medium">{stageLabels[progress.stage]}</p>

          {percentage !== undefined && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${String(percentage)}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400 w-12">
                {String(percentage)}%
              </span>
            </div>
          )}

          {progress.itemsProcessed !== undefined && progress.totalItems !== undefined && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {progress.itemsProcessed} von {progress.totalItems} Elementen verarbeitet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
