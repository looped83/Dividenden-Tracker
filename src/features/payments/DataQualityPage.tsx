import * as React from "react";
import { Link } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { Disclosure } from "@/components/ui/disclosure";
import { useToast } from "@/components/ui/toast";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { AmountText } from "@/components/money/AmountText";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { formatCalendarDate, formatTimestamp } from "@/lib/utils/formatDate";
import { Money, toCurrencyCode } from "@/lib/money";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import {
  useAllPayments,
  useAnomalyReviews,
  useArchivePayment,
  useDeletePayment,
  useDismissDuplicate,
  useDuplicateDismissals,
  useReviewAnomaly,
  useUndismissDuplicate,
} from "@/features/payments/hooks";
import type { PaymentListRow } from "@/lib/supabase/repositories/payments";
import {
  detectAnomalies,
  findDuplicatePairs,
  type Anomaly,
  type DuplicatePair,
} from "@/lib/payments/dataQuality";
import { isoFromRef } from "@/lib/statistics";
import { useToday } from "@/lib/hooks/useToday";
import { isImported, sourceLabel } from "./paymentDisplay";
import { DeleteDialog, StornoDialog, type PaymentSummaryData } from "./dialogs";

export function DataQualityPage() {
  const { data: securities = [] } = useSecurities();
  const { data: depots = [] } = useDepots();
  const { data: payments = [], isLoading } = useAllPayments();
  const { data: dismissedKeys = [] } = useDuplicateDismissals();
  const dismiss = useDismissDuplicate();
  const undismiss = useUndismissDuplicate();
  const { data: reviewedKeys = [] } = useAnomalyReviews();
  const reviewAnomaly = useReviewAnomaly();
  const { notify } = useToast();
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

  // Einmal ohne Ausblendung erkennen, dann aufteilen: offene Paare stehen oben,
  // bewusst als „keine Dublette" markierte eingeklappt darunter — dort laesst
  // sich die Markierung zuruecknehmen. Markierungen, deren Paar nicht mehr als
  // Dublette gilt (storniert, geloescht, geaendert), erscheinen nicht.
  const { duplicatePairs, dismissedPairs } = React.useMemo(() => {
    const dismissedSet = new Set(dismissedKeys);
    const all = findDuplicatePairs(payments);
    return {
      duplicatePairs: all.filter((pair) => !dismissedSet.has(pair.key)),
      dismissedPairs: all.filter((pair) => dismissedSet.has(pair.key)),
    };
  }, [payments, dismissedKeys]);
  const today = isoFromRef(useToday());
  // Wie bei den Dubletten: offene Befunde oben, als geprüft markierte
  // eingeklappt darunter. Eine Markierung, deren Befund nicht mehr besteht
  // (Betrag korrigiert, storniert, gelöscht), erscheint nicht.
  const { anomalies, reviewedAnomalies } = React.useMemo(() => {
    const reviewedSet = new Set(reviewedKeys);
    const all = detectAnomalies(payments, today);
    return {
      anomalies: all.filter((anomaly) => !reviewedSet.has(anomaly.key)),
      reviewedAnomalies: all.filter((anomaly) => reviewedSet.has(anomaly.key)),
    };
  }, [payments, today, reviewedKeys]);

  // Übersichtszahlen (§17). Archivierte Assets und Depots sind kein Fehler, nur
  // Hinweis. Gezählt werden sie selbst — zuvor stand hier die Zahl der
  // **Eingänge** auf archivierten Assets (595 statt 46) unter der Überschrift
  // „Archivierte Unternehmen".
  const overview = React.useMemo(() => {
    const active = payments.filter((p) => !p.archived_at);
    return {
      duplicates: duplicatePairs.length,
      anomalies: anomalies.length,
      cancelled: payments.length - active.length,
      importedModified: active.filter(
        (p) => isImported(p.source) && p.updated_at !== p.created_at,
      ).length,
      archivedAssets: securities.filter((s) => s.archived_at).length,
      archivedDepots: depots.filter((d) => d.archived_at).length,
    };
  }, [payments, securities, depots, duplicatePairs.length, anomalies.length]);

  const setReviewed = (anomaly: Anomaly<PaymentListRow>, reviewed: boolean) => {
    reviewAnomaly.mutate(
      { paymentId: anomaly.payment.id, code: anomaly.code, reviewed },
      {
        onSuccess: () => {
          if (!reviewed) notify("Der Eintrag steht wieder unter den Auffälligkeiten.");
        },
        onError: (error) => {
          notify(
            getErrorMessage(
              error,
              reviewed
                ? "Der Eintrag konnte nicht als geprüft markiert werden."
                : "Die Markierung konnte nicht zurückgenommen werden.",
            ),
            "negative",
          );
        },
      },
    );
  };

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
      {/* Auf gedämpfter Fläche wie die Kennzahlen im Kopf der Übersicht. */}
      <div className="rounded-2xl bg-muted p-4 sm:px-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <OverviewItem
            label="Mögliche Dubletten"
            value={isLoading ? null : overview.duplicates}
          />
          <OverviewItem
            label="Auffällige Datensätze"
            value={isLoading ? null : overview.anomalies}
          />
          <OverviewItem
            label="Stornierte"
            value={isLoading ? null : overview.cancelled}
          />
          <OverviewItem
            label="Importe mit Änderung"
            value={isLoading ? null : overview.importedModified}
          />
          <OverviewItem
            label="Archivierte Assets"
            value={isLoading ? null : overview.archivedAssets}
          />
          <OverviewItem
            label="Archivierte Depots"
            value={isLoading ? null : overview.archivedDepots}
          />
        </dl>
      </div>

      {isLoading ? (
        <PageSkeleton header={false} />
      ) : (
        <div className="space-y-10 pt-4">
          {/* Dubletten (§16) */}
          <Section title="Mögliche Dubletten">
            <div className="space-y-3">
              {duplicatePairs.length === 0 ? (
                // Sind alle Paare als „keine Dublette" markiert, ist die Arbeit
                // erledigt — derselbe Satz wie bei den Auffälligkeiten. Die
                // Erklärung „keine Zahlungen mit gleichem …" stimmte dann nicht:
                // Solche Paare gibt es, sie stehen eingeklappt darunter.
                dismissedPairs.length > 0 ? (
                  <AllClear title="Keine offenen Dubletten" />
                ) : (
                  <AllClear
                    title="Keine möglichen Dubletten"
                    description="Keine Zahlungen mit gleichem Asset, Depot und Zahlungsdatum."
                  />
                )
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
              {dismissedPairs.length > 0 && (
                <Disclosure
                  summary={`Als keine Dublette markiert (${formatCountNumber(dismissedPairs.length)})`}
                >
                  <ListGroup>
                    {dismissedPairs.map((pair) => {
                      const company = securityName(pair.a.security_id);
                      // Ein Zahltag ist ein Kalendertag, kein Zeitpunkt.
                      const date = formatCalendarDate(pair.a.pay_date);
                      return (
                        <li key={pair.key}>
                          <ListRow className="pr-1">
                            <span className="min-w-0 flex-1">
                              <span className="font-medium [overflow-wrap:anywhere]">
                                {company}
                              </span>
                              <span className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                                <span>{date}</span>
                                <span>{depotName(pair.a.depot_id)}</span>
                                <span>
                                  <AmountText
                                    amount={Money.fromString(
                                      pair.a.net_amount,
                                      currencyOf(pair.a.depot_id),
                                    )}
                                  />
                                  {" / "}
                                  <AmountText
                                    amount={Money.fromString(
                                      pair.b.net_amount,
                                      currencyOf(pair.b.depot_id),
                                    )}
                                  />
                                </span>
                              </span>
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-my-2 shrink-0"
                              aria-label={`Markierung für ${company} vom ${date} zurücknehmen`}
                              disabled={undismiss.isPending}
                              onClick={() => {
                                undismiss.mutate(
                                  { idA: pair.a.id, idB: pair.b.id },
                                  {
                                    onSuccess: () => {
                                      notify(
                                        "Das Paar steht wieder unter den möglichen Dubletten.",
                                      );
                                    },
                                    onError: (error) => {
                                      notify(
                                        getErrorMessage(
                                          error,
                                          "Die Markierung konnte nicht zurückgenommen werden.",
                                        ),
                                        "negative",
                                      );
                                    },
                                  },
                                );
                              }}
                            >
                              Zurücknehmen
                            </Button>
                          </ListRow>
                        </li>
                      );
                    })}
                  </ListGroup>
                </Disclosure>
              )}
            </div>
          </Section>

          {/* Auffällige Datensätze (§18) */}
          <Section title="Auffällige Datensätze">
            <div className="space-y-3">
              {anomalies.length === 0 ? (
                <AllClear
                  title={
                    reviewedAnomalies.length > 0
                      ? "Keine offenen Auffälligkeiten"
                      : "Keine Auffälligkeiten"
                  }
                />
              ) : (
                // Je Befund eine Zeile: Sie führt als Ganzes zum Eingang (dort
                // korrigieren, stornieren oder löschen); darunter rechts die
                // Entscheidung „In Ordnung" — an derselben Stelle wie „Keine
                // Dublette" bei den Dubletten. Neben dem Text stand sie auf dem
                // Telefon im Weg: Der Hinweis brach dort auf fünf Zeilen um.
                <ListGroup>
                  {anomalies.map((anomaly) => {
                    const asset = securityName(anomaly.payment.security_id);
                    const date = formatCalendarDate(anomaly.payment.pay_date);
                    return (
                      <li key={anomaly.key}>
                        <ListRow asChild>
                          <Link to={`/eingaenge/${anomaly.payment.id}`}>
                            <ListItemBody
                              title={asset}
                              meta={
                                <>
                                  <span className="shrink-0">{date}</span>
                                  <span className="basis-full">{anomaly.message}</span>
                                </>
                              }
                              trailing={
                                <AmountText
                                  amount={Money.fromString(
                                    anomaly.payment.net_amount,
                                    currencyOf(anomaly.payment.depot_id),
                                  )}
                                />
                              }
                            />
                          </Link>
                        </ListRow>
                        <div className="-mt-2 flex justify-end pb-1 pr-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${asset} vom ${date} (${anomaly.message}) als geprüft markieren`}
                            disabled={reviewAnomaly.isPending}
                            onClick={() => {
                              setReviewed(anomaly, true);
                            }}
                          >
                            In Ordnung
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ListGroup>
              )}
              {reviewedAnomalies.length > 0 && (
                <Disclosure
                  summary={`Als geprüft markiert (${formatCountNumber(reviewedAnomalies.length)})`}
                >
                  <ListGroup>
                    {reviewedAnomalies.map((anomaly) => {
                      const asset = securityName(anomaly.payment.security_id);
                      const date = formatCalendarDate(anomaly.payment.pay_date);
                      return (
                        <li key={anomaly.key}>
                          <ListRow className="pr-1">
                            <span className="min-w-0 flex-1">
                              <span className="font-medium [overflow-wrap:anywhere]">
                                {asset}
                              </span>
                              <span className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                                <span>{date}</span>
                                <AmountText
                                  amount={Money.fromString(
                                    anomaly.payment.net_amount,
                                    currencyOf(anomaly.payment.depot_id),
                                  )}
                                />
                              </span>
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="-my-2 shrink-0"
                              aria-label={`Markierung für ${asset} vom ${date} (${anomaly.message}) zurücknehmen`}
                              disabled={reviewAnomaly.isPending}
                              onClick={() => {
                                setReviewed(anomaly, false);
                              }}
                            >
                              Zurücknehmen
                            </Button>
                          </ListRow>
                        </li>
                      );
                    })}
                  </ListGroup>
                </Disclosure>
              )}
            </div>
          </Section>
        </div>
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
    <p className="flex items-start gap-2 py-1 text-[0.9375rem]">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
      <span>
        <span className="font-medium">{title}</span>
        {description && <span className="text-muted-foreground"> — {description}</span>}
      </span>
    </p>
  );
}

// `null` solange geladen wird: Eine Null stuende sonst kurz als Befund da.
function OverviewItem({ label, value }: { label: string; value: number | null }) {
  return (
    // Erst die Beschriftung, dann der Wert — wie die Kennzahlen im Kopf der
    // Übersicht.
    <div className="flex flex-col">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="text-[1.0625rem] font-semibold tabular-nums">
        {value === null ? "–" : formatCountNumber(value)}
      </dd>
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
              <div key={p.id} className="rounded-xl bg-muted p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{formatCalendarDate(p.pay_date)}</span>
                  <AmountText
                    amount={Money.fromString(p.net_amount, currencyOf(p.depot_id))}
                  />
                </div>
                <p className="text-muted-foreground">{depotName(p.depot_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {sourceLabel(p.source)} · erstellt {formatTimestamp(p.created_at)}
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
