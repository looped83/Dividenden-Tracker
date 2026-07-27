/**
 * Restore Section
 *
 * Allows users to upload and restore backup files.
 * Handles file validation, conflict detection, and mode selection.
 */

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  parseBackupFile,
  validateBeforeRestore,
  executeRestore,
} from "@/lib/backup/restoreService";
import type { RestoreMode, RestoreResult } from "@/lib/backup/restoreService";
import type { BackupRoot } from "@/lib/backup/backupFormat";
import ProgressIndicator from "@/components/backup/ProgressIndicator";
import RestorePreview from "@/components/backup/RestorePreview";
import { AlertCircle, CheckCircle, Upload } from "lucide-react";

type RestoreStep =
  "upload" | "validate" | "preview" | "confirm" | "restoring" | "complete";

export default function RestoreSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<RestoreStep>("upload");
  const [backup, setBackup] = useState<BackupRoot | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const parseResult = await parseBackupFile(file);

      if (!parseResult.success) {
        setError(parseResult.error);
        setIsProcessing(false);
        return;
      }

      const backup = parseResult.data;

      // Validate backup
      const validation = validateBeforeRestore(backup);
      if (!validation.valid) {
        setError(`Validierungsfehler: ${validation.errors.join("; ")}`);
        setIsProcessing(false);
        return;
      }

      setBackup(backup);
      setStep("preview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown error processing backup file",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (!backup) return;

    setIsProcessing(true);
    setError(null);

    try {
      setStep("restoring");
      const result = await executeRestore(backup, mode);

      if (result.success) {
        setResult(result);
        setStep("complete");
      } else {
        setError(result.error ?? "Restore failed");
        setStep("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error during restore");
      setStep("preview");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setStep("upload");
    setBackup(null);
    setMode("merge");
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Step */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Sicherung hochladen</CardTitle>
            <CardDescription>
              Wählen Sie eine zuvor heruntergeladene Sicherungsdatei aus, um Ihre Daten
              wiederherzustellen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="font-medium mb-1">Sicherungsdatei auswählen</p>
                <p className="text-sm text-gray-500">oder Datei hier ablegen</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  disabled={isProcessing}
                  className="hidden"
                />
              </div>

              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full"
              >
                Datei durchsuchen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview & Mode Selection Step */}
      {step === "preview" && backup && (
        <div className="space-y-4">
          <RestorePreview backup={backup} />

          <Card>
            <CardHeader>
              <CardTitle>Wiederherstellungsmodus</CardTitle>
              <CardDescription>
                Wählen Sie, wie die Sicherung wiederhergestellt werden soll.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="restore-mode" className="mb-2 block">
                  Modus
                </Label>
                <Select
                  id="restore-mode"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as RestoreMode);
                  }}
                >
                  <option value="merge">
                    Zusammenführen - Neue Daten hinzufügen, Duplikate erkennen
                  </option>
                  <option value="replace">
                    Ersetzen - Bestehende Daten archivieren, Sicherung vollständig
                    wiederherstellen
                  </option>
                </Select>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={() => {
                    void handleRestore();
                  }}
                  disabled={isProcessing}
                  className="flex-1"
                >
                  {isProcessing ? "Wird wiederhergestellt..." : "Wiederherstellen"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Restoring Step */}
      {step === "restoring" && <ProgressIndicator progress={{ stage: "restoring" }} />}

      {/* Complete Step */}
      {step === "complete" && result?.success && (
        <div className="space-y-4">
          <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              Sicherung erfolgreich wiederhergestellt! Die Seite wird neu geladen.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Wiederherstellungsergebnis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.recordsRestored && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-sm">
                    <p className="text-gray-500">Depots</p>
                    <p className="text-2xl font-bold">
                      {result.recordsRestored["depot"] ?? 0}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-gray-500">Wertpapiere</p>
                    <p className="text-2xl font-bold">
                      {result.recordsRestored["security"] ?? 0}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-gray-500">Dividendenzahlungen</p>
                    <p className="text-2xl font-bold">
                      {result.recordsRestored["dividend_payment"] ?? 0}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-gray-500">Ziele</p>
                    <p className="text-2xl font-bold">
                      {result.recordsRestored["goal"] ?? 0}
                    </p>
                  </div>
                </div>
              )}

              <Button onClick={handleReset} className="w-full">
                Weitere Sicherung hochladen
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
