import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { BackupContents } from "@/components/backup/BackupContents";
import ProgressIndicator from "@/components/backup/ProgressIndicator";
import {
  parseBackupFile,
  validateBeforeRestore,
  executeRestore,
  getBackupContents,
} from "@/lib/backup/restoreService";
import type { RestoreMode, RestoreResult } from "@/lib/backup/restoreService";
import type { BackupRoot } from "@/lib/backup/backupFormat";

/** Größe, ab der eine Datei nicht mehr als Sicherung dieser App plausibel ist. */
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

type RestoreStep = "upload" | "preview" | "restoring" | "complete";

export default function RestoreSection() {
  const { notify } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [step, setStep] = React.useState<RestoreStep>("upload");
  const [backup, setBackup] = React.useState<BackupRoot | null>(null);
  const [mode, setMode] = React.useState<RestoreMode>("merge");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [result, setResult] = React.useState<RestoreResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      if (file.size > MAX_BACKUP_BYTES) {
        setError(
          `Die Datei ist ${formatCountNumber(Math.round(file.size / 1024 / 1024))} MB groß und damit zu groß für eine Sicherung dieser App.`,
        );
        return;
      }

      const parseResult = await parseBackupFile(file);
      if (!parseResult.success) {
        setError(parseResult.error);
        return;
      }

      const validation = validateBeforeRestore(parseResult.data);
      if (!validation.valid) {
        setError(`Die Datei ist nicht verwendbar: ${validation.errors.join("; ")}`);
        return;
      }

      setBackup(parseResult.data);
      setStep("preview");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Die Datei konnte nicht gelesen werden.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (!backup) return;

    setConfirmOpen(false);
    setIsProcessing(true);
    setError(null);
    setStep("restoring");

    try {
      const restoreResult = await executeRestore(backup, mode);

      if (!restoreResult.success) {
        setError(
          restoreResult.errorDetails ?? restoreResult.error ?? "Unbekannter Fehler.",
        );
        setStep("preview");
        return;
      }

      setResult(restoreResult);
      setStep("complete");
      notify("Sicherung wiederhergestellt.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unbekannter Fehler bei der Wiederherstellung.",
      );
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sicherung wiederherstellen</CardTitle>
        <CardDescription>
          Spielt eine zuvor heruntergeladene Sicherungsdatei wieder ein. Der Vorgang läuft
          vollständig in einem Schritt in der Datenbank: Er gelingt ganz oder gar nicht.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "upload" && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleFileSelect(event)}
              disabled={isProcessing}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Upload />
              {isProcessing ? "Datei wird gelesen …" : "Sicherungsdatei auswählen"}
            </Button>
          </>
        )}

        {step === "preview" && backup && (
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-medium">Inhalt der Datei</h3>
              <BackupContents backup={backup} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="restore-mode">Wie soll eingespielt werden?</Label>
              <Select
                id="restore-mode"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as RestoreMode);
                }}
              >
                <option value="merge">
                  Ergänzen — fehlende Datensätze hinzufügen, vorhandene behalten
                </option>
                <option value="replace">
                  Ersetzen — bestehenden Bestand archivieren und die Sicherung einspielen
                </option>
              </Select>
              <p className="text-sm text-muted-foreground">
                {mode === "merge"
                  ? "Der bestehende Bestand bleibt unverändert."
                  : "Alle vorhandenen Dividendeneingänge werden storniert und durch die Sicherung ersetzt."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setConfirmOpen(true);
                }}
                disabled={isProcessing}
              >
                Wiederherstellen
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={isProcessing}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {step === "restoring" && <ProgressIndicator progress={{ stage: "restoring" }} />}

        {step === "complete" && result?.success && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Die Sicherung wurde eingespielt. Die Ansichten sind bereits aktualisiert.
              </AlertDescription>
            </Alert>
            {result.recordsRestored && (
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(result.recordsRestored).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border p-3">
                    <dt className="text-sm text-muted-foreground">
                      {RECORD_LABELS[key] ?? key}
                    </dt>
                    <dd className="text-xl font-semibold tabular-nums">
                      {formatCountNumber(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <Button variant="outline" onClick={handleReset}>
              Weitere Sicherung einspielen
            </Button>
          </div>
        )}
      </CardContent>

      <ConfirmRestoreDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        mode={mode}
        backup={backup}
        isPending={isProcessing}
        onConfirm={() => void handleRestore()}
      />
    </Card>
  );
}

const RECORD_LABELS: Record<string, string> = {
  depot: "Depots",
  depots: "Depots",
  security: "Unternehmen",
  securities: "Unternehmen",
  dividend_payment: "Dividendeneingänge",
  dividend_payments: "Dividendeneingänge",
  goal: "Ziele",
  goals: "Ziele",
  portfolio: "Portfolios",
  portfolios: "Portfolios",
};

/**
 * Bestaetigung vor dem Einspielen.
 *
 * „Ersetzen" archiviert den gesamten bestehenden Bestand und laesst sich nicht
 * rueckgaengig machen — es lag zuvor hinter einem einzigen Klick, waehrend
 * jedes Stornieren einer **einzelnen** Zahlung einen Bestaetigungsdialog
 * verlangt. Der Dialog benennt deshalb ausdruecklich, was passiert, und der
 * gefaehrliche Modus traegt die warnende Schaltflaeche.
 */
function ConfirmRestoreDialog({
  open,
  onOpenChange,
  mode,
  backup,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RestoreMode;
  backup: BackupRoot | null;
  isPending: boolean;
  onConfirm: () => void;
}) {
  const contents = backup ? getBackupContents(backup) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "replace" ? "Bestehende Daten ersetzen?" : "Sicherung ergänzen?"}
          </DialogTitle>
        </DialogHeader>

        {contents && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-muted/50 p-3 text-sm">
            <dt className="text-muted-foreground">Dividendeneingänge</dt>
            <dd className="text-right font-medium tabular-nums">
              {formatCountNumber(contents["dividend_payments"] ?? 0)}
            </dd>
            <dt className="text-muted-foreground">Unternehmen</dt>
            <dd className="text-right tabular-nums">
              {formatCountNumber(contents["securities"] ?? 0)}
            </dd>
            <dt className="text-muted-foreground">Depots</dt>
            <dd className="text-right tabular-nums">
              {formatCountNumber(contents["depots"] ?? 0)}
            </dd>
            <dt className="text-muted-foreground">Ziele</dt>
            <dd className="text-right tabular-nums">
              {formatCountNumber(contents["goals"] ?? 0)}
            </dd>
          </dl>
        )}

        <p className="text-sm text-muted-foreground">
          {mode === "replace"
            ? "Alle bisher erfassten Dividendeneingänge werden storniert und durch den Inhalt dieser Datei ersetzt. Das lässt sich nicht rückgängig machen. Erstelle vorher eine Sicherung des aktuellen Standes."
            : "Fehlende Datensätze aus der Datei werden ergänzt. Bereits vorhandene Datensätze bleiben unverändert."}
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isPending}
          >
            Abbrechen
          </Button>
          <Button
            variant={mode === "replace" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {mode === "replace" ? "Ja, ersetzen" : "Ja, ergänzen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
