import { formatCountNumber } from "@/lib/utils/formatNumber";
import { type BackupRoot } from "@/lib/backup/backupFormat";
import { formatTimestamp } from "@/lib/utils/formatDate";

/**
 * Inhalt einer Sicherung in Zahlen, plus die Angaben, die sie einordnen.
 *
 * Eine Darstellung fuer beide Faelle: die eben erzeugte Sicherung und die
 * Vorschau einer hochgeladenen Datei. Zuvor gab es dafuer zwei Komponenten mit
 * denselben vier Kacheln — die eine grau, die andere blau, beide mit rohen
 * Tailwind-Farben statt der Farbrollen des Designsystems (und damit im dunklen
 * Erscheinungsbild nur zufaellig lesbar).
 *
 * Die Zahl der Dividendeneingaenge ist die wichtigste Angabe der Seite: An ihr
 * erkennt man, ob eine Sicherung vollstaendig ist. Sie steht deshalb zuerst.
 */
export function BackupContents({ backup }: { backup: BackupRoot }) {
  const counts = [
    { label: "Dividendeneingänge", value: backup.data.dividend_payments.length },
    { label: "Unternehmen", value: backup.data.securities.length },
    { label: "Depots", value: backup.data.depots.length },
    { label: "Ziele", value: backup.data.goals.length },
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {counts.map((entry) => (
          <div key={entry.label} className="rounded-lg border border-border p-3">
            <dt className="text-sm text-muted-foreground">{entry.label}</dt>
            <dd className="text-xl font-semibold tabular-nums sm:text-2xl">
              {formatCountNumber(entry.value)}
            </dd>
          </div>
        ))}
      </dl>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Erstellt</dt>
        <dd className="text-right">{formatTimestamp(backup.exported_at)}</dd>
        <dt className="text-muted-foreground">Basiswährung</dt>
        <dd className="text-right">{backup.base_currency}</dd>
        <dt className="text-muted-foreground">Schemaversion</dt>
        <dd className="text-right tabular-nums">{backup.schema_version}</dd>
        {backup.app_version && (
          <>
            <dt className="text-muted-foreground">App-Version</dt>
            <dd className="text-right tabular-nums">{backup.app_version}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
