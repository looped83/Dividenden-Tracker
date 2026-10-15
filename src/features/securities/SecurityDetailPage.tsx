import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Archive, Briefcase, Pencil, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section, SectionLink } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Disclosure } from "@/components/ui/disclosure";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { ListGroup } from "@/components/ui/list";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { KpiHero } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { formatCalendarDate, formatYearSpan } from "@/lib/utils/formatDate";
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
import { PositionCard } from "@/features/securities/PositionCard";
import { latestAsOf, statusOf } from "@/features/securities/snapshots";
import { useDepots } from "@/features/depots/hooks";
import { useArchiveToggle } from "@/components/domain/useArchiveToggle";
import { deriveDataQuality } from "@/features/securities/dataQuality";

/**
 * Wie viele Zahlungen die Seite direkt zeigt — so viele wie die Uebersicht.
 * Die ganze Liste liegt einen Tipp entfernt.
 */
const RECENT_LIMIT = 5;

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

  const identity = [security.ticker, security.isin]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" · ");

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
        subtitle={identity || undefined}
      />

      {/* Reihenfolge nach der Haeufigkeit der Frage: erst die Position (Wert,
          Erwartung, Rendite), dann was kam (Summe, Verlauf, letzte Eingaenge),
          zuletzt Ausschuettungsplan und Stammdaten. Zuvor stand die Position
          hinter vier Kacheln und dem Diagramm, die Stammdaten vor den letzten
          Eingaengen. Die Position steht ausserhalb der Bedingung unten: Ein
          frisch gekauftes Papier hat einen Bestand, aber noch keinen Eingang. */}
      <PositionCard status={snapshotStatus} perYear={stats.perYear} />

      {stats.count === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Noch kein Dividendeneingang"
          description="Für dieses Asset ist bisher keine Zahlung erfasst."
          action={
            <Button asChild>
              <Link to="/eingaenge/neu">Eingang erfassen</Link>
            </Button>
          }
        />
      ) : (
        <>
          <KpiHero
            label="Erhalten insgesamt"
            value={<AmountText amount={stats.net} />}
            to={`/eingaenge?security=${id}`}
            drillLabel={`Alle Eingänge von ${security.name} anzeigen`}
            caption={[
              formatCountNoun(stats.count, "Eingang", "Eingänge"),
              stats.first && stats.last ? formatYearSpan(stats.first, stats.last) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            stats={[
              { label: "Ø je Eingang", value: <AmountText amount={stats.average} /> },
              {
                label: "Größter Eingang",
                value: stats.largest ? <AmountText amount={stats.largest} /> : "—",
              },
            ]}
          />

          <Section title="Entwicklung je Jahr" className="pt-4">
            <div>
              <CategoryBarChart
                data={yearData}
                ariaLabel={`Jährliche Dividendeneingänge von ${security.name}`}
                categoryHeader="Jahr"
              />
            </div>
          </Section>
        </>
      )}

      {recent.length > 0 && (
        // Kopf wie „Letzte Eingänge" auf der Uebersicht: der Weg zur ganzen
        // Liste rechts neben der Ueberschrift.
        <Section
          title="Letzte Eingänge"
          // Die Seite steht im 24px-Takt des Detailkopfs; Abschnitte ohne
          // Rahmen brauchen 40px Luft, sonst kleben sie aneinander.
          className="pt-4"
          action={
            <SectionLink to={`/eingaenge?security=${id}`}>
              Alle {formatCountNumber(stats.count)}
            </SectionLink>
          }
        >
          <div>
            {/* Der Name stuende in jeder Zeile wie in der Ueberschrift; hier
                ist das Datum der Titel. */}
            <ListGroup inset>
              {recent.map((payment) => (
                <PaymentListItem
                  key={payment.id}
                  to={`/eingaenge/${payment.id}`}
                  title={
                    <>
                      {formatCalendarDate(payment.payDate)}
                      {payment.payDate !== payment.actualPayDate &&
                        ` (tatsächlich ${formatCalendarDate(payment.actualPayDate)})`}
                    </>
                  }
                  depot={depotName(payment.depotId)}
                  amount={payment.netAmount}
                />
              ))}
            </ListGroup>
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-2 lg:gap-x-16">
        <Section title="Stammdaten">
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Field label="Ticker" value={security.ticker} />
              <Field label="ISIN" value={security.isin} />
              <Field label="WKN" value={security.wkn} />
              <Field label="Land" value={security.country} />
              <Field label="Branche" value={security.sector} />
              <Field label="Währung" value={security.currency} />
              <Field
                label="Depot"
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
          </div>
        </Section>

        <Section title="Ausschüttungsplan">
          <div>
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
                {/* Die Zaehlregel gilt fuer jeden Plan gleich; ausgeschrieben
                    stand sie dreizeilig unter jeder Monatsreihe und war laenger
                    als der Plan selbst. */}
                <Disclosure summary="Wie wird gezählt?">
                  <p className="text-muted-foreground">
                    Eine später eingetroffene Zahlung zählt für den geplanten Monat, für
                    den sie fällig war. Eine Zahlung im Monat direkt davor zählt für den
                    kommenden geplanten Monat — beides auch über den Jahreswechsel hinweg.
                  </p>
                </Disclosure>
              </div>
            )}
          </div>
        </Section>
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
