import * as React from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Building2, ChevronRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { StatCard } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import { DateText } from "@/components/DateText";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import {
  aggregate,
  averagePayment,
  firstPayDate,
  largestPayment,
  lastPayDate,
  monthNameDeShort,
  normalizePayoutMonths,
  yearlyBuckets,
} from "@/lib/statistics";
import { useStatisticsData } from "@/features/statistics/hooks";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import { useSecurities } from "@/features/securities/hooks";
import { useDepots } from "@/features/depots/hooks";
import { deriveDataQuality } from "@/features/securities/dataQuality";
import { formatDate } from "@/features/payments/paymentDisplay";

/** Wie viele Zahlungen die Seite direkt zeigt, bevor sie in die Liste verweist. */
const RECENT_LIMIT = 10;

/**
 * Detailseite eines Unternehmens.
 *
 * Beantwortet die Frage „wie hat sich *diese* Position entwickelt?" an einem
 * Ort. Zuvor gab es dafuer keine Route: Die Stammdaten standen in der
 * Verwaltungsliste, die Entwicklung im Statistikbereich, die Zahlungen in der
 * Eingangsliste — drei Bereiche fuer eine Frage.
 *
 * **Datenquelle ist bewusst `useStatisticsData`**, dieselbe wie Uebersicht und
 * Statistik. Damit stimmen die Jahressummen hier zwangslaeufig mit dem
 * Statistikbereich ueberein, statt nur zufaellig: Es gibt keine zweite
 * Aggregation, die auseinanderlaufen koennte (ARCHITECTURE.md §4.5). Wie dort
 * zaehlen ausschliesslich aktive Eingaenge, und die Zuordnung folgt dem
 * effektiven Datum (CALCULATION_RULES.md §10).
 *
 * Die vollstaendige Zahlungsliste wird **nicht** nachgebaut. Sie existiert
 * bereits unter `/eingaenge?security=…` samt Filtern, Sortierung und Storno;
 * hier stehen die juengsten Eingaenge und ein Verweis dorthin.
 */
export function SecurityDetailPage() {
  const { id = "" } = useParams();
  const { payments, isLoading } = useStatisticsData();
  const { data: securities = [], isLoading: securitiesLoading } = useSecurities();
  const { data: depots = [] } = useDepots();

  const security = React.useMemo(
    () => securities.find((entry) => entry.id === id) ?? null,
    [securities, id],
  );

  const own = React.useMemo(
    () => payments.filter((payment) => payment.securityId === id),
    [payments, id],
  );

  const stats = React.useMemo(() => {
    const { net, count } = aggregate(own);
    return {
      net,
      count,
      average: averagePayment(own),
      largest: largestPayment(own),
      first: firstPayDate(own),
      last: lastPayDate(own),
      perYear: yearlyBuckets(own),
    };
  }, [own]);

  const yearData = React.useMemo<CategoryDatum[]>(
    () =>
      stats.perYear.map((bucket) => ({
        key: String(bucket.year),
        label: String(bucket.year),
        value: bucket.net.toChartNumber(),
        money: bucket.net,
        count: bucket.count,
        // Drill-down in die gefilterte Liste — dieselbe Garantie wie im
        // Statistikbereich: jede Zahl fuehrt zu den Zeilen dahinter.
        href: `/eingaenge?security=${id}&year=${String(bucket.year)}`,
      })),
    [stats.perYear, id],
  );

  const recent = React.useMemo(
    () =>
      [...own]
        .sort((a, b) =>
          a.payDate === b.payDate
            ? b.createdAt.localeCompare(a.createdAt)
            : b.payDate.localeCompare(a.payDate),
        )
        .slice(0, RECENT_LIMIT),
    [own],
  );

  const depotName = React.useCallback(
    (depotId: string) => depots.find((depot) => depot.id === depotId)?.name ?? "—",
    [depots],
  );

  // Der Rueckweg steht oben und in **jedem** Zustand — auch waehrend des Ladens
  // und wenn das Unternehmen nicht existiert. Ein Zurueck, das erst nach dem
  // Laden erscheint, ist genau dann nicht da, wenn man es braucht.
  //
  // Ziel ist die Unternehmensliste statt `history.back()`: Die Seite wird auch
  // aus der Statistik und von Zahlungen aus erreicht, und ein per Lesezeichen
  // geoeffneter Aufruf haette keine Vorgeschichte.
  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
      <Link to="/unternehmen">
        <ArrowLeft aria-hidden /> Zu den Unternehmen
      </Link>
    </Button>
  );

  if (isLoading || securitiesLoading) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageSkeleton />
      </div>
    );
  }

  if (!security) {
    return (
      <div className="max-w-2xl space-y-4">
        {backLink}
        <EmptyState
          icon={Building2}
          title="Unternehmen nicht gefunden"
          description="Dieses Unternehmen existiert nicht (mehr)."
          action={
            <Button asChild>
              <Link to="/unternehmen">Zurück zu den Unternehmen</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const payoutMonths = normalizePayoutMonths(security.payout_months);
  const quality = deriveDataQuality(security);
  const archived = Boolean(security.archived_at);

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {security.name}
            {archived && <Badge variant="warning">Archiviert</Badge>}
          </span>
        }
        actions={
          <Button variant="outline" asChild>
            <Link to={`/eingaenge?security=${id}`}>Alle Eingänge</Link>
          </Button>
        }
      />

      {stats.count === 0 ? (
        <EmptyState
          icon={Building2}
          title="Noch kein Dividendeneingang"
          description="Für dieses Unternehmen ist bisher keine Zahlung erfasst."
          action={
            <Button asChild>
              <Link to="/eingaenge/neu">Eingang erfassen</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label="Summe insgesamt"
              value={<AmountText amount={stats.net} />}
              comparison={formatCountNoun(stats.count, "Eingang", "Eingänge")}
            />
            <StatCard
              label="Durchschnitt je Eingang"
              value={<AmountText amount={stats.average} />}
            />
            <StatCard
              label="Größter Eingang"
              value={
                stats.largest ? <AmountText amount={stats.largest} /> : <span>—</span>
              }
            />
            <StatCard
              label="Zeitraum"
              value={
                <span className="text-base sm:text-lg">
                  {stats.first ? formatDate(stats.first) : "—"} –{" "}
                  {stats.last ? formatDate(stats.last) : "—"}
                </span>
              }
              comparison={`${formatCountNumber(stats.perYear.length)} ${
                stats.perYear.length === 1 ? "Jahr" : "Jahre"
              }`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Entwicklung je Jahr</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBarChart
                data={yearData}
                ariaLabel={`Jährliche Dividendeneingänge von ${security.name}`}
                categoryHeader="Jahr"
              />
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Field label="Ticker" value={security.ticker} />
              <Field label="ISIN" value={security.isin} />
              <Field label="WKN" value={security.wkn} />
              <Field label="Land" value={security.country} />
              <Field label="Branche" value={security.sector} />
              <Field label="Währung" value={security.currency} />
              <Field
                label="Standard-Depot"
                value={
                  security.default_depot_id ? depotName(security.default_depot_id) : null
                }
              />
            </dl>

            {quality === "incomplete" && (
              <p className="flex gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Die Stammdaten sind unvollständig. Das beeinträchtigt nichts an den
                  Auswertungen — es erschwert aber das Wiederfinden und den Abgleich mit
                  Broker-Belegen.
                </span>
              </p>
            )}

            {security.note && (
              <div className="border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">Notiz</p>
                <p className="whitespace-pre-wrap text-sm">{security.note}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ausschüttungsplan</CardTitle>
          </CardHeader>
          <CardContent>
            {payoutMonths.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Kein Plan hinterlegt. Zahlungen zählen dann für den Monat, in dem sie
                tatsächlich eingegangen sind.
              </p>
            ) : (
              <div className="space-y-3">
                <ul className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                    const planned = payoutMonths.includes(month);
                    return (
                      <li key={month}>
                        <span
                          className={
                            planned
                              ? "inline-flex min-w-11 justify-center rounded-md bg-primary px-2 py-1 text-sm text-primary-foreground"
                              : "inline-flex min-w-11 justify-center rounded-md border border-border px-2 py-1 text-sm text-muted-foreground"
                          }
                        >
                          <span className="sr-only">
                            {planned ? "Geplant: " : "Nicht geplant: "}
                          </span>
                          {monthNameDeShort(month)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-sm text-muted-foreground">
                  Eine später eingetroffene Zahlung zählt für den geplanten Monat, für den
                  sie fällig war. Eine Zahlung im Monat direkt davor zählt für den
                  kommenden geplanten Monat — beides auch über den Jahreswechsel hinweg.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Letzte Eingänge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y divide-border">
              {recent.map((payment) => {
                const shifted = payment.payDate !== payment.actualPayDate;
                return (
                  <li key={payment.id}>
                    <Link
                      to={`/eingaenge/${payment.id}`}
                      className="flex items-center justify-between gap-3 rounded-sm py-2 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <DateText className="text-sm">
                          {formatDate(payment.payDate)}
                        </DateText>
                        {shifted && (
                          <span className="block text-xs text-muted-foreground">
                            tatsächlich {formatDate(payment.actualPayDate)}
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {depotName(payment.depotId)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <AmountText amount={payment.netAmount} className="font-medium" />
                        <ChevronRight
                          className="size-4 text-muted-foreground"
                          aria-hidden
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {stats.count > RECENT_LIMIT && (
              <Button variant="outline" asChild>
                <Link to={`/eingaenge?security=${id}`}>
                  Alle {formatCountNumber(stats.count)} Eingänge anzeigen
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Ein Stammdatenfeld; leere Felder bleiben sichtbar, damit Lücken auffallen. */
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">
        {value?.trim() ? value : <span className="text-muted-foreground">—</span>}
      </dd>
    </>
  );
}
