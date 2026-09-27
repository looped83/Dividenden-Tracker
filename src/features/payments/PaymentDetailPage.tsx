import * as React from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Ban, ChevronDown, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AmountText } from "@/components/money/AmountText";
import { DateText } from "@/components/DateText";
import { AuditTrail } from "@/components/audit/AuditTrail";
import { Money, toCurrencyCode, toGermanDecimalString } from "@/lib/money";
import { cn } from "@/lib/utils/cn";
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
import { isImported, sourceLabel } from "@/features/payments/paymentDisplay";
import { formatCalendarDate, formatTimestamp } from "@/lib/utils/formatDate";
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
  // Die Liste gibt ihre Adresse samt Filter und Seite mit. Zurueck, nach dem
  // Loeschen und nach dem Bearbeiten geht es dorthin — auf dem Telefon laufen
  // alle Aktionen ueber diese Seite, und die Liste soll danach dort stehen,
  // wo man sie verlassen hat. Direkt aufgerufen bleibt es die ganze Liste.
  const from = (useLocation().state as { from?: string } | null)?.from;
  const listUrl = from ?? "/eingaenge";
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
  const [historyOpen, setHistoryOpen] = React.useState(false);

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

  // Der Rueckweg steht oben, nicht am Seitenende: Auf einer langen Detailseite
  // ist ein Zurueck unter dem letzten Abschnitt praktisch unauffindbar, und die
  // Ziel- und Unternehmensseiten fuehren ihn ohnehin oben. Eine Anordnung fuer
  // dieselbe Handlung statt dreier.
  const backLink = <DetailBackLink to={listUrl} label="Zu den Dividenden" />;

  if (isLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageSkeleton />
      </div>
    );
  }

  // Kontrollierter Nicht-gefunden-Zustand (§6): auch nach dauerhafter Löschung
  // zeigt die Detailroute keinen veralteten Datensatz mehr.
  if (isError || !payment) {
    return (
      <div className="max-w-2xl space-y-6">
        {backLink}
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
    // Bewusst reiner Text: `summary` speist die Bestaetigungsdialoge, und ein
    // Link, der aus einem Bestaetigungsdialog herausfuehrt, ist eine Falle.
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
      void navigate(listUrl);
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
    <div className="space-y-6">
      {/* Nur der Ausnahmezustand traegt ein Abzeichen: „Aktiv" ist der
          Normalfall und sagte nichts, was die Seite nicht ohnehin zeigt. Datum,
          Depot und Betrag stehen im Kopf — die Karte „Details" wiederholt sie
          nicht mehr. */}
      <DetailHeader
        back={backLink}
        actions={
          <>
            {!cancelled && (
              <Button variant="outline" size="icon" asChild aria-label="Bearbeiten">
                <Link
                  to={`/eingaenge/${payment.id}/bearbeiten`}
                  state={from ? { from } : undefined}
                >
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
          </>
        }
        title={security?.name ?? "Dividendeneingang"}
        badge={cancelled ? <Badge variant="warning">Storniert</Badge> : undefined}
        subtitle={
          <>
            <DateText>{formatCalendarDate(payment.pay_date)}</DateText>
            <span>·</span>
            <span>
              {depot?.name ?? "—"}
              {depot?.archived_at ? " (archiviert)" : ""}
            </span>
          </>
        }
        figure={<AmountText amount={Money.fromString(payment.net_amount, currency)} />}
      />

      {/* Zwei Spalten ab `lg` statt einer schmalen Saeule: Die Seite war als
          einzige auf `max-w-2xl` begrenzt und wirkte neben den uebrigen
          Bereichen wie ein Fremdkoerper. Sie schlicht breitzuziehen haette
          aber nur sehr lange Beschriftungszeilen erzeugt — nebeneinander
          fuellen die Karten die Breite und bleiben lesbar.

          Welche Karte wo landet, haengt davon ab, ob es eine Importherkunft
          gibt: Mit ihr stehen Details und Herkunft nebeneinander und der
          Verlauf darunter ueber beide Spalten; ohne sie ruecken Details und
          Verlauf nebeneinander. So bleibt in keinem Fall eine halbe Seite
          leer. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Unternehmen">
              {/* Von einer einzelnen Zahlung zur Entwicklung der ganzen
                Position — die Detailseite des Unternehmens. */}
              {security ? (
                <Link
                  to={`/depot/${security.id}`}
                  className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {security.name}
                  {security.archived_at ? " (archiviert)" : ""}
                </Link>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Währung">{payment.original_currency}</DetailRow>
            <DetailRow label="Datenquelle">{sourceLabel(payment.source)}</DetailRow>
            {payment.note && <DetailRow label="Notiz">{payment.note}</DetailRow>}
            <DetailRow label="Erstellt">{formatTimestamp(payment.created_at)}</DetailRow>
            <DetailRow label="Zuletzt geändert">
              {formatTimestamp(payment.updated_at)}
            </DetailRow>
            {cancelled && payment.archived_at && (
              <DetailRow label="Storniert am">
                {formatTimestamp(payment.archived_at)}
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
                  {formatTimestamp(importRun.committed_at)}
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
                    <span className="ml-2 text-warning-strong">
                      (nachträglich geändert)
                    </span>
                  )}
                </DetailRow>
              )}
              {importedPayDate !== null && (
                <DetailRow label="Importiertes Zahlungsdatum">
                  {formatCalendarDate(importedPayDate)}
                  {dateChanged && (
                    <span className="ml-2 text-warning-strong">
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

        <Card className={imported ? "lg:col-span-2" : undefined}>
          {/* Eingeklappt: Der Verlauf ist Nachschlagewerk, keine Kernaussage.
              Er wird erst beim Aufklappen gerendert und damit auch erst dann
              geladen — die Seite spart die Abfrage, solange niemand fragt. */}
          <CardHeader className="p-0 sm:p-0">
            <CardTitle>
              <button
                type="button"
                aria-expanded={historyOpen}
                aria-controls="payment-history"
                onClick={() => {
                  setHistoryOpen((open) => !open);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
              >
                Änderungsverlauf
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                    historyOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            </CardTitle>
          </CardHeader>
          {historyOpen && (
            <CardContent id="payment-history">
              <AuditTrail entityType="dividend_payment" entityId={payment.id} />
            </CardContent>
          )}
        </Card>
      </div>

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
    </div>
  );
}
