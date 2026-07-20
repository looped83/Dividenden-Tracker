import * as React from "react";
import { useNavigate } from "react-router";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  aggregate,
  securityStatistics,
  sortSecurityStatistics,
  type SecurityStatistics,
} from "@/lib/statistics";
import { RankedBars, type RankedBarItem } from "@/features/dashboard/RankedBars";
import { useStatisticsContext } from "./context";
import {
  entityArchived,
  entityName,
  formatCountNumber,
  formatIsoDate,
  statisticsDrillHref,
} from "./format";
import { YearSparkline } from "./components/charts";
import { StatTable, type StatColumn } from "./components/StatTable";

const TOP_COMPANIES = 8;

function dateCell(iso: string | null): React.ReactNode {
  return iso ? formatIsoDate(iso) : <span className="text-muted-foreground">—</span>;
}

export function CompaniesTab() {
  const { payments, securities, filter } = useStatisticsContext();
  const navigate = useNavigate();

  const labelOf = React.useCallback(
    (securityId: string) => entityName(securities, securityId),
    [securities],
  );

  const stats = React.useMemo(() => securityStatistics(payments), [payments]);
  const sorted = React.useMemo(
    () => sortSecurityStatistics(stats, "net", labelOf),
    [stats, labelOf],
  );

  const total = React.useMemo(() => aggregate(payments).net, [payments]);
  const topItems = React.useMemo<RankedBarItem[]>(
    () =>
      sortSecurityStatistics(stats, "net", labelOf)
        .slice(0, TOP_COMPANIES)
        .map((stat) => ({
          key: stat.securityId,
          name: entityName(securities, stat.securityId),
          archived: entityArchived(securities, stat.securityId),
          net: stat.net,
          count: stat.count,
          href: statisticsDrillHref(filter, { securityId: stat.securityId }),
        })),
    [stats, labelOf, securities, filter],
  );

  const sparkMax = React.useMemo(() => {
    let max = 0;
    for (const stat of stats) {
      for (const bucket of stat.perYear) {
        const value = bucket.net.toChartNumber();
        if (value > max) max = value;
      }
    }
    return max;
  }, [stats]);

  const columns = React.useMemo<StatColumn<SecurityStatistics>[]>(
    () => [
      {
        key: "name",
        header: "Unternehmen",
        headerLabel: "Name (alphabetisch)",
        compare: (a, b) =>
          labelOf(a.securityId).localeCompare(labelOf(b.securityId), "de"),
        render: (row) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">
              {entityName(securities, row.securityId)}
            </span>
            {entityArchived(securities, row.securityId) && (
              <Badge variant="neutral" className="shrink-0">
                Archiviert
              </Badge>
            )}
          </span>
        ),
      },
      {
        key: "net",
        header: "Gesamtsumme",
        headerLabel: "Gesamtsumme",
        align: "right",
        compare: (a, b) => a.net.compareTo(b.net),
        render: (row) => <AmountText amount={row.net} />,
      },
      {
        key: "count",
        header: "Zahlungen",
        headerLabel: "Anzahl Zahlungen",
        align: "right",
        compare: (a, b) => a.count - b.count,
        render: (row) => formatCountNumber(row.count),
      },
      {
        key: "average",
        header: "Ø Zahlung",
        headerLabel: "Durchschnittszahlung",
        align: "right",
        compare: (a, b) => a.averagePayment.compareTo(b.averagePayment),
        render: (row) => <AmountText amount={row.averagePayment} />,
      },
      {
        key: "largest",
        header: "Größte Zahlung",
        headerLabel: "Größte Einzelzahlung",
        align: "right",
        compare: (a, b) =>
          (a.largestPayment?.toChartNumber() ?? 0) -
          (b.largestPayment?.toChartNumber() ?? 0),
        render: (row) =>
          row.largestPayment ? (
            <AmountText amount={row.largestPayment} />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "first",
        header: "Erste Zahlung",
        headerLabel: "Erstes Dividendendatum",
        compare: (a, b) => (a.firstPayDate ?? "").localeCompare(b.firstPayDate ?? ""),
        render: (row) => dateCell(row.firstPayDate),
      },
      {
        key: "last",
        header: "Letzte Zahlung",
        headerLabel: "Letztes Dividendendatum",
        compare: (a, b) => (a.lastPayDate ?? "").localeCompare(b.lastPayDate ?? ""),
        render: (row) => dateCell(row.lastPayDate),
      },
      {
        key: "development",
        header: "Entwicklung",
        render: (row) => (
          <YearSparkline
            points={row.perYear.map((bucket) => ({
              label: String(bucket.year),
              value: bucket.net.toChartNumber(),
              money: bucket.net,
            }))}
            maxValue={sparkMax}
          />
        ),
      },
    ],
    [labelOf, securities, sparkMax],
  );

  if (stats.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Keine Unternehmensdaten"
        description="Für den aktuellen Filter liegen keine Dividendeneingänge vor."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Unternehmen nach Dividendensumme</CardTitle>
          <p className="text-sm text-muted-foreground">
            Die {Math.min(TOP_COMPANIES, topItems.length)} stärksten Zahler im aktuellen
            Filter.
          </p>
        </CardHeader>
        <CardContent>
          <RankedBars
            items={topItems}
            total={total}
            ariaLabel="Unternehmen nach Nettodividende"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Unternehmensstatistik</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sortier- und durchsuchbar. Eine Zeile öffnet alle Dividendeneingänge des
            Unternehmens. Archivierte Unternehmen bleiben sichtbar.
          </p>
        </CardHeader>
        <CardContent>
          <StatTable
            rows={sorted}
            columns={columns}
            getRowKey={(row) => row.securityId}
            caption="Kennzahlen je Unternehmen"
            searchOf={(row) => entityName(securities, row.securityId)}
            searchPlaceholder="Unternehmen suchen …"
            initialSort={{ key: "net", direction: "desc" }}
            onRowClick={(row) =>
              void navigate(statisticsDrillHref(filter, { securityId: row.securityId }))
            }
            rowLabel={(row) =>
              `Dividendeneingänge von ${entityName(securities, row.securityId)} anzeigen`
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
