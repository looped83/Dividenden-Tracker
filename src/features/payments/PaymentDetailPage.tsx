import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Ban, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AmountText } from "@/components/money/AmountText";
import { AuditTrail } from "@/components/audit/AuditTrail";
import { Money, toCurrencyCode, toGermanDecimalString } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  fetchImportById,
  fetchImportRowForPayment,
} from "@/lib/supabase/repositories/imports";
import {
  useArchivePayment,
  useDeletePayment,
  usePayment,
  useUnarchivePayment,
} from "@/features/payments/hooks";
import {
  formatDate,
  formatDateTime,
  isImported,
  sourceLabel,
} from "@/features/payments/paymentDisplay";
import {
  DeleteDialog,
  StornoDialog,
  type PaymentSummaryData,
} from "@/features/payments/dialogs";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: payment, isLoading, isError } = usePayment(id);
  const { data: depots = [] } = useDepots();
  const { data: securities = [] } = useSecurities();
  const archivePayment = useArchivePayment();
  const unarchivePayment = useUnarchivePayment();
  const deletePayment = useDeletePayment();

  const [stornoOpen, setStornoOpen] = React.useState(false);
  const [stornoReason, setStornoReason] = React.useState("");
  const [stornoError, setStornoError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Provenance importierter Eingänge (§6): Herkunftszeile + Importlauf.
  const imported = payment ? isImported(payment.source) : false;
  const { data: importRow } = useQuery({
    queryKey: ["payments", "import-row", id],
    queryFn: () => fetchImportRowForPayment(id ?? ""),
    enabled: Boolean(id) && imported,
  });
  const { data: importRun } = useQuery({
    queryKey: ["payments", "import-run", payment?.import_id],
    queryFn: () => fetchImportById(payment?.import_id ?? ""),
    enabled: Boolean(payment?.import_id),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Wird geladen …</p>;
  }

  // Kontrollierter Nicht-gefunden-Zustand (§6): auch nach dauerhafter Löschung
  // zeigt die Detailroute keinen veralteten Datensatz mehr.
  if (isError || !payment) {
    return (
      <div className="max-w-2xl space-y-6">
        <EmptyState
          icon={Trash2}
          title="Dividendeneingang nicht gefunden"
          description="Dieser Dividendeneingang existiert nicht (mehr). Möglicherweise wurde er dauerhaft gelöscht."
          action={
            <Button asChild>
              <Link to="/eingaenge">Zurück zur Übersicht</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const depot = depots.find((d) => d.id === payment.depot_id);
  const security = securities.find((s) => s.id === payment.security_id);
  const currency = toCurrencyCode(depot?.base_currency ?? "EUR");
  const cancelled = Boolean(payment.archived_at);

  const summary: PaymentSummaryData = {
    company: security?.name ?? "—",
    depot: depot?.name ?? "—",
    payDate: payment.pay_date,
    amount: <AmountText amount={Money.fromString(payment.net_amount, currency)} />,
    source: sourceLabel(payment.source),
  };

  // Vergleich Ursprungswert ↔ aktueller Wert (§6): weicht der gespeicherte Wert
  // vom normalisierten Importwert ab, liegt eine spätere manuelle Änderung vor.
  const normalized = (importRow?.normalized ?? null) as Record<string, unknown> | null;
  const rawNet = normalized?.["net_amount"];
  const importedNet =
    typeof rawNet === "string" || typeof rawNet === "number" ? String(rawNet) : null;
  const rawPayDate = normalized?.["pay_date"];
  const importedPayDate = typeof rawPayDate === "string" ? rawPayDate : null;
  const netChanged = importedNet !== null && importedNet !== payment.net_amount;
  const dateChanged = importedPayDate !== null && importedPayDate !== payment.pay_date;

  const handleStorno = async () => {
    setStornoError(null);
    try {
      await archivePayment.mutateAsync({
        id: payment.id,
        reason: stornoReason || undefined,
      });
      setStornoOpen(false);
      setStornoReason("");
    } catch (error) {
      setStornoError(
        getErrorMessage(error, "Der Dividendeneingang konnte nicht storniert werden."),
      );
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(payment.id);
      void navigate("/eingaenge");
    } catch (error) {
      setDeleteError(
        getErrorMessage(
          error,
          "Der Dividendeneingang konnte nicht gelöscht werden. Die Daten wurden nicht verändert.",
        ),
      );
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {security?.name ?? "Dividendeneingang"}
          </h1>
          <p className="text-sm text-muted-foreground">{formatDate(payment.pay_date)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cancelled ? (
            <Badge variant="warning">Storniert</Badge>
          ) : (
            <Badge variant="positive">Aktiv</Badge>
          )}
          {!cancelled && (
            <Button variant="outline" size="icon" asChild aria-label="Bearbeiten">
              <Link to={`/eingaenge/${payment.id}/bearbeiten`}>
                <Pencil />
              </Link>
            </Button>
          )}
          {cancelled ? (
            <Button
              variant="outline"
              size="icon"
              aria-label="Reaktivieren"
              onClick={() => {
                void unarchivePayment.mutateAsync(payment.id);
              }}
            >
              <RotateCcw />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              aria-label="Stornieren"
              onClick={() => {
                setStornoReason("");
                setStornoError(null);
                setStornoOpen(true);
              }}
            >
              <Ban />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Dauerhaft löschen"
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailRow label="Zahlungsdatum">{formatDate(payment.pay_date)}</DetailRow>
          <DetailRow label="Unternehmen">
            {security?.name ?? "—"}
            {security?.archived_at ? " (archiviert)" : ""}
          </DetailRow>
          <DetailRow label="Depot">
            {depot?.name ?? "—"}
            {depot?.archived_at ? " (archiviert)" : ""}
          </DetailRow>
          <DetailRow label="Nettobetrag">
            <AmountText amount={Money.fromString(payment.net_amount, currency)} />
          </DetailRow>
          <DetailRow label="Währung">{payment.original_currency}</DetailRow>
          <DetailRow label="Status">{cancelled ? "Storniert" : "Aktiv"}</DetailRow>
          <DetailRow label="Datenquelle">{sourceLabel(payment.source)}</DetailRow>
          {payment.note && <DetailRow label="Notiz">{payment.note}</DetailRow>}
          <DetailRow label="Erstellt">{formatDateTime(payment.created_at)}</DetailRow>
          <DetailRow label="Zuletzt geändert">
            {formatDateTime(payment.updated_at)}
          </DetailRow>
          {cancelled && payment.archived_at && (
            <DetailRow label="Storniert am">
              {formatDateTime(payment.archived_at)}
            </DetailRow>
          )}
          {cancelled && payment.archive_reason && (
            <DetailRow label="Stornogrund">{payment.archive_reason}</DetailRow>
          )}
        </CardContent>
      </Card>

      {imported && (
        <Card>
          <CardHeader>
            <CardTitle>Importherkunft</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Importdatei">
              {payment.source_file_name ?? importRun?.file_name ?? "—"}
            </DetailRow>
            {payment.import_id && (
              <DetailRow label="Import-ID">
                <span className="font-mono text-xs">{payment.import_id}</span>
              </DetailRow>
            )}
            {importRun?.committed_at && (
              <DetailRow label="Importiert am">
                {formatDateTime(importRun.committed_at)}
              </DetailRow>
            )}
            {payment.source_row_number !== null && (
              <DetailRow label="Ursprüngliche Zeile">
                {payment.source_row_number}
              </DetailRow>
            )}
            {importedNet !== null && (
              <DetailRow label="Importierter Nettobetrag">
                {toGermanDecimalString(importedNet)}
                {netChanged && (
                  <span className="ml-2 text-warning-foreground">
                    (nachträglich geändert)
                  </span>
                )}
              </DetailRow>
            )}
            {importedPayDate !== null && (
              <DetailRow label="Importiertes Zahlungsdatum">
                {formatDate(importedPayDate)}
                {dateChanged && (
                  <span className="ml-2 text-warning-foreground">
                    (nachträglich geändert)
                  </span>
                )}
              </DetailRow>
            )}
            {(netChanged || dateChanged) && (
              <p className="pt-2 text-sm text-muted-foreground">
                Dieser importierte Eingang wurde nach dem Import manuell angepasst. Die
                Importherkunft bleibt dennoch erhalten.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Änderungsverlauf</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTrail entityType="dividend_payment" entityId={payment.id} />
        </CardContent>
      </Card>

      <StornoDialog
        open={stornoOpen}
        onOpenChange={setStornoOpen}
        summary={summary}
        reason={stornoReason}
        onReasonChange={setStornoReason}
        error={stornoError}
        isPending={archivePayment.isPending}
        onConfirm={() => void handleStorno()}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        summary={summary}
        error={deleteError}
        isPending={deletePayment.isPending}
        onConfirm={() => void handleDelete()}
      />

      <Button variant="ghost" onClick={() => void navigate("/eingaenge")}>
        Zurück zur Übersicht
      </Button>
    </div>
  );
}
