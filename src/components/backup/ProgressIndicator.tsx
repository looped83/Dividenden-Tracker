/**
 * Fortschritt beim Sichern, Wiederherstellen und Exportieren.
 *
 * Die Beschriftungen benennen, was gerade geschieht — nicht die technischen
 * Stufennamen. Wo eine Gesamtzahl bekannt ist, kommt ein Balken dazu.
 */

import { Card, CardContent } from "@/components/ui/card";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import type { BackupProgress } from "@/lib/backup/backupService";

interface ProgressIndicatorProps {
  progress: BackupProgress;
}

const stageLabels: Record<BackupProgress["stage"], string> = {
  fetching_profiles: "Profil wird geladen …",
  fetching_data: "Daten werden geladen …",
  serializing: "Daten werden aufbereitet …",
  generating: "Datei wird erstellt …",
  reading_file: "Datei wird gelesen …",
  validating: "Sicherung wird geprüft …",
  restoring: "Daten werden wiederhergestellt …",
  invalidating_cache: "Ansichten werden aktualisiert …",
  filtering: "Daten werden gefiltert …",
  formatting: "Datei wird geschrieben …",
};

export default function ProgressIndicator({ progress }: ProgressIndicatorProps) {
  const percentage = progress.totalItems
    ? Math.round(((progress.itemsProcessed ?? 0) / progress.totalItems) * 100)
    : undefined;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <p className="font-medium" aria-live="polite">
            {stageLabels[progress.stage]}
          </p>

          {percentage !== undefined && (
            <div className="flex items-center gap-3">
              <div
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={stageLabels[progress.stage]}
                className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${String(percentage)}%` }}
                />
              </div>
              <span className="w-12 text-sm font-medium text-muted-foreground">
                {String(percentage)}%
              </span>
            </div>
          )}

          {progress.itemsProcessed !== undefined && progress.totalItems !== undefined && (
            <p className="text-xs text-muted-foreground">
              {formatCountNumber(progress.itemsProcessed)} von{" "}
              {formatCountNumber(progress.totalItems)} Elementen verarbeitet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
