import * as React from "react";
import { Link, useNavigate } from "react-router";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { StatSearch, StatTable, type StatColumn } from "./components/StatTable";

const TOP_COMPANIES = 10;

/**
 * Erste und letzte Zahlung in **einer** Spalte.
 *
 * Als zwei Spalten („Erste Zahlung", „Letzte Zahlung") lief die Tabelle auf
 * dem Schreibtisch rechts aus dem Bild — zwei Spaltenkoepfe und vier
 * Innenabstaende fuer zwei Daten, die ohnehin zusammen gelesen werden. Als
 * Zeitraum stehen beide weiterhin da und brauchen die Haelfte des Platzes.
 * Faellt beides auf denselben Tag, steht er einmal.
 */
function periodCell(first: string | null, last: string | null): React.ReactNode {
  const single = first ?? last;
  if (single === null) return <span className="text-muted-foreground">—</span>;
  if (first === null || last === null || first === last) return formatIsoDate(single);
  // Gewoehnliche Leerzeichen um den Halbgeviertstrich: Auf schmalen Geraeten
  // darf der Zeitraum umbrechen, statt die Spalte auf seine volle Laenge zu
  // zwingen.
  return `${formatIsoDate(first)} – ${formatIsoDate(last)}`;
}

export function CompaniesTab() {
  const { payments, securities, filter, portfolio } = useStatisticsContext();
  const expectedById = portfolio.expectedBySecurity;
  const navigate = useNavigate();

  const labelOf = React.useCallback(
    (securityId: string) => entityName(securities, securityId),
    [securities],
  );

  // Die Suche liegt hier statt in der Tabelle: Auf breiten Schirmen steht sie
  // in der Kopfzeile der Kachel, neben der Ueberschrift.
  const [query, setQuery] = React.useState("");
  // Archivierte Unternehmen sind abgeschlossene Positionen und wuerden die
  // Tabelle verlaengern, ohne die laufende Entwicklung zu erklaeren. Sie bleiben
  // wie in der Unternehmensverwaltung zuschaltbar (unterhalb der Tabelle).
  const [showArchived, setShowArchived] = React.useState(false);

  const stats = React.useMemo(() => securityStatistics(payments), [payments]);
  const sorted = React.useMemo(
    () => sortSecurityStatistics(stats, "net", labelOf),
    [stats, labelOf],
  );

  const hasArchived = React.useMemo(
    () => sorted.some((row) => entityArchived(securities, row.securityId)),
    [sorted, securities],
  );
  const tableRows = React.useMemo(
    () =>
      showArchived
        ? sorted
        : sorted.filter((row) => !entityArchived(securities, row.securityId)),
    [sorted, showArchived, securities],
  );

  const total = React.useMemo(() => aggregate(payments).net, [payments]);
  // Die Rangliste zeigt **nur aktive** Unternehmen: Sie beantwortet „woher
  // kommen meine Dividenden", und eine geschlossene Position gehoert nicht mehr
  // zu dieser Antwort — sie stand in der Vergangenheit oft weit oben und
  // verdraengte die laufenden Zahler aus den ersten zehn Plaetzen. Die
  // Gesamtsumme bleibt die des Zeitraums (auch mit archivierten Zahlungen); die
  // Anteile sagen damit weiterhin „so viel Prozent aller Dividenden".
  // Archivierte bleiben in der Tabelle darunter zuschaltbar.
  const topItems = React.useMemo<RankedBarItem[]>(
    () =>
      sorted
        .filter((stat) => !entityArchived(securities, stat.securityId))
        .slice(0, TOP_COMPANIES)
        .map((stat) => ({
          key: stat.securityId,
          name: entityName(securities, stat.securityId),
          archived: false,
          net: stat.net,
          href: statisticsDrillHref(filter, { securityId: stat.securityId }),
        })),
    [sorted, securities, filter],
  );

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
            {/* Der Name fuehrt auf die Detailseite des Unternehmens; die
                uebrigen Zellen bleiben Drill-downs in die Zahlungsliste. Die
                Zeile beantwortet damit beide Fragen: „welche Zahlungen?" und
                „wie hat sich diese Position entwickelt?" */}
            <Link
              to={`/unternehmen/${row.securityId}`}
              className="truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {entityName(securities, row.securityId)}
            </Link>
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
      // Die erwartete Jahresdividende steht direkt neben der erhaltenen Summe:
      // erst dort wird aus zwei Zahlen ein Soll-Ist-Vergleich. Sie erscheint
      // nur, wenn ein Depotstand importiert ist — eine Spalte voller
      // Gedankenstriche waere nichts als verbrauchte Breite.
      ...(expectedById.size > 0
        ? [
            {
              key: "expected",
              header: "Erwartet p. a.",
              headerLabel: "Erwartete Jahresdividende laut Depotstand",
              align: "right" as const,
              className: "hidden lg:table-cell",
              compare: (a: SecurityStatistics, b: SecurityStatistics) =>
                (expectedById.get(a.securityId)?.toChartNumber() ?? 0) -
                (expectedById.get(b.securityId)?.toChartNumber() ?? 0),
              render: (row: SecurityStatistics) => {
                const expected = expectedById.get(row.securityId);
                return expected ? (
                  <AmountText amount={expected} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                );
              },
            },
          ]
        : []),
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
        // Die Nebenkennzahl der Tabelle — sie tritt zurueck, wo der Platz nicht
        // fuer alle Spalten reicht (unter 1280px bleiben neben der Sidebar
        // keine 700px). Auf der Unternehmensseite steht sie unabhaengig davon.
        className: "hidden xl:table-cell",
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
        key: "period",
        header: "Zeitraum",
        headerLabel: "Zeitraum, nach letzter Zahlung",
        // Sortiert wird nach der **letzten** Zahlung: Die Frage an dieser
        // Spalte ist „wer zahlt noch?", nicht „wer zahlte zuerst?".
        compare: (a, b) => (a.lastPayDate ?? "").localeCompare(b.lastPayDate ?? ""),
        render: (row) => periodCell(row.firstPayDate, row.lastPayDate),
      },
    ],
    [labelOf, securities, expectedById],
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
        <CardHeader>
          <CardTitle>Unternehmen nach Dividendensumme</CardTitle>
        </CardHeader>
        <CardContent>
          {topItems.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Kein aktives Unternehmen in dieser Auswahl — die Tabelle darunter zeigt die
              archivierten.
            </p>
          ) : (
            <RankedBars
              items={topItems}
              total={total}
              ariaLabel="Aktive Unternehmen nach Nettodividende"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Unternehmensstatistik</CardTitle>
          <div className="sm:-my-3 sm:w-64 sm:shrink-0">
            <StatSearch
              value={query}
              onChange={setQuery}
              placeholder="Unternehmen suchen …"
            />
          </div>
        </CardHeader>
        <CardContent>
          <StatTable
            rows={tableRows}
            columns={columns}
            getRowKey={(row) => row.securityId}
            caption="Kennzahlen je Unternehmen"
            searchOf={(row) => entityName(securities, row.securityId)}
            query={query}
            initialSort={{ key: "net", direction: "desc" }}
            emptyMessage={
              tableRows.length === 0 && hasArchived
                ? "Nur archivierte Unternehmen in dieser Auswahl — unten einblenden."
                : "Keine Daten für die aktuelle Auswahl."
            }
            onRowClick={(row) =>
              void navigate(statisticsDrillHref(filter, { securityId: row.securityId }))
            }
            rowLabel={(row) =>
              `Dividendeneingänge von ${entityName(securities, row.securityId)} anzeigen`
            }
          />
          {/* Nebenschalter am Fuss der Kachel, abgesetzt durch eine Trennlinie —
              dasselbe Muster wie unter der Unternehmensliste. */}
          <div className="mt-4 border-t border-border pt-4">
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={showArchived}
                onChange={(event) => {
                  setShowArchived(event.target.checked);
                }}
              />
              Archivierte anzeigen
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
