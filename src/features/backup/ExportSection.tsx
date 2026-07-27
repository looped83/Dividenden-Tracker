/**
 * Export Section
 *
 * Allows users to export dividend data in various formats (CSV, Excel, JSON).
 * Provides options for filtering and column selection.
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
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  executeExport,
  DEFAULT_EXPORT_COLUMNS,
  type ExportFormat,
  type ExportOptions,
} from "@/lib/backup/exportService";
import ProgressIndicator from "@/components/backup/ProgressIndicator";
import { AlertCircle, CheckCircle, Download } from "lucide-react";

export default function ExportSection() {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setSuccess(false);

    try {
      const options: ExportOptions = {
        format,
        includeArchived,
        columns: DEFAULT_EXPORT_COLUMNS,
      };

      const result = await executeExport(options);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 5000);
      } else {
        setError(result.error || "Export failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error during export");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Daten exportieren</CardTitle>
          <CardDescription>
            Exportieren Sie Ihre Dividendenzahlungen in verschiedenen Formaten für weitere
            Analyse oder Archivierung.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Alerts */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Daten erfolgreich exportiert!
              </AlertDescription>
            </Alert>
          )}

          {/* Format Selection */}
          <div className="space-y-3">
            <Label htmlFor="format" className="text-base font-semibold">
              Exportformat
            </Label>
            <Select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="csv">CSV - Kommagetrennte Werte</option>
              <option value="xlsx">Excel - Microsoft Excel Format</option>
              <option value="json">JSON - Strukturiertes Format</option>
            </Select>
          </div>

          {/* Progress */}
          {isExporting && <ProgressIndicator progress={{ stage: "formatting" }} />}

          {/* Options */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Optionen</Label>
            <div className="flex items-center space-x-3">
              <Checkbox
                id="include-archived"
                checked={includeArchived}
                onCheckedChange={(checked: boolean | "indeterminate") =>
                  setIncludeArchived(typeof checked === "boolean" ? checked : false)
                }
                disabled={isExporting}
              />
              <Label htmlFor="include-archived" className="font-normal cursor-pointer">
                Auch archivierte Zahlungen einschließen
              </Label>
            </div>
          </div>

          {/* Export Button */}
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full"
            size="lg"
          >
            {isExporting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Wird exportiert...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {format === "csv" && "Als CSV exportieren"}
                {format === "xlsx" && "Als Excel exportieren"}
                {format === "json" && "Als JSON exportieren"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Format Information */}
      {format === "csv" && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>CSV-Format:</strong> Kann in Excel, Google Sheets oder anderen
              Tabellenkalkulationsprogrammen geöffnet werden. Formelinjektionen werden
              automatisch verhindert.
            </p>
          </CardContent>
        </Card>
      )}

      {format === "xlsx" && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>Excel-Format:</strong> Nativ in Microsoft Excel oder Apple Numbers
              öffbar. Zahlenformate werden korrekt beibehalten.
            </p>
          </CardContent>
        </Card>
      )}

      {format === "json" && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>JSON-Format:</strong> Strukturiertes Format für Datenanalyse und
              Integration mit anderen Tools. Diese Dateien können nicht direkt in die
              Anwendung importiert werden.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
