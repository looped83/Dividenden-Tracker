import * as React from "react";
import { Link } from "react-router";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { AmountText } from "@/components/money/AmountText";
import { DateText } from "@/components/DateText";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { Money, toCurrencyCode } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  useAllPayments,
  useArchivePayment,
  useDeletePayment,
  useDismissDuplicate,
  useDuplicateDismissals,
} from "@/features/payments/hooks";
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";
import {
  detectAnomalies,
  findDuplicatePairs,
  type DuplicatePair,
} from "@/lib/payments/dataQuality";
import { todayIso } from "@/features/payments/schemas";
import { formatDate, formatDateTime, isImported, sourceLabel } from "./paymentDisplay";
import { DeleteDialog, StornoDialog, type PaymentSummaryData } from "./dialogs";

export function DataQualityPage() {
  const { data: securities = [] } = useSecurities();
  const { data: depots = [] } = useDepots();
  const { data: payments = [], isLoading } = useAllPayments();
  const { data: dismissedKeys = [] } = useDuplicateDismissals();
  const dismiss = useDismissDuplicate();
  const archivePayment = useArchivePayment();
  const deletePayment = useDeletePayment();

  const securityName = React.useCallback(
    (secId: string) => securities.find((s) => s.id === secId)?.name ?? "—",
    [securities],
  );
  const depotName = React.useCallback(
    (depId: string) => depots.find((d) => d.id === depId)?.name ?? "—",
    [depots],
  );
  const currencyOf = React.useCallback(
    (depId: string) =>
      toCurrencyCode(depots.find((d) => d.id === depId)?.base_currency ?? "EUR"),
    [depots],
  );

  const dismissedSet = React.useMemo(() => new Set(dismissedKeys), [dismissedKeys]);
  const duplicatePairs = React.useMemo(
    () => findDuplicatePairs(payments, dismissedSet),
    [payments, dismissedSet],
  );
  const anomalies = React.useMemo(
    () => detectAnomalies(payments, todayIso()),
    [payments],
  );

  // Übersichtszahlen (§17). Archivierte Zuordnungen sind kein Fehler, nur Hinweis.
  const overview = React.useMemo(() => {
    const active = payments.filter((p) => !p.archived_at);
    const cancelled = payments.filter((p) => p.archived_at);
    const archivedSecurityIds = new Set(
      securities.filter((s) => s.archived_at).map((s) => s.id),
    );
    const archivedDepotIds = new Set(
      depots.filter((d) => d.archived_at).map((d) => d.id),
    );
    return {
      duplicates: duplicatePairs.length,
      anomalies: anomalies.length,
      cancelled: cancelled.length,
      importedModified: active.filter(
        (p) => isImported(p.source) && p.updated_at !== p.created_at,
      ).length,
      archivedCompany: active.filter((p) => archivedSecurityIds.has(p.security_id))
        .length,
      archivedDepot: active.filter((p) => archivedDepotIds.has(p.depot_id)).length,
    };
  }, [payments, securities, depots, duplicatePairs.length, anomalies.length]);

  // Aktionsziele für die geteilten Dialoge.
  const [stornoTarget, setStornoTarget] = React.useState<PaymentListRow | null>(null);
  const [stornoReason, setStornoReason] = React.useState("");
  const [stornoError, setStornoError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<PaymentListRow | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const summaryOf = (p: PaymentListRow): PaymentSummaryData => ({
    company: securityName(p.security_id),
    depot: depotName(p.depot_id),
    payDate: p.pay_date,
    amount: (
      <AmountText amount={Money.fromString(p.net_amount, currencyOf(p.depot_id))} />
    ),
    source: sourceLabel(p.source),
  });

  const handleStorno = async () => {
    if (!stornoTarget) return;
    setStornoError(null);
    try {
      await archivePayment.mutateAsync({
        id: stornoTarget.id,
        reason: stornoReason || undefined,
      });
      setStornoTarget(null);
      setStornoReason("");
    } catch (error) {
      setStornoError(
        getErrorMessage(error, "Der Dividendeneingang konnte nicht storniert werden."),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deletePayment.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
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
      {/* Ein Unterbereich der Dividendenliste — mit Rueckweg dorthin, wie eine
          Detailseite. Ohne ihn fuehrte auf dem Telefon nur die Navigation
          zurueck. */}
      <DetailHeader
        back={<DetailBackLink to="/eingaenge" label="Zu den Dividenden" />}
        title="Datenqualität"
      />

      {/* Übersicht (§17) — eine Karte statt sechs: Die Zahlen sind meist null
          und brauchten als einzelne Kacheln untereinander einen ganzen
          Bildschirm. */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            <OverviewItem label="Mögliche Dubletten" value={overview.duplicates} />
            <OverviewItem label="Auffällige Datensätze" value={overview.anomalies} />
            <OverviewItem label="Stornierte" value={overview.cancelled} />
            <OverviewItem
              label="Importe mit Änderung"
              value={overview.importedModified}
            />
            <OverviewItem
              label="Archivierte Unternehmen"
              value={overview.archivedCompany}
            />
            <OverviewItem label="Archivierte Depots" value={overview.archivedDepot} />
          </dl>
        </CardContent>
      </Card>

      {isLoading ? (
        <PageSkeleton header={false} />
      ) : (
        <>
          {/* Dubletten (§16) */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Copy className="size-5" aria-hidden /> Mögliche Dubletten
            </h2>
            {duplicatePairs.length === 0 ? (
              <AllClear
                title="Keine möglichen Dubletten"
                description="Keine Zahlungen mit gleichem Unternehmen, Depot und Zahlungsdatum."
              />
            ) : (
              <ul className="space-y-4">
                {duplicatePairs.map((pair) => (
                  <DuplicateCard
                    key={pair.key}
                    pair={pair}
                    securityName={securityName}
                    depotName={depotName}
                    currencyOf={currencyOf}
                    onDismiss={() => {
                      dismiss.mutate({ idA: pair.a.id, idB: pair.b.id });
                    }}
                    onStorno={(p) => {
                      setStornoReason("");
                      setStornoError(null);
                      setStornoTarget(p);
                    }}
                    onDelete={(p) => {
                      setDeleteError(null);
                      setDeleteTarget(p);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Auffällige Datensätze (§18) */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <AlertTriangle className="size-5" aria-hidden /> Auffällige Datensätze
            </h2>
            {anomalies.length === 0 ? (
              <AllClear title="Keine Auffälligkeiten" />
            ) : (
              // Dieselbe Listenform wie die Eingaenge: eine Zeile je Befund, die
              // als Ganzes zum Eingang fuehrt — statt Name als Link und einer
              // zweiten Schaltflaeche „Öffnen" mit demselben Ziel.
              <ListGroup>
                {anomalies.map((anomaly) => (
                  <li key={`${anomaly.payment.id}-${anomaly.code}`}>
                    <ListRow asChild>
                      <Link to={`/eingaenge/${anomaly.payment.id}`}>
                        <ListItemBody
                          title={securityName(anomaly.payment.security_id)}
                          meta={
                            <>
                              <DateText className="shrink-0">
                                {formatDate(anomaly.payment.pay_date)}
                              </DateText>
                              <span className="basis-full">{anomaly.message}</span>
                            </>
                          }
                          chevron
                        />
                      </Link>
                    </ListRow>
                  </li>
                ))}
              </ListGroup>
            )}
          </section>
        </>
      )}

      <StornoDialog
        open={stornoTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStornoTarget(null);
        }}
        summary={stornoTarget ? summaryOf(stornoTarget) : null}
        reason={stornoReason}
        onReasonChange={setStornoReason}
        error={stornoError}
        isPending={archivePayment.isPending}
        onConfirm={() => void handleStorno()}
      />

      <DeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        summary={deleteTarget ? summaryOf(deleteTarget) : null}
        error={deleteError}
        isPending={deletePayment.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

/**
 * „Nichts zu tun" als eine Zeile statt als grosser Leerzustand: Die Zahl steht
 * schon in der Uebersicht darueber, und zwei leere Kaesten schoben auf dem
 * Telefon die Seite um einen Bildschirm in die Laenge.
 */
function AllClear({ title, description }: { title: string; description?: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
      <span>
        <span className="font-medium">{title}</span>
        {description && <span className="text-muted-foreground"> — {description}</span>}
      </span>
    </p>
  );
}

function OverviewItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{formatCountNumber(value)}</dd>
    </div>
  );
}

interface DuplicateCardProps {
  pair: DuplicatePair<PaymentListRow>;
  securityName: (id: string) => string;
  depotName: (id: string) => string;
  currencyOf: (id: string) => ReturnType<typeof toCurrencyCode>;
  onDismiss: () => void;
  onStorno: (payment: PaymentListRow) => void;
  onDelete: (payment: PaymentListRow) => void;
}

function DuplicateCard({
  pair,
  securityName,
  depotName,
  currencyOf,
  onDismiss,
  onStorno,
  onDelete,
}: DuplicateCardProps) {
  return (
    <li>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{securityName(pair.a.security_id)}</CardTitle>
          <Badge variant={pair.category === "high" ? "negative" : "warning"}>
            {pair.category === "high" ? "Hohe Wahrscheinlichkeit" : "Mögliche Dublette"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {[pair.a, pair.b].map((p) => (
              <div key={p.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <DateText className="font-medium">{formatDate(p.pay_date)}</DateText>
                  <AmountText
                    amount={Money.fromString(p.net_amount, currencyOf(p.depot_id))}
                  />
                </div>
                <p className="text-muted-foreground">{depotName(p.depot_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {sourceLabel(p.source)} · erstellt {formatDateTime(p.created_at)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/eingaenge/${p.id}`}>Öffnen</Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onStorno(p);
                    }}
                  >
                    Stornieren
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onDelete(p);
                    }}
                  >
                    Löschen
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="-mr-3" onClick={onDismiss}>
              Keine Dublette
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
