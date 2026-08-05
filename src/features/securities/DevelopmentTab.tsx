import * as React from "react";
import { Link } from "react-router";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
import { EntitySelect, type EntityOption } from "@/components/domain/EntitySelect";
import { FilterBar, FilterField, FilterReset } from "@/components/ui/filter-bar";
import {
  EUR,
  Money,
  MoneyDecimal,
  formatMoney,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import {
  aggregateInRange,
  filterPayments,
  trailingYearRange,
  type AnalyticsPayment,
  type StatisticsFilter,
} from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import type { EntityInfo } from "@/features/dashboard/format";
import { useStatisticsData, useStatisticsFilter } from "@/features/statistics/hooks";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";
import {
  entityArchived,
  entityName,
  formatCountNumber,
} from "@/features/statistics/format";
import {
  ComparisonLineChart,
  type ComparisonPoint,
} from "@/features/statistics/components/charts";
import {
  StatSearch,
  StatTable,
  type StatColumn,
} from "@/features/statistics/components/StatTable";
import type {
  AllocationBucket,
  PortfolioPoint,
  PortfolioSeries,
} from "@/features/securities/snapshots";

/** Eine Zeile der Gegenueberstellung je Asset. */
interface AssetRow {
  securityId: string;
  name: string;
  archived: boolean;
  expected: Money | null;
  received: Money;
  /**
   * **erwartet − erhalten**: um wie viel die kuenftige Jahresausschuettung ueber
   * dem liegt, was in den letzten zwoelf Monaten tatsaechlich kam.
   *
   * `null` nur, wenn die Quelle fuer ein **gehaltenes** Papier keinen Betrag
   * nennt — dann ist der Zuwachs unbekannt, nicht null. Fuer ein verkauftes
   * Papier steht er dagegen fest: Es traegt kuenftig nichts mehr bei, der
   * Zuwachs ist also der Wegfall des Erhaltenen.
   */
  growth: Money | null;
  yieldOnBuyin: DecimalInstance | null;
}

const HUNDRED = new MoneyDecimal(100);

/**
 * Unterbereich **Entwicklung** des Depots.
 *
 * Laedt die Datenbasis und traegt den Filter; die Darstellung steht in
 * {@link DevelopmentView}. Getrennt, weil die Aussagen dieses Bereichs — wie
 * der Zuwachs gerechnet wird, welches Fenster zaehlt — sich so ohne
 * Datenzugriffsschicht pruefen lassen.
 *
 * **Der Bereich stand frueher in der Statistik.** Er ist der einzige, der auf
 * den importierten Depotstaenden aufsetzt statt auf den erfassten Zahlungen
 * (docs/PORTFOLIO_IMPORT.md) — eine Frage des Depots, keine der Historie. Sein
 * alter Pfad `/statistiken/entwicklung` leitet dauerhaft hierher um.
 *
 * Die Datenbasis ist dieselbe wie in Uebersicht und Statistik
 * (`useStatisticsData`, geteilter Query-Cache) — es entsteht keine zweite
 * Aggregation, die auseinanderlaufen koennte.
 */
export function DevelopmentTab() {
  const { filter, setFilter } = useStatisticsFilter();
  // Der Filter geht in die Datenbasis hinein, weil die Depotstaende ihm ebenso
  // folgen muessen wie die Zahlungen (siehe useStatisticsData).
  const data = useStatisticsData(filter);

  const assetOptions = React.useMemo<EntityOption[]>(
    () =>
      [...data.securities.entries()].map(([id, info]) => ({
        id,
        name: info.name,
        archived: info.archived,
      })),
    [data.securities],
  );

  if (data.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Entwicklung wird geladen …</span>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4 sm:p-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (data.isError) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Entwicklung konnte nicht geladen werden"
        description={getErrorMessage(
          data.error,
          "Beim Laden der Dividendendaten ist ein Fehler aufgetreten.",
        )}
        action={<Button onClick={data.refetch}>Erneut versuchen</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Nur **ein** Regler, und zwar der einzige, der hier auf beiden Seiten
          des Vergleichs wirkt. Jahr und Depotkonto waeren wirkungslos (siehe
          `DevelopmentView`), und ein wirkungsloses Bedienelement ist schlimmer
          als keines. */}
      <FilterBar activeCount={filter.securityId === null ? 0 : 1}>
        <FilterField id="depot-development-asset" label="Asset">
          <EntitySelect
            id="depot-development-asset"
            options={assetOptions}
            value={filter.securityId ?? ""}
            onChange={(value) => {
              setFilter({ ...filter, securityId: value || null });
            }}
            allLabel="Alle Assets"
          />
        </FilterField>
        {filter.securityId !== null && (
          <FilterReset
            onClick={() => {
              setFilter(EMPTY_STATISTICS_FILTER);
            }}
          />
        )}
      </FilterBar>

      <DevelopmentView
        allPayments={data.payments}
        securities={data.securities}
        filter={filter}
        portfolio={data.portfolio}
      />
    </div>
  );
}

/**
 * Die Darstellung der Entwicklung.
 *
 * Beantwortet eine Frage: **Waechst mein passives Einkommen?** Dafuer stellt sie
 * die erwartete Jahresdividende aus den Depotstaenden dem gegenueber, was
 * tatsaechlich hereinkam — und zeigt beides ueber die Zeit, sobald mehrere
 * Staende vorliegen.
 *
 * **Die Richtung ist „Zuwachs", nicht „Abweichung".** „Erwartet p. a." ist kein
 * Ziel, das verfehlt werden koennte, sondern die Ertragskraft des heutigen
 * Depots. Wer weiter investiert, hat sie zwangslaeufig ueber dem, was in den
 * zwoelf Monaten davor mit kleinerem Bestand hereinkam — als Soll-Ist-Rechnung
 * gelesen stuende dort dauerhaft eine rote Zahl fuer genau den Vorgang, der gut
 * laeuft. Gerechnet wird deshalb erwartet minus erhalten.
 *
 * **Verglichen werden zwei Zwoelfmonatszeitraeume.** Die Erwartung gilt fuer
 * zwoelf Monate nach vorn; ihr Gegenstueck sind deshalb die zwoelf Monate, die
 * am Stichtag enden — nicht das Kalenderjahr. Ein angebrochenes Jahr liesse die
 * Erwartung zwangslaeufig zu hoch aussehen, und ein abgeschlossenes hinkte bis
 * zu zwoelf Monate hinterher.
 *
 * **Der Assetfilter wirkt auf beiden Seiten.** Ist eines ausgewaehlt, folgen ihm
 * die Depotstaende ebenso wie die Zahlungen (`useStatisticsData`); sonst stuende
 * dessen erhaltene Summe neben der erwarteten Jahresdividende des ganzen
 * Depots. Jahres- und Depotkontoregler bietet die Filterleiste hier gar nicht
 * erst an, und diese Ansicht ignoriert sie (siehe unten).
 *
 * Wie ueberall gilt: Kein Wert der Depotstaende geht in eine Kennzahl der
 * Statistik ein (PRODUCT_SPEC.md Grundsatz 8). Sie stehen hier *neben* den
 * erhaltenen Betraegen, nicht in ihnen.
 */
export function DevelopmentView({
  allPayments,
  securities,
  filter,
  portfolio,
}: {
  /** Alle aktiven Zahlungen mit effektivem Datum, ungefiltert. */
  allPayments: readonly AnalyticsPayment[];
  securities: Map<string, EntityInfo>;
  filter: StatisticsFilter;
  portfolio: PortfolioSeries;
}) {
  const [query, setQuery] = React.useState("");

  const latest = portfolio.latest;

  /**
   * Von den drei Filtern wirkt hier nur das **Asset** — und zwar auf beiden
   * Seiten des Vergleichs: Die Depotstaende folgen ihm ebenso
   * (`useStatisticsData`).
   *
   * **Jahr** und **Depotkonto** werden ausdruecklich verworfen, auch wenn sie
   * noch als Suchparameter in der Adresse stehen (etwa nach einem Wechsel aus
   * der Statistik):
   *
   * * Das Jahr, weil die Zeitachse die Stichtage sind und zu jedem ein eigenes
   *   Zwoelfmonatsfenster gehoert — ein Jahresfilter liesse sie leer laufen.
   * * Das Depotkonto, weil der Portfolio-Export alle Konten zusammenfasst und
   *   keines nennt (docs/PORTFOLIO_IMPORT.md §3). Angewandt traefe er nur die
   *   erhaltenen Zahlungen und liesse die erwarteten unberuehrt — die Differenz
   *   waere still falsch. Die Filterleiste bietet beide Regler gar nicht an.
   */
  const payments = React.useMemo(
    () => filterPayments(allPayments, { ...filter, year: null, depotId: null }),
    [allPayments, filter],
  );

  /** Erhalten in den zwoelf Monaten, die am jeweiligen Stichtag enden. */
  const receivedAt = React.useCallback(
    (asOf: string, rows: readonly AnalyticsPayment[] = payments) =>
      aggregateInRange(rows, trailingYearRange(asOf)).net,
    [payments],
  );

  const points = React.useMemo<ComparisonPoint[]>(
    () =>
      portfolio.points
        .filter((point): point is PortfolioPoint & { annualDividend: Money } =>
          Boolean(point.annualDividend),
        )
        .map((point) => {
          const received = receivedAt(point.asOf);
          return {
            label: formatCalendarDate(point.asOf).slice(0, 6) + point.asOf.slice(2, 4),
            current: received.toChartNumber(),
            reference: point.annualDividend.toChartNumber(),
            currentMoney: received,
            referenceMoney: point.annualDividend,
          };
        }),
    [portfolio.points, receivedAt],
  );

  const assetRows = React.useMemo<AssetRow[]>(() => {
    if (latest === null) return [];
    const range = trailingYearRange(latest.asOf);
    const ids = new Set<string>([
      ...portfolio.expectedBySecurity.keys(),
      ...payments
        .filter(
          (payment) => payment.payDate >= range.start && payment.payDate <= range.end,
        )
        .map((payment) => payment.securityId),
    ]);

    return [...ids].map((securityId) => {
      const expected = portfolio.expectedBySecurity.get(securityId) ?? null;
      const received = aggregateInRange(
        payments.filter((payment) => payment.securityId === securityId),
        range,
      ).net;
      // Ein verkauftes Papier traegt kuenftig nichts mehr bei — sein Zuwachs
      // ist der Wegfall des Erhaltenen. Ein gehaltenes ohne Betrag der Quelle
      // bleibt dagegen unbekannt; daraus zu rechnen hiesse, das Schweigen der
      // Quelle als Null zu lesen.
      const held = portfolio.heldSecurityIds.has(securityId);
      const growth = expected
        ? expected.subtract(received)
        : held
          ? null
          : received.negate();
      return {
        securityId,
        name: entityName(securities, securityId),
        archived: entityArchived(securities, securityId),
        expected,
        received,
        growth,
        yieldOnBuyin: portfolio.yieldOnBuyinBySecurity.get(securityId) ?? null,
      };
    });
  }, [latest, portfolio, payments, securities]);

  const columns = React.useMemo<StatColumn<AssetRow>[]>(
    () => [
      {
        key: "name",
        header: "Asset",
        headerLabel: "Name (alphabetisch)",
        compare: (a, b) => a.name.localeCompare(b.name, "de"),
        render: (row) => (
          <Link
            to={`/depot/${row.securityId}`}
            className="truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.name}
          </Link>
        ),
      },
      {
        key: "expected",
        header: "Erwartet p. a.",
        headerLabel: "Erwartete Jahresdividende laut Depotstand",
        align: "right",
        compare: (a, b) =>
          (a.expected?.toChartNumber() ?? 0) - (b.expected?.toChartNumber() ?? 0),
        render: (row) =>
          row.expected ? (
            <AmountText amount={row.expected} />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "received",
        header: "Erhalten",
        headerLabel: "Erhalten in den letzten zwölf Monaten",
        align: "right",
        compare: (a, b) => a.received.compareTo(b.received),
        render: (row) => <AmountText amount={row.received} />,
      },
      {
        key: "growth",
        header: "Zuwachs",
        headerLabel: "Erwartet abzüglich erhalten",
        align: "right",
        compare: (a, b) =>
          (a.growth?.toChartNumber() ?? 0) - (b.growth?.toChartNumber() ?? 0),
        render: (row) =>
          row.growth ? (
            <AmountText amount={row.growth} showSign />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "yieldOnBuyin",
        header: "Auf Einstand",
        headerLabel: "Rendite auf den Einstand",
        align: "right",
        // Nebenkennzahl: tritt zurueck, wo der Platz nicht fuer alle Spalten
        // reicht — dieselbe Regel wie bei der groessten Zahlung im
        // Assetbereich.
        className: "hidden xl:table-cell",
        compare: (a, b) =>
          (a.yieldOnBuyin?.toNumber() ?? 0) - (b.yieldOnBuyin?.toNumber() ?? 0),
        render: (row) =>
          row.yieldOnBuyin ? (
            formatPercent(row.yieldOnBuyin, 2)
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  if (latest === null) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Noch kein Depotstand importiert"
        description="Dieser Bereich stellt die erwartete Jahresdividende dem gegenüber, was tatsächlich hereinkam. Dafür braucht er mindestens einen Depotstand aus dem DivvyDiary-Portfolio-Export."
        action={
          <Button asChild>
            {/* Der Portfolio-Import steht am Ende der Assetliste — dem
                Nachbarreiter, nicht irgendwo sonst. */}
            <Link to="/depot">Zu den Assets</Link>
          </Button>
        }
      />
    );
  }

  const expected = latest.annualDividend;
  const received = receivedAt(latest.asOf);

  /**
   * **Zuwachs: erwartet − erhalten**, nicht umgekehrt.
   *
   * „Erwartet p. a." ist kein Ziel, das verfehlt werden koennte — es ist die
   * Ertragskraft des heutigen Depots. Wer weiter investiert, hat sie zwangs-
   * laeufig ueber dem, was in den zwoelf Monaten davor mit einem kleineren
   * Bestand hereinkam. Als „Abweichung" (erhalten − erwartet) stand dort
   * dauerhaft eine rote Zahl fuer genau den Vorgang, der gut laeuft.
   *
   * Faellt der Zuwachs negativ aus — Verkaeufe, gekuerzte Dividenden, eine
   * Sonderausschuettung im Vorjahr —, ist das ein echter Rueckgang und darf
   * rot sein. Das Vorzeichen sagt dann die Wahrheit statt einer Konvention.
   */
  const growth = expected ? expected.subtract(received) : null;
  /**
   * Gemessen am **Erhaltenen**, nicht an der Erwartung: Eine Wachstumsrate
   * bezieht sich auf den Ausgangswert, aus dem gewachsen wurde.
   */
  const growthPercent =
    growth && !received.isZero()
      ? growth.toDecimal().dividedBy(received.toDecimal()).times(HUNDRED)
      : null;
  const yieldOnBuyin =
    expected && latest.buyinTotal && !latest.buyinTotal.isZero()
      ? expected.toDecimal().dividedBy(latest.buyinTotal.toDecimal()).times(HUNDRED)
      : null;
  const range = trailingYearRange(latest.asOf);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Erwartet p. a."
          value={expected ? <AmountText amount={expected} /> : <span>—</span>}
          comparison={`Stand ${formatCalendarDate(latest.asOf)}`}
        />
        <StatCard
          label="Erhalten"
          value={<AmountText amount={received} />}
          comparison={`${formatCalendarDate(range.start)} – ${formatCalendarDate(range.end)}`}
        />
        <StatCard
          label="Zuwachs"
          value={growth ? <AmountText amount={growth} showSign /> : <span>—</span>}
          comparison={
            growthPercent
              ? // Vorzeichen wie beim Betrag darueber, damit beide Zeilen
                // dasselbe sagen.
                `${growthPercent.isPositive() ? "+" : ""}${formatPercent(
                  growthPercent,
                  1,
                )} gegenüber den letzten zwölf Monaten`
              : undefined
          }
        />
        <StatCard
          label="Rendite auf Einstand"
          value={
            yieldOnBuyin ? <span>{formatPercent(yieldOnBuyin, 2)}</span> : <span>—</span>
          }
          comparison={
            latest.buyinTotal ? (
              <span>
                Einstand <AmountText amount={latest.buyinTotal} />
              </span>
            ) : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Erwartet und erhalten im Verlauf</CardTitle>
        </CardHeader>
        <CardContent>
          {points.length < 2 ? (
            // Mit einem einzigen Stichtag gibt es keine Entwicklung zu zeigen.
            // Eine Linie durch einen Punkt waere eine Behauptung ueber einen
            // Verlauf, den es noch nicht gibt.
            <p className="py-6 text-sm text-muted-foreground">
              Ein Verlauf entsteht ab dem zweiten Depotstand. Lade den Portfolio-Export
              künftig regelmäßig hoch — jeder Upload setzt einen weiteren Punkt auf diese
              Achse.
            </p>
          ) : (
            <ComparisonLineChart
              points={points}
              currentLabel="Erhalten (12 Monate)"
              referenceLabel="Erwartet p. a."
              ariaLabel="Erwartete und tatsächlich erhaltene Dividenden je Stichtag"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Erwartet gegen erhalten je Asset</CardTitle>
          <StatSearch value={query} onChange={setQuery} placeholder="Asset suchen …" />
        </CardHeader>
        <CardContent>
          <StatTable
            rows={assetRows}
            columns={columns}
            getRowKey={(row) => row.securityId}
            query={query}
            searchOf={(row) => row.name}
            initialSort={{ key: "growth", direction: "desc" }}
            caption="Erwartete und erhaltene Dividenden je Asset"
            emptyMessage="Kein Asset mit Bestand oder Zahlung in diesem Zeitraum."
          />
        </CardContent>
      </Card>

      {/* Bei einem einzelnen Asset saehe die Aufteilung immer gleich aus:
          eine Branche, ein Land, jeweils 100 %. Eine Aussage, die aus der
          Auswahl folgt statt aus den Daten, ist keine. */}
      {filter.securityId === null && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <AllocationCard
            title="Aufteilung nach Branche"
            buckets={portfolio.bySector}
            total={latest.marketValue}
          />
          <AllocationCard
            title="Aufteilung nach Land"
            buckets={portfolio.byCountry}
            total={latest.marketValue}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Anteile am Depot mit ihrem Beitrag zur erwarteten Jahresdividende.
 *
 * Zwei Zahlen je Zeile, weil sie auseinanderfallen koennen und genau das
 * interessant ist: Eine Branche kann ein Fuenftel des Depotwerts stellen und ein
 * Drittel der erwarteten Ausschuettung — oder umgekehrt.
 */
function AllocationCard({
  title,
  buckets,
  total,
}: {
  title: string;
  buckets: readonly AllocationBucket[];
  total: Money | null;
}) {
  const totalValue = total ?? Money.zero(EUR);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {buckets.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Keine Angaben im aktuellen Depotstand.
          </p>
        ) : (
          <ul className="space-y-3">
            {buckets.map((bucket) => {
              const share = totalValue.isZero()
                ? null
                : bucket.marketValue
                    .toDecimal()
                    .dividedBy(totalValue.toDecimal())
                    .times(HUNDRED);
              return (
                <li key={bucket.key || "unknown"}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{bucket.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {share ? formatPercent(share, 1) : "—"}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden>
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${String(share ? Math.max(1, share.toNumber()) : 0)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMoney(bucket.marketValue)} ·{" "}
                    {formatMoney(bucket.annualDividend)} erwartet ·{" "}
                    {formatCountNumber(bucket.positions)}{" "}
                    {bucket.positions === 1 ? "Position" : "Positionen"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
