/**
 * Backup Section
 *
 * Allows users to create and download complete data backups.
 * Shows backup summary and progress during creation.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createBackup, generateBackupSummary } from "@/lib/backup/backupService";
import type { BackupProgress, BackupResult } from "@/lib/backup/backupService";
import BackupSummary from "@/components/backup/BackupSummary";
import ProgressIndicator from "@/components/backup/ProgressIndicator";
import { AlertCircle, CheckCircle, Download } from "lucide-react";

export default function BackupSection() {
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    setError(null);
    setResult(null);

    try {
      const result = await createBackup((p) => {
        setProgress(p);
      });

      if (result.success && result.backup) {
        setResult(result);
        const summary = generateBackupSummary(result.backup);
        console.log("Backup created successfully:", summary);
      } else {
        setError(result.error ?? "Failed to create backup");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error creating backup");
    } finally {
      setIsCreating(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Sicherung erstellen</CardTitle>
          <CardDescription>
            Laden Sie eine vollständige Sicherung aller Ihrer Daten herunter,
            einschließlich Depots, Wertpapiere und Dividendenzahlungen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result?.success && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Sicherung erfolgreich erstellt und heruntergeladen!
              </AlertDescription>
            </Alert>
          )}

          {/* Progress */}
          {isCreating && progress && <ProgressIndicator progress={progress} />}

          {/* Summary */}
          {result?.backup && <BackupSummary backup={result.backup} />}

          {/* Action Button */}
          <Button
            onClick={() => {
              void handleCreateBackup();
            }}
            disabled={isCreating}
            className="w-full"
            size="lg"
          >
            {isCreating ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Wird erstellt...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Sicherung jetzt erstellen
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Security Notice */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            <strong>Datenschutz:</strong> Sicherungen werden nicht automatisch
            hochgeladen. Sie laden die Dateien manuell herunter und speichern sie sicher.
            Behandeln Sie Sicherungsdateien wie Passwörter – sie enthalten alle Ihre
            Daten.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
