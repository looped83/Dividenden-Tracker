import * as React from "react";
import { Link } from "react-router";
import { useBackState } from "@/lib/hooks/useBackState";
import { TrendingUp } from "lucide-react";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiHero, KpiHeroSkeleton, TrendPill } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { EntitySelect, type EntityOption } from "@/components/domain/EntitySelect";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { DepotHeaderActions } from "./DepotHeaderActions";
import { Money, MoneyDecimal, formatPercent, type DecimalInstance } from "@/lib/money";
import {
  aggregateInRange,
  filterPayments,
  trailingYearRange,
  type AnalyticsPayment,
  type StatisticsFilter,
} from "@/lib/statistics";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { compareGerman } from "@/lib/utils/compareText";
import type { EntityInfo } from "@/features/dashboard/format";
import { useStatisticsData, useStatisticsFilter } from "@/features/statistics/hooks";
import { EMPTY_STATISTICS_FILTER } from "@/features/statistics/filterParams";
import { entityArchived, entityName } from "@/features/statistics/format";
import {
  ComparisonLineChart,
  type ComparisonPoint,
} from "@/features/statistics/components/charts";
import {
  StatSearch,
  StatTable,
  type StatColumn,
} from "@/features/statistics/components/StatTable";
import type { PortfolioPoint, PortfolioSeries } from "@/features/securities/snapshots";

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
   * `null`, wenn die Quelle fuer das Papier keinen Betrag nennt — dann ist der
   * Zuwachs unbekannt, nicht null.
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
        <KpiHeroSkeleton stats={2} />
        <Skeleton className="h-72 rounded-lg" />
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
          als keines. Er steht im Seitenkopf wie die Jahresauswahl der
          Uebersicht; „Alle Assets" setzt ihn zurueck. */}
      {/* Ohne Depotstand zeigt die Seite nur den Leerzustand — ein Regler
          dort bewirkte nichts. */}
      {data.portfolio.latest !== null && (
        <DepotHeaderActions>
          <EntitySelect
            id="depot-development-asset"
            aria-label="Asset"
            className="w-auto max-w-[12rem] truncate rounded-full pl-4 font-semibold sm:max-w-xs"
            options={assetOptions}
            value={filter.securityId ?? ""}
            onChange={(value) => {
              setFilter({ ...EMPTY_STATISTICS_FILTER, securityId: value || null });
            }}
            allLabel="Alle Assets"
          />
        </DepotHeaderActions>
      )}

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
  const backState = useBackState();
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  const search = (
    <StatSearch value={query} onChange={setQuery} placeholder="Asset suchen …" />
  );

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

  /**
   * Die Tabelle zeigt **nur, was heute im Depot liegt** — die Papiere des
   * juengsten Stands (`heldSecurityIds`).
   *
   * Verkaufte standen frueher mit ihrem Wegfall darin, und das war eine andere
   * Frage als die dieses Bereichs: Er sagt, ob die Ertragskraft des *heutigen*
   * Depots waechst. Ein Papier, das nicht mehr gehalten wird, hat darauf keine
   * Antwort mehr — es fuellte die Liste mit Zeilen, an denen nichts mehr zu
   * entscheiden ist, und schob mit seinem negativen Zuwachs die Sortierung
   * nach unten. Was es beigetragen hat, steht weiterhin in der Historie
   * (Statistik, Detailseite).
   *
   * Die Kacheln daruber bleiben unberuehrt: Ihr „Erhalten" ist die volle Summe
   * der letzten zwoelf Monate, verkaufte Papiere eingeschlossen — sonst
   * verglichen sie zwei verschieden zusammengesetzte Grundgesamtheiten.
   */
  const assetRows = React.useMemo<AssetRow[]>(() => {
    if (latest === null) return [];
    const range = trailingYearRange(latest.asOf);

    return [...portfolio.heldSecurityIds].map((securityId) => {
      const expected = portfolio.expectedBySecurity.get(securityId) ?? null;
      const received = aggregateInRange(
        payments.filter((payment) => payment.securityId === securityId),
        range,
      ).net;
      // Ohne Betrag der Quelle bleibt der Zuwachs **unbekannt**, nicht null:
      // Daraus zu rechnen hiesse, das Schweigen der Quelle als Zahl zu lesen.
      const growth = expected ? expected.subtract(received) : null;
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

  // Feste Breiten fuer die Zahlenspalten: Sonst richtete sich jede Seite der
  // Tabelle nach ihren eigenen Betraegen, und die Spalten sprangen beim
  // Blaettern. Der Name nimmt den Rest und kuerzt, wo er nicht passt.
  const columns = React.useMemo<StatColumn<AssetRow>[]>(
    () => [
      {
        key: "name",
        header: "Asset",
        headerLabel: "Name (alphabetisch)",
        compare: (a, b) => compareGerman(a.name, b.name),
        render: (row) => (
          <Link
            to={`/depot/${row.securityId}`}
            state={backState}
            title={row.name}
            className="block w-fit max-w-full truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.name}
          </Link>
        ),
      },
      {
        key: "expected",
        width: "w-36",
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
        width: "w-32",
        header: "Erhalten",
        headerLabel: "Erhalten in den letzten zwölf Monaten",
        align: "right",
        compare: (a, b) => a.received.compareTo(b.received),
        render: (row) => <AmountText amount={row.received} />,
      },
      {
        key: "growth",
        width: "w-32",
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
        width: "w-32",
        listHidden: true,
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
    [backState],
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
    <div className="space-y-10">
      {/* Die Erwartung ist die Hauptzahl, der Zuwachs gegenueber dem
          Erhaltenen ihre Marke; das Erhaltene und die Rendite auf den Einstand
          stehen darunter. Vier gleich grosse Kacheln liessen offen, welche
          Zahl die Frage des Bereichs beantwortet. */}
      <KpiHero
        label={`Erwartet p. a. · Stand ${formatCalendarDate(latest.asOf)}`}
        value={expected ? <AmountText amount={expected} /> : "—"}
        trend={
          growthPercent ? (
            <TrendPill
              tone={
                growthPercent.isNegative()
                  ? "negative"
                  : growthPercent.isZero()
                    ? "neutral"
                    : "positive"
              }
              title="gegenüber den letzten zwölf Monaten"
            >
              {formatPercent(growthPercent.abs(), 1)}
            </TrendPill>
          ) : undefined
        }
        caption={
          growth ? (
            <>
              {/* Kurz, damit die Zeile auf dem Telefon nicht umbricht; das
                  Fenster nennt die Kachel „Erhalten (12 Monate)" darunter. */}
              <AmountText amount={growth} showSign /> ggü. letzten 12 Monaten
            </>
          ) : undefined
        }
        stats={[
          {
            label: "Erhalten (12 Monate)",
            value: <AmountText amount={received} />,
            // Der Beginn folgt aus den zwölf Monaten; beide Daten brachen um.
            caption: `bis ${formatCalendarDate(range.end)}`,
          },
          {
            label: "Rendite auf Einstand",
            value: yieldOnBuyin ? formatPercent(yieldOnBuyin, 2) : "—",
            caption: latest.buyinTotal ? (
              <>
                Einstand <AmountText amount={latest.buyinTotal} />
              </>
            ) : undefined,
          },
        ]}
      />

      <Section title="Erwartet und erhalten im Verlauf">
        <div>
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
              // Die Ueberschrift nennt beide Linien, der Tooltip benennt sie
              // je Stichtag; eine Legende darunter wiederholte nur das.
              showLegend={false}
            />
          )}
        </div>
      </Section>

      {/* Breit sitzt die Suche rechts neben der Ueberschrift, auf dem Telefon
          in einer Zeile mit der Sortierung (wie in der Unternehmensstatistik)
          — darueber in eigener Zeile kostete sie eine ganze Zeilenhoehe. */}
      <Section
        title="Erwartet gegen erhalten je Asset"
        actionClassName="-my-3 w-64"
        {...(isWide && { action: search })}
      >
        <div>
          <StatTable
            rows={assetRows}
            columns={columns}
            getRowKey={(row) => row.securityId}
            query={query}
            searchOf={(row) => row.name}
            {...(!isWide && { beforeSort: search })}
            initialSort={{ key: "growth", direction: "desc" }}
            caption="Erwartete und erhaltene Dividenden je gehaltenem Asset"
            emptyMessage="Kein Asset im aktuellen Depotstand."
            // Auf dem Telefon eine Zusatzzeile statt drei beschrifteter. Rechts
            // steht der Zuwachs, nach dem die Liste sortiert ist; darunter
            // beide Seiten der Rechnung, jede mit ihrem Namen. Zuvor stand
            // rechts die Erwartung ohne Beschriftung und der Zuwachs als
            // nackte Zahl hinter „erhalten" — was welche Zahl war, musste man
            // raten.
            listSummary={{
              value: (row) =>
                row.growth ? (
                  <>
                    <span className="sr-only">Zuwachs </span>
                    <AmountText amount={row.growth} showSign />
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
              meta: (row) => (
                <>
                  erwartet {row.expected ? <AmountText amount={row.expected} /> : "—"}
                  {" · "}erhalten <AmountText amount={row.received} />
                </>
              ),
            }}
          />
        </div>
      </Section>
    </div>
  );
}
