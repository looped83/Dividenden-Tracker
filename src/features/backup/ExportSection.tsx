import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import ProgressIndicator from "@/components/backup/ProgressIndicator";
import {
  executeExport,
  DEFAULT_EXPORT_COLUMNS,
  type ExportFormat,
} from "@/lib/backup/exportService";

/**
 * Datenexport (CSV, Excel, JSON) — bewusst getrennt von der Sicherung:
 * Ein Export ist eine **Auswahl** zum Weiterverarbeiten, eine Sicherung ist der
 * vollstaendige Bestand zum Wiedereinspielen. Ein Export kann eine Sicherung
 * nicht ersetzen; darauf weist der Bereich ausdruecklich hin.
 */
const FORMAT_HINTS: Record<ExportFormat, string> = {
  csv: "Öffnet sich in Numbers, Excel und Google Tabellen. Formeln in Textfeldern werden entschärft, damit sich beim Öffnen nichts ausführen kann.",
  xlsx: "Öffnet sich direkt in Numbers und Excel. Beträge sind echte Zahlen und Datumsangaben echte Datumswerte — man kann damit rechnen.",
  json: "Für eigene Auswertungen. Diese Datei lässt sich **nicht** wieder einspielen — dafür ist die Sicherung da.",
};

export default function ExportSection() {
  const { notify } = useToast();
  const [format, setFormat] = React.useState<ExportFormat>("csv");
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const result = await executeExport({
        format,
        includeArchived,
        columns: DEFAULT_EXPORT_COLUMNS,
      });

      if (result.success) {
        notify(`Export erstellt: ${result.fileName}`);
      } else {
        setError(result.error ?? "Der Export ist fehlgeschlagen.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Der Export ist fehlgeschlagen.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-5">
        <CardTitle>Daten exportieren</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="export-format">Format</Label>
          <Select
            id="export-format"
            value={format}
            onChange={(event) => {
              setFormat(event.target.value as ExportFormat);
            }}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (XLSX)</option>
            <option value="json">JSON</option>
          </Select>
          <p className="text-sm text-muted-foreground">{FORMAT_HINTS[format]}</p>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            checked={includeArchived}
            onChange={(event) => {
              setIncludeArchived(event.target.checked);
            }}
            disabled={isExporting}
          />
          Stornierte Eingänge einschließen
        </label>

        {isExporting && <ProgressIndicator progress={{ stage: "formatting" }} />}

        <Button onClick={() => void handleExport()} disabled={isExporting}>
          <Download />
          {isExporting ? "Wird erstellt …" : "Export herunterladen"}
        </Button>
      </CardContent>
    </Card>
  );
}
