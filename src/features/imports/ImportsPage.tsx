import * as React from "react";
import { Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/lib/money/money";
import { EUR } from "@/lib/money/currency";
import { formatMoney } from "@/lib/money/format";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { ImportWizard } from "@/features/imports/ImportWizard";
import { useImports, useRollbackImport } from "@/features/imports/hooks";
import type { Import } from "@/lib/supabase/repositories/imports";
import type { ImportStatus } from "@/lib/supabase/database.types";

const STATUS_LABELS: Record<
  ImportStatus,
  { label: string; variant: "positive" | "warning" | "negative" | "neutral" }
> = {
  analyzing: { label: "In Analyse", variant: "neutral" },
  pending_confirmation: { label: "Wartet auf Bestätigung", variant: "warning" },
  committed: { label: "Abgeschlossen", variant: "positive" },
  rolled_back: { label: "Zurückgerollt", variant: "neutral" },
  discarded: { label: "Verworfen", variant: "neutral" },
};

function checksumTotal(imp: Import): string | null {
  const checksums = imp.checksums as { total_net?: string; row_count?: number } | null;
  if (!checksums?.total_net) return null;
  return formatMoney(Money.fromString(checksums.total_net, EUR));
}

export function ImportsPage() {
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const { data: imports = [], isLoading } = useImports();
  const rollback = useRollbackImport();
  const [rollbackError, setRollbackError] = React.useState("");

  async function handleRollback(imp: Import) {
    const checksums = imp.checksums as { row_count?: number } | null;
    const rows = checksums?.row_count ?? "alle";
    if (
      !window.confirm(
        `Diesen Import vollständig zurückrollen? ${String(rows)} importierte Eingänge werden archiviert. ` +
          "Der Vorgang ist auditiert und der Importdatensatz bleibt als Historie erhalten.",
      )
    ) {
      return;
    }
    setRollbackError("");
    try {
      await rollback.mutateAsync(imp.id);
    } catch (err) {
      setRollbackError(getErrorMessage(err, "Rollback fehlgeschlagen."));
    }
  }

  if (wizardOpen) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4">
        <div>
          <h1 className="text-xl font-semibold">Import-Assistent</h1>
          <p className="text-sm text-muted-foreground">
            CSV-/Excel-Import historischer Dividendeneingänge (IMPORT_SPEC.md).
          </p>
        </div>
        <ImportWizard
          onFinished={() => {
            setWizardOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Importe</h1>
          <p className="text-sm text-muted-foreground">
            Sicherer, nachvollziehbarer und rückrollbarer Import historischer
            Dividendendaten.
          </p>
        </div>
        <Button
          onClick={() => {
            setWizardOpen(true);
          }}
        >
          <Plus /> Neuer Import
        </Button>
      </div>

      {rollbackError && (
        <p role="alert" className="text-sm text-negative">
          {rollbackError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : imports.length === 0 ? (
        <EmptyState
          title="Noch keine Importe"
          description="Starte einen Import, um historische Dividendeneingänge aus einer CSV- oder Excel-Datei zu übernehmen."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importhistorie</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datei</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Summe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell className="font-medium">{imp.file_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(imp.committed_at ?? imp.created_at).toLocaleDateString(
                        "de-DE",
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {checksumTotal(imp) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_LABELS[imp.status].variant}>
                        {STATUS_LABELS[imp.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {imp.status === "committed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRollback(imp)}
                          disabled={rollback.isPending}
                        >
                          <RotateCcw /> Rollback
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
