import * as React from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section, SectionButton } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
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
        `Diesen Import vollständig zurückrollen? ${rows} importierte Dividenden werden archiviert. ` +
          "Der Importdatensatz bleibt als Historie erhalten.",
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

  const actionsFor = (imp: Import) => (
    <>
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
    </>
  );

  if (wizardOpen) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Import-Assistent</h2>
          <p className="text-sm text-muted-foreground">
            CSV-/Excel-Import historischer Dividenden.
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
    // Ab `lg` nebeneinander, Depotstände links: Beide Listen sind kurz,
    // untereinander blieb rechts die halbe Fläche leer. Auf dem Telefon bleibt
    // die bisherige Reihenfolge, der Import steht oben. Die Importe stehen
    // deshalb überall als Liste — fünf Spalten passten in keine halbe Breite.
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-x-16">
      <Section
        title="Import"
        action={
          <SectionButton
            icon={Plus}
            onClick={() => {
              setWizardOpen(true);
            }}
          >
            Neuer Import
          </SectionButton>
        }
      >
        <div className="space-y-3">
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
              description="Starte einen Import, um historische Dividenden aus einer CSV- oder Excel-Datei zu übernehmen."
            />
          ) : (
            <ListGroup aria-label="Importe">
              {imports.map((imp) => (
                <li key={imp.id}>
                  <ListRow className="items-start">
                    <ListItemBody
                      title={imp.file_name}
                      meta={
                        <>
                          <Badge variant={STATUS_LABELS[imp.status].variant}>
                            {STATUS_LABELS[imp.status].label}
                          </Badge>
                          <span>
                            {formatTimestampDate(imp.committed_at ?? imp.created_at)}
                          </span>
                        </>
                      }
                      trailing={checksumTotal(imp) ?? undefined}
                    />
                  </ListRow>
                  {(imp.status === "committed" || DRAFT_STATUSES.has(imp.status)) && (
                    <div className="-mt-1 flex justify-end px-3 pb-3">
                      {actionsFor(imp)}
                    </div>
                  )}
                </li>
              ))}
            </ListGroup>
          )}
        </div>
      </Section>

      <SnapshotRunsCard className="lg:order-first" />
    </div>
  );
}
