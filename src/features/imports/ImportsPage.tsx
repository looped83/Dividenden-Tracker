import * as React from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { SkeletonRows } from "@/components/ui/skeleton";
import { Money } from "@/lib/money/money";
import { EUR } from "@/lib/money/currency";
import { formatMoney } from "@/lib/money/format";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { ImportWizard } from "@/features/imports/ImportWizard";
import { SnapshotRunsCard } from "@/features/securities/SnapshotRunsCard";
import {
  useDiscardImport,
  useImports,
  useRollbackImport,
} from "@/features/imports/hooks";
import type { Import } from "@/lib/supabase/repositories/imports";
import type { ImportStatus } from "@/lib/supabase/database.types";
import { formatTimestampDate } from "@/lib/utils/formatDate";

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

/**
 * Nicht abgeschlossene Importe — dieselben Status, die RLS loeschen laesst
 * (`imports_delete_draft_own`). Sie tragen keine Zahlungen.
 */
const DRAFT_STATUSES: ReadonlySet<ImportStatus> = new Set([
  "analyzing",
  "pending_confirmation",
  "discarded",
]);

function checksumTotal(imp: Import): string | null {
  const checksums = imp.checksums as { total_net?: string; row_count?: number } | null;
  if (!checksums?.total_net) return null;
  return formatMoney(Money.fromString(checksums.total_net, EUR));
}

export function ImportsPage() {
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const { data: imports = [], isLoading } = useImports();
  const rollback = useRollbackImport();
  const discard = useDiscardImport();
  const [actionError, setActionError] = React.useState("");

  async function handleRollback(imp: Import) {
    const checksums = imp.checksums as { row_count?: number } | null;
    const rows =
      checksums?.row_count === undefined
        ? "alle"
        : formatCountNumber(checksums.row_count);
    if (
      !window.confirm(
        `Diesen Import vollständig zurückrollen? ${rows} importierte Eingänge werden archiviert. ` +
          "Der Vorgang ist auditiert und der Importdatensatz bleibt als Historie erhalten.",
      )
    ) {
      return;
    }
    setActionError("");
    try {
      await rollback.mutateAsync(imp.id);
    } catch (err) {
      setActionError(getErrorMessage(err, "Rollback fehlgeschlagen."));
    }
  }

  async function handleDiscard(imp: Import) {
    setActionError("");
    try {
      await discard.mutateAsync(imp.id);
    } catch (err) {
      setActionError(getErrorMessage(err, "Der Entwurf konnte nicht gelöscht werden."));
    }
  }

  if (wizardOpen) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Import-Assistent</h2>
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Import</CardTitle>
          <Button
            size="sm"
            className="-my-2"
            onClick={() => {
              setWizardOpen(true);
            }}
          >
            <Plus /> Neuer Import
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionError && (
            <p role="alert" className="text-sm text-negative">
              {actionError}
            </p>
          )}

          {isLoading ? (
            <SkeletonRows rows={3} label="Importe" />
          ) : imports.length === 0 ? (
            <EmptyState
              title="Noch keine Importe"
              description="Starte einen Import, um historische Dividendeneingänge aus einer CSV- oder Excel-Datei zu übernehmen."
            />
          ) : (
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
                      {formatTimestampDate(imp.committed_at ?? imp.created_at)}
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
                      {/* Entwuerfe bleiben nach einem gescheiterten Import
                          zurueck; sie tragen keine Zahlungen und lassen sich
                          ohne Rueckfrage entfernen. */}
                      {DRAFT_STATUSES.has(imp.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Entwurf ${imp.file_name} löschen`}
                          onClick={() => void handleDiscard(imp)}
                          disabled={discard.isPending}
                        >
                          <Trash2 /> Löschen
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SnapshotRunsCard />
    </div>
  );
}
