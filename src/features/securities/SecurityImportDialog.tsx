import * as React from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseFirstWorksheet } from "@/lib/xlsx/parseWorkbook";
import {
  mapWorksheetToSecurities,
  type ImportedSecurityRow,
} from "@/features/securities/xlsxImport";
import { useCreateSecurity, useSecurities } from "@/features/securities/hooks";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import type { DataQuality } from "@/lib/supabase/database.types";

const QUALITY_LABELS: Record<
  DataQuality,
  { label: string; variant: "positive" | "warning" | "negative" }
> = {
  ok: { label: "OK", variant: "positive" },
  incomplete: { label: "Unvollständig", variant: "warning" },
  needs_review: { label: "Prüfen", variant: "negative" },
};

interface PreviewRow extends ImportedSecurityRow {
  isDuplicate: boolean;
}

type ImportState =
  | { step: "select" }
  | { step: "preview"; rows: PreviewRow[]; invalidCount: number }
  | { step: "importing"; total: number; done: number }
  | {
      step: "done";
      imported: number;
      skipped: number;
      failed: number;
      failures: string[];
    }
  | { step: "error"; message: string };

export function SecurityImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: existingSecurities = [] } = useSecurities();
  const createSecurity = useCreateSecurity();
  const [state, setState] = React.useState<ImportState>({ step: "select" });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) setState({ step: "select" });
    onOpenChange(nextOpen);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const table = await parseFirstWorksheet(file);
      const { valid, invalid } = mapWorksheetToSecurities(table);

      const existingIsins = new Set(
        existingSecurities.filter((s) => s.isin).map((s) => s.isin),
      );
      const existingNames = new Set(existingSecurities.map((s) => s.name.toLowerCase()));

      const rows: PreviewRow[] = valid.map((row) => ({
        ...row,
        isDuplicate:
          (row.isin !== null && existingIsins.has(row.isin)) ||
          existingNames.has(row.name.toLowerCase()),
      }));

      setState({ step: "preview", rows, invalidCount: invalid.length });
    } catch (error) {
      setState({
        step: "error",
        message: getErrorMessage(error, "Datei konnte nicht gelesen werden."),
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (state.step !== "preview") return;
    const toImport = state.rows.filter((row) => !row.isDuplicate);
    setState({ step: "importing", total: toImport.length, done: 0 });

    let imported = 0;
    const failures: string[] = [];
    for (const row of toImport) {
      try {
        await createSecurity.mutateAsync({
          name: row.name,
          ticker: row.ticker,
          isin: row.isin,
          wkn: row.wkn,
          country: row.country,
          data_quality: row.dataQuality,
        });
        imported += 1;
      } catch (error) {
        failures.push(`${row.name}: ${getErrorMessage(error, "unbekannter Fehler")}`);
      }
      setState((current) =>
        current.step === "importing" ? { ...current, done: current.done + 1 } : current,
      );
    }

    setState({
      step: "done",
      imported,
      skipped: state.rows.length - toImport.length,
      failed: failures.length,
      failures,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Unternehmen aus Excel importieren</DialogTitle>
          <DialogDescription>
            Liest Name, Ticker, ISIN und WKN aus der ersten Tabelle einer .xlsx-Datei.
            Andere Spalten (Stückzahl, Kurse, …) werden ignoriert.
          </DialogDescription>
        </DialogHeader>

        {state.step === "select" && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={(event) => void handleFileChange(event)}
              className="text-sm"
            />
          </div>
        )}

        {state.step === "error" && (
          <p role="alert" className="text-sm text-negative">
            {state.message}
          </p>
        )}

        {state.step === "preview" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {state.rows.length} gültige Zeile(n) erkannt, {state.invalidCount} ungültig
              (kein Name) übersprungen, {state.rows.filter((r) => r.isDuplicate).length}{" "}
              bereits vorhanden.
            </p>
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>ISIN</TableHead>
                    <TableHead>Land</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.rows.map((row) => (
                    <TableRow key={row.sourceRow}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.ticker ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.isin ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.country ?? "—"}
                      </TableCell>
                      <TableCell>
                        {row.isDuplicate ? (
                          <Badge variant="neutral">Bereits vorhanden</Badge>
                        ) : (
                          <Badge variant={QUALITY_LABELS[row.dataQuality].variant}>
                            {QUALITY_LABELS[row.dataQuality].label}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {state.step === "importing" && (
          <p className="text-sm text-muted-foreground">
            Wird importiert … ({state.done} / {state.total})
          </p>
        )}

        {state.step === "done" && (
          <div className="space-y-2 text-sm">
            <p>
              {state.imported} Unternehmen importiert, {state.skipped} übersprungen
              (bereits vorhanden)
              {state.failed > 0 ? `, ${state.failed.toString()} fehlgeschlagen` : ""}.
            </p>
            {state.failures.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-negative">
                {state.failures.map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          {state.step === "preview" && (
            <Button
              onClick={() => void handleImport()}
              disabled={state.rows.every((row) => row.isDuplicate)}
            >
              {state.rows.filter((r) => !r.isDuplicate).length} Unternehmen importieren
            </Button>
          )}
          {state.step === "done" && (
            <Button
              onClick={() => {
                handleClose(false);
              }}
            >
              Schließen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SecurityImportButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <FileSpreadsheet /> Aus Excel importieren
      </Button>
      <SecurityImportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
