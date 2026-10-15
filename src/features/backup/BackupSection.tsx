import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import { BackupContents } from "@/components/backup/BackupContents";
import ProgressIndicator from "@/components/backup/ProgressIndicator";
import { createBackup, downloadBackup } from "@/lib/backup/backupService";
import type { BackupProgress } from "@/lib/backup/backupService";
import type { BackupRoot } from "@/lib/backup/backupFormat";
import { useLastBackup } from "./hooks";

/**
 * Sicherung erstellen.
 *
 * Der Ablauf ist bewusst in dieser Reihenfolge: Daten laden → Datei anbieten
 * (samt Sicherungszeitpunkt, siehe `downloadBackup`) → **erst dann** Erfolg
 * melden. Zuvor meldete dieser Bereich „erfolgreich erstellt und
 * heruntergeladen", ohne dass je eine Datei entstand — die Erfolgsmeldung hing am Erzeugen der Daten, nicht
 * am Ergebnis. Bei einem Sicherheitsnetz ist genau das der teuerste Fehler:
 * Man bemerkt ihn erst, wenn man es braucht.
 */
export default function BackupSection() {
  const { notify } = useToast();
  const lastBackup = useLastBackup();
  const [isCreating, setIsCreating] = React.useState(false);
  const [backup, setBackup] = React.useState<BackupRoot | null>(null);
  const [progress, setProgress] = React.useState<BackupProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    setError(null);
    setBackup(null);

    try {
      const result = await createBackup(setProgress);

      if (!result.success || !result.backup || !result.fileName) {
        setError(result.errorDetails ?? result.error ?? "Unbekannter Fehler.");
        return;
      }

      const recordedAt = await downloadBackup(result.backup, result.fileName);
      setBackup(result.backup);
      if (recordedAt) {
        lastBackup.record(recordedAt);
        notify("Sicherung erstellt und heruntergeladen.");
      } else {
        // Die Datei ist da — nur der Vermerk fehlt. Gesagt wird es trotzdem:
        // „Zuletzt gesichert" zeigte sonst stillschweigend einen alten Stand.
        notify(
          "Sicherung heruntergeladen, der Zeitpunkt konnte aber nicht gespeichert werden.",
          "negative",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setIsCreating(false);
      setProgress(null);
    }
  };

  return (
    <Section title="Sicherung erstellen">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {lastBackup.label}
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isCreating && progress && <ProgressIndicator progress={progress} />}

        <Button onClick={() => void handleCreateBackup()} disabled={isCreating}>
          <Download />
          {isCreating ? "Wird erstellt …" : "Sicherung jetzt erstellen"}
        </Button>

        {backup && (
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="font-medium">Inhalt der heruntergeladenen Datei</h3>
            <BackupContents backup={backup} />
          </div>
        )}
      </div>
    </Section>
  );
}
