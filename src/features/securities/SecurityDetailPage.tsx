import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Archive, Briefcase, Pencil, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section, SectionExternalLink, SectionLink } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailRow } from "@/components/ui/detail-row";
import { CopyText } from "@/components/ui/copy-text";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { ListGroup } from "@/components/ui/list";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { KpiHero, type KpiStat } from "@/components/domain/KpiHero";
import { SecurityIdentifiers } from "@/components/domain/SecurityIdentifiers";
import { AmountText } from "@/components/money/AmountText";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { formatCalendarDate, formatDayMonth } from "@/lib/utils/formatDate";
import { formatPercent, toCurrencyCode, Money } from "@/lib/money";
import {
  aggregate,
  averagePayment,
  firstPayDate,
  largestPayment,
  lastPayDate,
  monthNameDeShort,
  monthOf,
  isoFromRef,
  normalizePayoutMonths,
  yearOf,
  yearlyBuckets,
} from "@/lib/statistics";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import {
  useArchiveSecurity,
  useSecurities,
  useSecuritySnapshots,
} from "@/features/securities/hooks";
import { SecurityFormDialog } from "@/features/securities/SecurityFormDialog";
import { DeleteSecurityDialog } from "@/features/securities/DeleteSecurityDialog";
import { PaymentListItem } from "@/features/payments/PaymentListItem";
import { DeltaText } from "@/features/payments/PaymentInsightsView";
import { deltaOf } from "@/features/payments/paymentInsights";
import { PositionCard } from "@/features/securities/PositionCard";
import { latestAsOf, ratioToPercent, statusOf } from "@/features/securities/snapshots";
import { useDepots } from "@/features/depots/hooks";
import { useArchiveToggle } from "@/components/domain/useArchiveToggle";
import { deriveDataQuality } from "@/features/securities/dataQuality";
import { usePaymentComposer } from "@/features/payments/PaymentComposer";
import { useResolvedCalendarEvents } from "@/features/calendar/resolvedEvents";
import { useToday } from "@/lib/hooks/useToday";
import { nextDividend } from "@/features/securities/nextDividend";

/**
 * Wie viele Zahlungen die Seite direkt zeigt — so viele wie die Uebersicht.
 * Die ganze Liste liegt einen Tipp entfernt.
 */
const RECENT_LIMIT = 5;

type HistoryView = "yearly" | "cumulative";

// Wie auf der Detailseite einer Dividende: die einzelnen Jahre zuerst und
// vorausgewaehlt, die Summe danach.
const VIEW_OPTIONS: readonly SegmentOption<HistoryView>[] = [
  { value: "yearly", label: "Je Jahr" },
  { value: "cumulative", label: "Kumuliert" },
];

/**
 * Detailseite eines Assets.
 *
 * Beantwortet die Frage „wie hat sich *diese* Position entwickelt?" an einem
 * Ort. Zuvor gab es dafuer keine Route: Die Stammdaten standen in der
 * Verwaltungsliste, die Entwicklung im Statistikbereich, die Zahlungen in der
 * Eingangsliste — drei Bereiche fuer eine Frage.
 *
 * **Datenquelle ist bewusst `useEffectivePayments`**, dieselbe Grundlage wie
 * Uebersicht, Statistik und Ziele. Damit stimmen die Jahressummen hier
 * zwangslaeufig mit dem Statistikbereich ueberein, statt nur zufaellig: Es gibt
 * keine zweite Aggregation, die auseinanderlaufen koennte (ARCHITECTURE.md
 * §4.5). Wie dort zaehlen ausschliesslich aktive Eingaenge, und die Zuordnung
 * folgt dem effektiven Datum (CALCULATION_RULES.md §10). Nicht
 * `useStatisticsData`: Das baute zusaetzlich die Zeitreihe aller Depotstaende
 * und die Namenstabellen auf, die diese Seite nicht braucht.
 *
 * Die vollstaendige Zahlungsliste wird **nicht** nachgebaut. Sie existiert
 * bereits unter `/eingaenge?security=…` samt Filtern, Sortierung und Storno;
 * hier stehen die juengsten Eingaenge und ein Verweis dorthin.
 */
export function SecurityDetailPage() {
  const { id = "" } = useParams();
  // Erfassen von hier aus: das Asset ist schon gewaehlt.
  const newPayment = usePaymentComposer({ securityId: id });
  const navigate = useNavigate();
  const archiveSecurity = useArchiveSecurity();
  const toggleArchive = useArchiveToggle(archiveSecurity);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { payments, paymentsQuery } = useEffectivePayments();
  const isLoading = paymentsQuery.isLoading;
  const { data: securities = [], isLoading: securitiesLoading } = useSecurities();
  const { data: snapshots = [] } = useSecuritySnapshots();
  const { data: depots = [] } = useDepots();
  const { events: calendarEvents } = useResolvedCalendarEvents();
  const todayRef = useToday();

  // Der Depotstand dieser Position und die Auskunft, ob er noch der juengste
  // ist — ohne sie stuende auf der Seite einer verkauften Position dauerhaft
  // ein Bestand, den es nicht mehr gibt.
  const snapshotStatus = React.useMemo(
    () => statusOf(snapshots, id, latestAsOf(snapshots)),
    [snapshots, id],
  );

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

  const [view, setView] = React.useState<HistoryView>("yearly");

  // Je Jahr oder kumuliert: insgesamt erhalten bis einschliesslich des Jahres.
  // Die Balken fuehren bewusst nirgendwohin (wie auf der Dividendenseite); der
  // Weg zur Liste steht unter „Letzte Dividenden".
  const yearData = React.useMemo<CategoryDatum[]>(() => {
    const rows: CategoryDatum[] = [];
    let running: Money | null = null;
    for (const bucket of stats.perYear) {
      running = running ? running.add(bucket.net) : bucket.net;
      const money = view === "cumulative" ? running : bucket.net;
      rows.push({
        key: String(bucket.year),
        label: String(bucket.year),
        value: money.toChartNumber(),
        money,
        count: bucket.count,
      });
    }
    return rows;
  }, [stats.perYear, view]);

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
  // und wenn das Asset nicht existiert. Ein Zurueck, das erst nach dem Laden
  // erscheint, ist genau dann nicht da, wenn man es braucht.
  //
  // Ziel ist die Assetliste statt `history.back()`: Die Seite wird auch aus der
  // Statistik und von Zahlungen aus erreicht, und ein per Lesezeichen
  // geoeffneter Aufruf haette keine Vorgeschichte.
  const backLink = <DetailBackLink to="/depot" label="Zum Depot" />;

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
          icon={Briefcase}
          title="Asset nicht gefunden"
          description="Dieses Asset existiert nicht (mehr)."
          action={
            <Button asChild>
              <Link to="/depot">Zurück zum Depot</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const payoutMonths = normalizePayoutMonths(security.payout_months);
  const quality = deriveDataQuality(security);
  const archived = Boolean(security.archived_at);

  // Kopf: was dieses Papier bringt. Erwartet (laut Depotstand) neben dem
  // zuletzt abgeschlossenen Jahr — ein laufendes Jahr liesse die Erwartung
  // zwangslaeufig zu hoch aussehen.
  const { snapshot, current } = snapshotStatus;
  const thisYear = todayRef.year;
  const lastFullYear = stats.perYear.filter((bucket) => bucket.year < thisYear).at(-1);
  const yearBefore = lastFullYear
    ? stats.perYear.find((bucket) => bucket.year === lastFullYear.year - 1)
    : undefined;
  // Angekuendigt (Kalender) vor vermutet (Plan und Historie). Verkauft oder archiviert kommt keine mehr.
  const next =
    !archived && (snapshot === null || current)
      ? nextDividend({
          securityName: security.name,
          events: calendarEvents,
          own,
          payoutMonths,
          today: todayRef,
          todayIso: isoFromRef(todayRef),
        })
      : null;

  const heroStats: KpiStat[] = [];
  if (snapshot && current && snapshot.annual_dividend_total !== null) {
    const dividendYield = ratioToPercent(snapshot.dividend_yield);
    heroStats.push({
      label: "Erwartet p. a.",
      value: (
        <AmountText
          amount={Money.fromString(
            snapshot.annual_dividend_total,
            toCurrencyCode(snapshot.currency),
          )}
        />
      ),
      caption: dividendYield ? `Rendite ${formatPercent(dividendYield, 2)}` : undefined,
    });
  }
  if (lastFullYear) {
    heroStats.push({
      label: `Erhalten ${String(lastFullYear.year)}`,
      value: <AmountText amount={lastFullYear.net} />,
      caption: yearBefore ? (
        <DeltaText
          delta={deltaOf(lastFullYear.net.subtract(yearBefore.net), yearBefore.net)}
        />
      ) : undefined,
      to: `/eingaenge?security=${id}&year=${String(lastFullYear.year)}`,
      drillLabel: `Dividenden von ${security.name} im Jahr ${String(lastFullYear.year)} anzeigen`,
    });
  }
  if (next) {
    heroStats.push({
      label: "Nächste",
      value:
        next.source === "calendar"
          ? formatCalendarDate(next.date)
          : `${monthNameDeShort(next.month)} ${String(next.year)}`,
      // Ein Kalendertermin steht fuer sich, nur der vermutete Wert sagt es dazu.
      caption:
        next.source === "calendar" ? (
          next.amount && <AmountText amount={next.amount} />
        ) : (
          // Betrag und Hinweis brechen je als Ganzes um, nie mitten darin.
          <>
            {next.amount && (
              <>
                <span className="whitespace-nowrap">
                  ≈ <AmountText amount={next.amount} />
                </span>{" "}
              </>
            )}
            <span className="whitespace-nowrap">vermutet</span>
          </>
        ),
    });
  }
  // Fehlt Depotstand oder Plan, ruecken die Durchschnittswerte nach.
  if (heroStats.length < 3) {
    heroStats.push({
      label: "Ø je Dividende",
      value: <AmountText amount={stats.average} />,
    });
  }
  if (heroStats.length < 3 && stats.largest) {
    heroStats.push({
      label: "Größte Dividende",
      value: <AmountText amount={stats.largest} />,
    });
  }

  return (
    <div className="space-y-6">
      {/* Bearbeiten, Archivieren und (nur archiviert) Loeschen stehen hier,
          nicht mehr in jeder Zeile der Assetliste — dasselbe Muster wie bei
          einem Dividendeneingang. */}
      <DetailHeader
        back={backLink}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Bearbeiten"
              onClick={() => {
                setEditOpen(true);
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={archived ? "Reaktivieren" : "Archivieren"}
              disabled={archiveSecurity.isPending}
              onClick={() => {
                toggleArchive(security, `„${security.name}"`);
              }}
            >
              {archived ? <RotateCcw /> : <Archive />}
            </Button>
            {archived && (
              <Button
                variant="outline"
                size="icon"
                aria-label="Endgültig löschen"
                onClick={() => {
                  setDeleteOpen(true);
                }}
              >
                <Trash2 />
              </Button>
            )}
          </>
        }
        title={security.name}
        badge={archived ? <Badge variant="warning">Archiviert</Badge> : undefined}
        subtitle={
          security.isin?.trim() || security.wkn?.trim() || security.ticker?.trim() ? (
            <SecurityIdentifiers security={security} />
          ) : undefined
        }
      />

      {/* Reihenfolge seit 1.30.0 wie auf der Detailseite einer Dividende:
          erst was das Papier bringt (Summe, Erwartung, letztes Jahr, naechste
          Zahlung), dann der Verlauf und die letzten Eingaenge, zuletzt Position,
          Ausschuettungsplan und Stammdaten. Zuvor standen Position und
          „Erhalten insgesamt" als zwei gleich starke Koepfe untereinander. */}
      {stats.count === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Noch keine Dividende"
          description="Für dieses Asset ist bisher keine Dividende erfasst."
          action={
            <Button aria-haspopup="dialog" {...newPayment}>
              Dividende erfassen
            </Button>
          }
        />
      ) : (
        <>
          <KpiHero
            label="Erhalten insgesamt"
            value={<AmountText amount={stats.net} />}
            to={`/eingaenge?security=${id}`}
            drillLabel={`Alle Dividenden von ${security.name} anzeigen`}
            caption={[
              formatCountNoun(stats.count, "Dividende", "Dividenden"),
              stats.first
                ? `seit ${monthNameDeShort(monthOf(stats.first))} ${String(yearOf(stats.first))}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            stats={heroStats.slice(0, 3)}
          />

          <div className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-2 lg:gap-x-16">
            <Section
              title="Verlauf"
              action={
                <SegmentedControl
                  variant="pill"
                  label="Verlauf als"
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                />
              }
            >
              <div>
                <CategoryBarChart
                  data={yearData}
                  ariaLabel={
                    view === "cumulative"
                      ? `Kumulierte Dividenden von ${security.name}`
                      : `Jährliche Dividenden von ${security.name}`
                  }
                  categoryHeader="Jahr"
                  showCount={view === "yearly"}
                  tableOrder="desc"
                />
              </div>
            </Section>

            {/* Kopf wie „Letzte Eingänge" auf der Uebersicht: der Weg zur
                ganzen Liste rechts neben der Ueberschrift. */}
            <Section
              title="Letzte Dividenden"
              action={
                <SectionLink to={`/eingaenge?security=${id}`}>
                  Alle {formatCountNumber(stats.count)}
                </SectionLink>
              }
            >
              <div>
                {/* Der Name stuende in jeder Zeile wie in der Ueberschrift;
                    hier ist das Depot der Titel. */}
                <ListGroup>
                  {recent.map((payment) => (
                    <PaymentListItem
                      key={payment.id}
                      to={`/eingaenge/${payment.id}`}
                      title={depotName(payment.depotId)}
                      date={payment.payDate}
                      showYear
                      note={
                        payment.payDate !== payment.actualPayDate
                          ? `tatsächlich ${formatDayMonth(payment.actualPayDate)}`
                          : undefined
                      }
                      amount={payment.netAmount}
                    />
                  ))}
                </ListGroup>
              </div>
            </Section>
          </div>
        </>
      )}

      {/* Die Position steht ausserhalb der Bedingung oben: Ein frisch gekauftes
          Papier hat einen Bestand, aber noch keinen Eingang. */}
      <div className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-2 lg:gap-x-16">
        <PositionCard status={snapshotStatus} />

        <div className="space-y-10">
          <Section title="Ausschüttungsplan">
            <div>
              {payoutMonths.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Kein Plan hinterlegt. Dividenden zählen dann für den Monat, in dem sie
                  tatsächlich eingegangen sind.
                </p>
              ) : (
                // Die Zaehlregel steht nicht mehr hier: Sie gilt fuer jeden Plan
                // gleich und sagte auf der Seite eines Assets nichts Eigenes.
                // Zwei Reihen zu je sechs Monaten in gleich breiten Spalten
                // (seit 1.30.1): Zuvor brach die Reihe je nach Breite nach
                // sieben, neun oder elf Monaten um.
                <ul className="grid w-fit grid-cols-6 gap-1.5">
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                    const planned = payoutMonths.includes(month);
                    return (
                      <li key={month}>
                        <span
                          className={
                            planned
                              ? "flex min-w-11 justify-center rounded-full bg-accent px-2 py-1 text-sm font-semibold text-foreground"
                              : "flex min-w-11 justify-center rounded-full px-2 py-1 text-sm text-muted-foreground"
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
              )}
            </div>
          </Section>

          {/* Dieselben Zeilen wie Position und „Brutto zu Netto". */}
          {/* DivvyDiary findet das Papier ueber die ISIN und leitet auf seine
              Seite weiter — ohne ISIN gibt es kein verlaessliches Ziel. */}
          <Section
            title="Stammdaten"
            action={
              security.isin?.trim() && (
                <SectionExternalLink href={divvyDiaryUrl(security.isin.trim())}>
                  DivvyDiary
                </SectionExternalLink>
              )
            }
          >
            <div className="space-y-4">
              <div>
                <Field label="ISIN" value={security.isin} copyable />
                <Field label="WKN" value={security.wkn} copyable />
                <Field label="Ticker" value={security.ticker} copyable />
                <Field label="Land" value={security.country} />
                <Field label="Branche" value={security.sector} />
                <Field label="Währung" value={security.currency} />
                <Field
                  label="Depot"
                  value={
                    security.default_depot_id
                      ? depotName(security.default_depot_id)
                      : null
                  }
                />
              </div>

              {quality === "incomplete" && (
                <p className="flex gap-2 rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
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
            </div>
          </Section>
        </div>
      </div>

      <SecurityFormDialog
        security={security}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteSecurityDialog
        security={deleteOpen ? security : null}
        onOpenChange={setDeleteOpen}
        onDeleted={() => void navigate("/depot")}
      />
    </div>
  );
}

/** Die Seite des Papiers bei DivvyDiary, gefunden ueber die ISIN. */
function divvyDiaryUrl(isin: string): string {
  return `https://divvydiary.com/${encodeURIComponent(isin)}`;
}

/** Ein Stammdatenfeld; leere Felder bleiben sichtbar, damit Lücken auffallen. */
function Field({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string | null;
  /** Kennungen (Ticker, ISIN, WKN) legt ein Klick in die Zwischenablage. */
  copyable?: boolean;
}) {
  const text = value?.trim();
  return (
    <DetailRow label={label}>
      {!text ? (
        <span className="text-muted-foreground">—</span>
      ) : copyable ? (
        <CopyText label={label} value={text} />
      ) : (
        text
      )}
    </DetailRow>
  );
}
