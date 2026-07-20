import * as React from "react";
import { Link } from "react-router";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AmountText } from "@/components/money/AmountText";
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
import type { DividendPayment } from "@/lib/supabase/repositories/payments";
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
  const { data: payments = [], isLoading } = useAllPayments(true);
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
  const [stornoTarget, setStornoTarget] = React.useState<DividendPayment | null>(null);
  const [stornoReason, setStornoReason] = React.useState("");
  const [stornoError, setStornoError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DividendPayment | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const summaryOf = (p: DividendPayment): PaymentSummaryData => ({
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Datenqualität</h1>
        <p className="text-sm text-muted-foreground">
          Hinweise zu möglichen Dubletten und auffälligen Datensätzen. Es wird niemals
          automatisch storniert, gelöscht oder zusammengeführt — jede Entscheidung triffst
          du bewusst.
        </p>
      </div>

      {/* Übersicht (§17) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <OverviewTile label="Mögliche Dubletten" value={overview.duplicates} />
        <OverviewTile label="Auffällige Datensätze" value={overview.anomalies} />
        <OverviewTile label="Stornierte" value={overview.cancelled} />
        <OverviewTile label="Importe mit Änderung" value={overview.importedModified} />
        <OverviewTile label="Archivierte Unternehmen" value={overview.archivedCompany} />
        <OverviewTile label="Archivierte Depots" value={overview.archivedDepot} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : (
        <>
          {/* Dubletten (§16) */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Copy className="size-5" aria-hidden /> Mögliche Dubletten
            </h2>
            {duplicatePairs.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Keine möglichen Dubletten"
                description="Es wurden keine Zahlungen mit gleichem Unternehmen, Depot und Zahlungsdatum gefunden."
                className="py-8"
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
              <EmptyState
                icon={CheckCircle2}
                title="Keine Auffälligkeiten"
                className="py-8"
              />
            ) : (
              <ul className="space-y-2">
                {anomalies.map((anomaly) => (
                  <li
                    key={`${anomaly.payment.id}-${anomaly.code}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <div>
                      <Link
                        to={`/eingaenge/${anomaly.payment.id}`}
                        className="font-medium hover:underline"
                      >
                        {securityName(anomaly.payment.security_id)}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatDate(anomaly.payment.pay_date)}
                      </span>
                      <p className="text-muted-foreground">{anomaly.message}</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/eingaenge/${anomaly.payment.id}`}>Öffnen</Link>
                    </Button>
                  </li>
                ))}
              </ul>
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

function OverviewTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

interface DuplicateCardProps {
  pair: DuplicatePair<DividendPayment>;
  securityName: (id: string) => string;
  depotName: (id: string) => string;
  currencyOf: (id: string) => ReturnType<typeof toCurrencyCode>;
  onDismiss: () => void;
  onStorno: (payment: DividendPayment) => void;
  onDelete: (payment: DividendPayment) => void;
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
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
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
                  <span className="font-medium">{formatDate(p.pay_date)}</span>
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
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Keine Dublette
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
