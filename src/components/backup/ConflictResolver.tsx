/**
 * Conflict Resolver Component
 *
 * Displays conflicts detected during merge mode restore
 * and allows user to choose resolution strategy for each conflict.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { type ConflictItem } from "@/lib/backup/restoreService";
import { formatCountNumber } from "@/lib/utils/formatNumber";

interface ConflictResolverProps {
  conflicts: ConflictItem[];
  onConflictResolved?: (conflict: ConflictItem) => void;
}

export default function ConflictResolver({
  conflicts,
  onConflictResolved,
}: ConflictResolverProps) {
  if (conflicts.length === 0) {
    return null;
  }

  const handleResolution = (conflict: ConflictItem, resolution: "skip" | "overwrite") => {
    conflict.resolution = resolution;
    onConflictResolved?.(conflict);
  };

  const typeLabel: Record<string, string> = {
    depot: "Depot",
    security: "Wertpapier",
    dividend_payment: "Dividendenzahlung",
    goal: "Ziel",
  };

  return (
    <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
      <CardHeader>
        <CardTitle className="text-yellow-900 dark:text-yellow-200">
          {formatCountNumber(conflicts.length)} Konflikt
          {conflicts.length !== 1 ? "e" : ""} erkannt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-yellow-800 dark:text-yellow-300">
          Die folgenden Einträge existieren bereits mit unterschiedlichen Daten. Wählen
          Sie, wie sie behandelt werden sollen.
        </p>

        <div className="space-y-3">
          {conflicts.map((conflict, idx) => (
            <div
              key={idx}
              className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-yellow-200 dark:border-yellow-800"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-medium text-sm">
                    {typeLabel[conflict.type]}: {conflict.field}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ID: {conflict.id.slice(0, 8)}...
                  </p>
                </div>
              </div>

              <div className="mb-3 space-y-1 text-sm">
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Aktueller Wert:</p>
                  <p className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">
                    {conflict.existingValue}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 dark:text-gray-400">Wert aus Sicherung:</p>
                  <p className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">
                    {conflict.backupValue}
                  </p>
                </div>
              </div>

              <Select
                value={conflict.resolution ?? "overwrite"}
                onChange={(e) => {
                  handleResolution(conflict, e.target.value as "skip" | "overwrite");
                }}
                className="text-xs"
              >
                <option value="skip">Überspringen - Aktuellen Wert behalten</option>
                <option value="overwrite">
                  Überschreiben - Mit Sicherungswert ersetzen
                </option>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
