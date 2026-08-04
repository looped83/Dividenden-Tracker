import * as React from "react";
import { Link } from "react-router";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/domain/StatCard";
import { AmountText } from "@/components/money/AmountText";
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
} from "@/lib/statistics";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import type { AllocationBucket, PortfolioPoint } from "@/features/securities/snapshots";
import { useStatisticsContext } from "./context";
import { entityArchived, entityName, formatCountNumber } from "./format";
import { ComparisonLineChart, type ComparisonPoint } from "./components/charts";
import { StatSearch, StatTable, type StatColumn } from "./components/StatTable";

/** Eine Zeile der Soll-Ist-Tabelle je Unternehmen. */
interface CompanyRow {
  securityId: string;
  name: string;
  archived: boolean;
  expected: Money | null;
  received: Money;
  /** erhalten − erwartet; `null`, wenn es keine Erwartung gibt. */
  difference: Money | null;
  yieldOnBuyin: DecimalInstance | null;
}

const HUNDRED = new MoneyDecimal(100);

/**
 * Unterbereich **Entwicklung** (PRODUCT_SPEC.md §11).
 *
 * Beantwortet eine Frage: **Waechst mein passives Einkommen?** Dafuer stellt er
 * die erwartete Jahresdividende aus den Depotstaenden dem gegenueber, was
 * tatsaechlich hereinkam — und zeigt beides ueber die Zeit, sobald mehrere
 * Staende vorliegen.
 *
 * **Verglichen werden zwei Zwoelfmonatszeitraeume.** Die Erwartung gilt fuer
 * zwoelf Monate nach vorn; ihr Gegenstueck sind deshalb die zwoelf Monate, die
 * am Stichtag enden — nicht das Kalenderjahr. Ein angebrochenes Jahr liesse die
 * Erwartung zwangslaeufig zu hoch aussehen, und ein abgeschlossenes hinkte bis
 * zu zwoelf Monate hinterher.
 *
 * **Dieser Bereich nutzt die ungefilterten Zahlungen.** Seine Zeitachse sind
 * die Stichtage der Depotstaende; ein Jahresfilter darueber ergaebe leere
 * Zwoelfmonatsfenster. Die Filterleiste blendet den Jahresregler hier deshalb
 * aus (StatisticsPage) — dieselbe Regel wie beim Vergleich und beim Breakdown.
 *
 * Wie ueberall gilt: Kein Wert der Depotstaende geht in eine Kennzahl der
 * uebrigen Statistik ein (PRODUCT_SPEC.md Grundsatz 8). Sie stehen hier
 * *neben* den erhaltenen Betraegen, nicht in ihnen.
 */
export function DevelopmentTab() {
  const { allPayments, securities, filter, portfolio } = useStatisticsContext();
  const [query, setQuery] = React.useState("");

  const latest = portfolio.latest;

  /**
   * Unternehmen und Depot wirken hier wie ueberall, das **Jahr** nicht: Die
   * Zeitachse sind die Stichtage der Depotstaende, und zu jedem gehoert ein
   * eigenes Zwoelfmonatsfenster. Ein zusaetzlicher Jahresfilter liesse diese
   * Fenster leer laufen — deshalb blendet die Filterleiste den Jahresregler auf
   * diesem Reiter aus, und hier wird er auch dann ignoriert, wenn er noch als
   * Suchparameter in der Adresse steht.
   */
  const payments = React.useMemo(
    () => filterPayments(allPayments, { ...filter, year: null }),
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

  const companyRows = React.useMemo<CompanyRow[]>(() => {
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
      return {
        securityId,
        name: entityName(securities, securityId),
        archived: entityArchived(securities, securityId),
        expected,
        received,
        difference: expected ? received.subtract(expected) : null,
        yieldOnBuyin: portfolio.yieldOnBuyinBySecurity.get(securityId) ?? null,
      };
    });
  }, [latest, portfolio, payments, securities]);

  const columns = React.useMemo<StatColumn<CompanyRow>[]>(
    () => [
      {
        key: "name",
        header: "Unternehmen",
        headerLabel: "Name (alphabetisch)",
        compare: (a, b) => a.name.localeCompare(b.name, "de"),
        render: (row) => (
          <Link
            to={`/unternehmen/${row.securityId}`}
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
        key: "difference",
        header: "Abweichung",
        headerLabel: "Erhalten abzüglich erwartet",
        align: "right",
        compare: (a, b) =>
          (a.difference?.toChartNumber() ?? 0) - (b.difference?.toChartNumber() ?? 0),
        render: (row) =>
          row.difference ? (
            <AmountText amount={row.difference} showSign />
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
        // Unternehmensbereich.
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
            <Link to="/unternehmen">Zu den Unternehmen</Link>
          </Button>
        }
      />
    );
  }

  const expected = latest.annualDividend;
  const received = receivedAt(latest.asOf);
  const difference = expected ? received.subtract(expected) : null;
  const differencePercent =
    expected && !expected.isZero()
      ? difference?.toDecimal().dividedBy(expected.toDecimal()).times(HUNDRED)
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
          label="Abweichung"
          value={
            difference ? <AmountText amount={difference} showSign /> : <span>—</span>
          }
          comparison={
            differencePercent
              ? // Vorzeichen wie beim Betrag darueber: „3.040,0 % der Erwartung"
                // liest sich sonst wie „so viel ist hereingekommen", gemeint ist
                // aber der Abstand dazu.
                `${differencePercent.isPositive() ? "+" : ""}${formatPercent(
                  differencePercent,
                  1,
                )} gegenüber der Erwartung`
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
          <CardTitle>Erwartet gegen erhalten je Unternehmen</CardTitle>
          <StatSearch
            value={query}
            onChange={setQuery}
            placeholder="Unternehmen suchen …"
          />
        </CardHeader>
        <CardContent>
          <StatTable
            rows={companyRows}
            columns={columns}
            getRowKey={(row) => row.securityId}
            query={query}
            searchOf={(row) => row.name}
            initialSort={{ key: "expected", direction: "desc" }}
            caption="Erwartete und erhaltene Dividenden je Unternehmen"
            emptyMessage="Kein Unternehmen mit Bestand oder Zahlung in diesem Zeitraum."
          />
        </CardContent>
      </Card>

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
