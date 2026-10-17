import * as React from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Ban, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { AmountText } from "@/components/money/AmountText";
import { TrendPill } from "@/components/domain/KpiHero";
import { Money, currencySymbol, formatPercent, toCurrencyCode } from "@/lib/money";
import { normalizePayoutMonths } from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { useToast } from "@/components/ui/toast";
import { useDepots } from "@/features/depots/hooks";
import { useSecurities } from "@/features/securities/hooks";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import {
  useArchivePayment,
  useDeletePayment,
  usePayment,
  useUnarchivePayment,
} from "@/features/payments/hooks";
import { sourceLabel } from "@/features/payments/paymentDisplay";
import { formatCalendarDate, formatTimestamp } from "@/lib/utils/formatDate";
import {
  DeleteDialog,
  StornoDialog,
  type PaymentSummaryData,
} from "@/features/payments/dialogs";
import { usePaymentComposer } from "@/features/payments/PaymentComposer";
import {
  derivePaymentInsights,
  percentChange,
} from "@/features/payments/paymentInsights";
import { PaymentInsightsView } from "@/features/payments/PaymentInsightsView";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-3 text-[0.9375rem] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/**
 * Dezimalwert ohne bedeutungslose Nullen, mit mindestens `minDigits`
 * Nachkommastellen: „0.30660000" → „0,3066", „300.000000" → „300".
 */
function formatDecimal(value: string, minDigits = 0): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const digits = fraction.replace(/0+$/, "").padEnd(minDigits, "0");
  return digits ? `${whole},${digits}` : whole;
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
  const edit = usePaymentComposer({ paymentId: id });
  const { data: payment, isLoading, isError } = usePayment(id);
  const { data: depots = [] } = useDepots();
  const { data: securities = [] } = useSecurities();
  const archivePayment = useArchivePayment();
  const unarchivePayment = useUnarchivePayment();
  const deletePayment = useDeletePayment();
  const { notify } = useToast();

  const [stornoOpen, setStornoOpen] = React.useState(false);
  const [stornoError, setStornoError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  // Seit 1.25.0 ordnet die Seite die Dividende ein, statt Metadaten zu
  // zeigen (Waehrung, Quelle, Zeitstempel, Aenderungsverlauf, Importherkunft):
  // Die Frage beim Antippen ist „war das viel?", nicht „wann wurde das
  // gespeichert?". Grundlage ist die bereits geladene Historie — derselbe
  // Cache wie Liste und Statistik, also keine zusaetzliche Abfrage.
  const { payments: effectivePayments } = useEffectivePayments();
  const securityId = payment?.security_id;
  const payoutMonths = securities.find((s) => s.id === securityId)?.payout_months;
  const insights = React.useMemo(
    () =>
      id && securityId
        ? derivePaymentInsights(
            id,
            effectivePayments.filter((entry) => entry.securityId === securityId),
            normalizePayoutMonths(payoutMonths),
          )
        : null,
    [id, securityId, effectivePayments, payoutMonths],
  );

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
          title="Dividende nicht gefunden"
          description="Diese Dividende existiert nicht (mehr). Möglicherweise wurde sie dauerhaft gelöscht."
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

  // Abzuege, soweit erfasst (in der Regel nur bei importierten Dividenden).
  const deductions = (
    [
      ["Quellensteuer", payment.withholding_tax],
      ["Kapitalertragsteuer", payment.domestic_tax],
      ["Solidaritätszuschlag", payment.solidarity_surcharge],
      ["Kirchensteuer", payment.church_tax],
      ["Gebühren", payment.fees],
    ] satisfies [string, string | null][]
  ).flatMap(([label, value]) =>
    value !== null && Money.fromString(value, currency).isPositive()
      ? [{ label, value }]
      : [],
  );
  const gross = Money.fromString(payment.gross_amount, currency);
  const taxRate =
    deductions.length > 0 && gross.isPositive()
      ? gross
          .subtract(Money.fromString(payment.net_amount, currency))
          .toDecimal()
          .div(gross.toDecimal())
          .times(100)
      : null;
  const perShare =
    payment.amount_per_share !== null && payment.quantity !== null
      ? `${formatDecimal(payment.amount_per_share, 2)} ${currencySymbol(payment.original_currency)} · ${formatDecimal(payment.quantity)} Stück`
      : null;
  const yearAgo = insights?.yearAgo ?? null;

  const handleStorno = async (stornoReason: string) => {
    setStornoError(null);
    try {
      await archivePayment.mutateAsync({
        id: payment.id,
        reason: stornoReason || undefined,
      });
      setStornoOpen(false);
    } catch (error) {
      setStornoError(
        getErrorMessage(error, "Die Dividende konnte nicht storniert werden."),
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
          "Die Dividende konnte nicht gelöscht werden. Die Daten wurden nicht verändert.",
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
              <Button
                variant="outline"
                size="icon"
                aria-label="Bearbeiten"
                aria-haspopup="dialog"
                {...edit}
              >
                <Pencil />
              </Button>
            )}
            {cancelled ? (
              <Button
                variant="outline"
                size="icon"
                aria-label="Reaktivieren"
                disabled={unarchivePayment.isPending}
                onClick={() => {
                  unarchivePayment.mutate(payment.id, {
                    onSuccess: () => {
                      notify("Dividende reaktiviert.");
                    },
                    onError: (error) => {
                      notify(
                        getErrorMessage(
                          error,
                          "Die Dividende konnte nicht reaktiviert werden.",
                        ),
                        "negative",
                      );
                    },
                  });
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
        // Der Name fuehrt zur Detailseite des Assets — von einer einzelnen
        // Zahlung zur ganzen Position. Eine eigene Zeile „Asset" in den Details
        // wiederholte ihn nur.
        title={
          security ? (
            <Link
              to={`/depot/${security.id}`}
              className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {security.name}
              {security.archived_at ? " (archiviert)" : ""}
            </Link>
          ) : (
            "Dividende"
          )
        }
        badge={cancelled ? <Badge variant="warning">Storniert</Badge> : undefined}
        subtitle={
          <>
            {/* Ohne Kalendersymbol: Neben dem Depot ist das Datum auch so als
                Datum zu erkennen. */}
            <span>{formatCalendarDate(payment.pay_date)}</span>
            <span>·</span>
            <span>
              {depot?.name ?? "—"}
              {depot?.archived_at ? " (archiviert)" : ""}
            </span>
          </>
        }
        figure={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <AmountText amount={Money.fromString(payment.net_amount, currency)} />
            {/* Der Vorjahresvergleich der Liste, hier ausgeschrieben. */}
            {/* Eigene Laufweite: Die grosse Zahl ist enger gesetzt. */}
            {yearAgo && (
              <span className="tracking-normal">
                <TrendPill
                  tone={
                    yearAgo.direction === "up"
                      ? "positive"
                      : yearAgo.direction === "down"
                        ? "negative"
                        : "neutral"
                  }
                  title={`gegenüber ${formatCalendarDate(yearAgo.previousDate)}`}
                >
                  {percentChange(yearAgo.difference, yearAgo.previousAmount)} zum Vorjahr
                </TrendPill>
              </span>
            )}
          </span>
        }
      />

      {cancelled && (
        <Section title="Storniert" className="pt-4">
          <div>
            {payment.archived_at && (
              <DetailRow label="Storniert am">
                {formatTimestamp(payment.archived_at)}
              </DetailRow>
            )}
            {payment.archive_reason && (
              <DetailRow label="Grund">{payment.archive_reason}</DetailRow>
            )}
          </div>
        </Section>
      )}

      {insights && (
        <PaymentInsightsView
          insights={insights}
          paymentId={payment.id}
          securityId={payment.security_id}
          securityName={security?.name ?? "diesem Asset"}
          listState={from}
        />
      )}

      {(deductions.length > 0 || perShare !== null || payment.note) && (
        <div className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-2 lg:gap-x-16">
          {(deductions.length > 0 || perShare !== null) && (
            // Nur wenn es etwas abzuziehen gibt: Manuell erfasste Dividenden
            // tragen allein den Nettobetrag, eine Zeile „Brutto = Netto"
            // sagte nichts.
            <Section title="Brutto zu Netto">
              <div>
                {deductions.length > 0 && (
                  <>
                    <DetailRow label="Brutto">
                      <AmountText
                        amount={Money.fromString(payment.gross_amount, currency)}
                      />
                    </DetailRow>
                    {deductions.map((row) => (
                      <DetailRow key={row.label} label={row.label}>
                        −&#8239;
                        <AmountText amount={Money.fromString(row.value, currency)} />
                      </DetailRow>
                    ))}
                    <DetailRow label="Netto">
                      <span className="font-semibold">
                        <AmountText
                          amount={Money.fromString(payment.net_amount, currency)}
                        />
                      </span>
                    </DetailRow>
                    {taxRate !== null && (
                      <DetailRow label="Abzugsquote">{formatPercent(taxRate)}</DetailRow>
                    )}
                  </>
                )}
                {perShare !== null && <DetailRow label="Je Aktie">{perShare}</DetailRow>}
              </div>
            </Section>
          )}
          {payment.note && (
            <Section title="Notiz">
              <p className="whitespace-pre-line pt-1 text-[0.9375rem]">{payment.note}</p>
            </Section>
          )}
        </div>
      )}

      <StornoDialog
        open={stornoOpen}
        onOpenChange={setStornoOpen}
        summary={summary}
        error={stornoError}
        isPending={archivePayment.isPending}
        onConfirm={(reason) => void handleStorno(reason)}
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
