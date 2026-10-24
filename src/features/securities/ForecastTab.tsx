import * as React from "react";
import { Link } from "react-router";
import { TrendingUp } from "lucide-react";
import { KpiHero, KpiHeroSkeleton, TrendPill } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItemBody, ListRow, ListTile } from "@/components/ui/list";
import { AmountInput } from "@/components/ui/amount-input";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EUR,
  Money,
  MoneyDecimal,
  formatMoney,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import { normalizePayoutMonths } from "@/lib/statistics/effectiveMonth";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { useToday } from "@/lib/hooks/useToday";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import {
  CategoryBarChart,
  SnowballChart,
  type CategoryDatum,
  type SnowballDatum,
} from "@/features/statistics/components/charts";
import { PortfolioImportButton, PortfolioImportDialog } from "./PortfolioImportDialog";
import {
  forecastTwelveMonths,
  monthGaps,
  type ForecastFacets,
  type MonthGap,
  type TwelveMonthForecast,
} from "./forecast";
import {
  AMOUNT_MAX,
  PERCENT_MAX,
  parseGermanNumber,
  useForecastSettings,
  useSaveForecastSettings,
} from "./forecastSettings";
import { useSecurities, useSecuritySnapshots } from "./hooks";
import {
  DEFAULT_SNOWBALL_SETTINGS,
  depotAssumptions,
  projectSnowball,
  type DepotAssumptions,
  type SnowballResult,
  type SnowballSettings,
} from "./snowball";

const HUNDRED = new MoneyDecimal(100);

/**
 * Unterbereich **Prognose** des Bestands: Was kommt in den naechsten zwoelf
 * Monaten — und ab wann tragen mich Dividenden?
 *
 * Alle Zahlen hier sind **Schaetzungen** und als solche beschriftet. Sie
 * entstehen beim Anzeigen aus Depotstand und erfassten Zahlungen
 * (dieselben Abfragen und derselbe Cache wie die uebrigen Bereiche) und werden
 * nie gespeichert — gespeichert sind nur die Annahmen des Schneeballs
 * (CALCULATION_RULES.md §14, PRODUCT_SPEC.md Grundsatz 8).
 */
export function ForecastTab() {
  const today = useToday();
  const { data: securities = [], isLoading: securitiesLoading } = useSecurities();
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSecuritySnapshots();
  const { payments, paymentsQuery } = useEffectivePayments();
  const settingsQuery = useForecastSettings();
  const [importOpen, setImportOpen] = React.useState(false);
  const openImport = React.useCallback(() => {
    setImportOpen(true);
  }, []);

  const facets = React.useMemo(() => {
    const map = new Map<string, ForecastFacets>();
    for (const security of securities) {
      map.set(security.id, {
        name: security.name,
        payoutMonths: normalizePayoutMonths(security.payout_months),
      });
    }
    return map;
  }, [securities]);

  const result = React.useMemo(
    () => forecastTwelveMonths({ snapshots, facets, payments, today }),
    [snapshots, facets, payments, today],
  );
  const depot = React.useMemo(() => depotAssumptions(snapshots), [snapshots]);

  const importDialog = (
    <PortfolioImportDialog open={importOpen} onOpenChange={setImportOpen} />
  );

  if (securitiesLoading || snapshotsLoading || paymentsQuery.isLoading) {
    return (
      <div className="space-y-10" aria-busy="true" aria-live="polite">
        <span className="sr-only">Prognose wird geladen …</span>
        <KpiHeroSkeleton stats={2} />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (result.kind === "empty" || depot === null) {
    return (
      <>
        <EmptyState
          icon={TrendingUp}
          title="Noch kein Depotstand importiert"
          description="Die Prognose schätzt deine Dividenden der nächsten zwölf Monate und rechnet hoch, ab wann sie dein Ziel tragen. Dafür braucht sie einen Depotstand aus dem DivvyDiary-Portfolio-Export."
          action={<PortfolioImportButton onClick={openImport} />}
        />
        {importDialog}
      </>
    );
  }

  if (result.kind === "mixedCurrency") {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        Der Depotstand enthält Beträge in verschiedenen Währungen oder nicht in Euro. Ohne
        Umrechnung lässt sich keine Prognose bilden.
      </p>
    );
  }

  const { forecast } = result;

  return (
    <div className="space-y-10 lg:space-y-12">
      <ForecastSummary forecast={forecast} />

      <Section title="Nächste 12 Monate">
        <CategoryBarChart
          data={toBarData(forecast)}
          ariaLabel="Erwartete Nettodividende je Monat der nächsten zwölf Monate"
          categoryHeader="Monat"
          color="primary"
          showCount={false}
          emptyMessage="Für die nächsten zwölf Monate ist nichts zu erwarten."
        />
      </Section>

      <MonthGapsSection forecast={forecast} />

      <SnowballSection
        depot={depot}
        netRatio={forecast.netRatio}
        settings={settingsQuery.data ?? DEFAULT_SNOWBALL_SETTINGS}
        startYear={today.year}
      />

      {importDialog}
    </div>
  );
}

function ForecastSummary({ forecast }: { forecast: TwelveMonthForecast }) {
  const first = forecast.months[0];
  const last = forecast.months[forecast.months.length - 1];
  const average = Money.fromDecimal(forecast.total.toDecimal().dividedBy(12), EUR);
  const strongest = forecast.months.reduce((best, month) =>
    month.total.compareTo(best.total) > 0 ? month : best,
  );
  const received = forecast.receivedLast12;
  const change = received.isZero()
    ? null
    : forecast.total
        .toDecimal()
        .minus(received.toDecimal())
        .dividedBy(received.toDecimal())
        .times(HUNDRED);

  return (
    <KpiHero
      label="Erwartet in 12 Monaten · netto"
      value={<AmountText amount={forecast.total} />}
      trend={
        change ? (
          <TrendPill
            tone={
              change.isNegative() ? "negative" : change.isZero() ? "neutral" : "positive"
            }
            title="Gegenüber den letzten zwölf Monaten"
          >
            {formatPercent(change.abs(), 1)}
          </TrendPill>
        ) : undefined
      }
      caption={`${monthNameDeShort(first.month)} ${String(first.year)} – ${monthNameDeShort(last.month)} ${String(last.year)} · Ø ${formatMoneyWhole(average)} im Monat`}
      stats={[
        {
          label: "Erhalten",
          value: <AmountText amount={received} />,
          caption: "letzte 12 Monate",
        },
        {
          label: "Stärkster Monat",
          value: `${monthNameDe(strongest.month)} ${String(strongest.year)}`,
          caption: formatMoneyWhole(strongest.total),
        },
      ]}
    />
  );
}

const TOOLTIP_PAYERS = 3;

function toBarData(forecast: TwelveMonthForecast): CategoryDatum[] {
  return forecast.months.map((month) => ({
    key: `${String(month.year)}-${String(month.month)}`,
    label: monthNameDeShort(month.month),
    detail: `${monthNameDe(month.month)} ${String(month.year)}`,
    value: month.total.toChartNumber(),
    money: month.total,
    count: month.contributions.length,
    breakdown: month.contributions
      .slice(0, TOOLTIP_PAYERS)
      .map((item) => ({ name: item.name, money: item.amount })),
  }));
}

// --- Monatslücken -------------------------------------------------------------

/**
 * Monate unter dem Ø der Prognose, je mit dem Zukauf einer gehaltenen
 * Position, der die Lücke schließt (CALCULATION_RULES.md §14.3). Die Zeile
 * führt zum Asset — dort steht, was es zahlt und wann.
 */
function MonthGapsSection({ forecast }: { forecast: TwelveMonthForecast }) {
  const { average, gaps } = React.useMemo(() => monthGaps(forecast), [forecast]);
  return (
    <Section
      title="Monatslücken"
      description={`Monate unter deinem Ø von ${formatMoneyWhole(average)}`}
    >
      {gaps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kein Monat liegt unter deinem Ø.</p>
      ) : (
        <ListGroup>
          {gaps.map((gap) => (
            <li key={`${String(gap.year)}-${String(gap.month)}`}>
              <GapRow gap={gap} />
            </li>
          ))}
        </ListGroup>
      )}
    </Section>
  );
}

const RHYTHM: Record<number, string> = {
  1: "jährlich",
  2: "halbjährlich",
  4: "quartalsweise",
};

function GapRow({ gap }: { gap: MonthGap }) {
  const { filler } = gap;
  const body = (
    <>
      <ListTile primary={monthNameDeShort(gap.month)} secondary={String(gap.year)} />
      <ListItemBody
        title={
          <>
            <span className="sr-only">
              {monthNameDe(gap.month)} {gap.year}:{" "}
            </span>
            {formatMoneyWhole(gap.gap)} unter Ø
          </>
        }
        meta={
          filler ? (
            <span className="flex flex-col gap-0.5">
              <span>
                {filler.name} ·{" "}
                {RHYTHM[filler.payouts] ?? `${String(filler.payouts)}× im Jahr`}
              </span>
              <span className="tabular-amount">
                +{formatMoney(filler.perThousand)} je 1.000 € · bis Ø{" "}
                {formatMoneyWhole(filler.invest)}
              </span>
            </span>
          ) : (
            <span>Kein Füller im Bestand</span>
          )
        }
        trailing={
          <>
            {formatMoneyWhole(gap.total)}
            <span className="sr-only"> erwartet</span>
          </>
        }
      />
    </>
  );
  return filler ? (
    <ListRow asChild>
      <Link to={`/depot/${filler.securityId}`}>{body}</Link>
    </ListRow>
  ) : (
    <ListRow>{body}</ListRow>
  );
}

// --- Schneeball --------------------------------------------------------------

function SnowballSection({
  depot,
  netRatio,
  settings,
  startYear,
}: {
  depot: DepotAssumptions;
  netRatio: DecimalInstance | null;
  settings: SnowballSettings;
  startYear: number;
}) {
  const { mutate: save } = useSaveForecastSettings();
  const update = React.useCallback(
    (patch: Partial<SnowballSettings>) => {
      save({ ...settings, ...patch });
    },
    [save, settings],
  );

  const result = React.useMemo(
    () => projectSnowball({ depot, settings, netRatio, startYear }),
    [depot, settings, netRatio, startYear],
  );
  const chartData = React.useMemo(() => toSnowballData(result), [result]);
  const real = settings.inflationPercent > 0;

  return (
    <Section title="Schneeball">
      <div className="space-y-6">
        <SnowballHeadline result={result} settings={settings} />

        <SettingsList>
          <NumberField
            id="snowball-savings"
            max={AMOUNT_MAX}
            label="Sparrate"
            fullLabel="Sparrate pro Monat"
            suffix="€"
            value={settings.monthlySavings}
            onCommit={(value) => {
              update({ monthlySavings: value ?? 0 });
            }}
          />
          <NumberField
            id="snowball-target"
            max={AMOUNT_MAX}
            label="Ziel"
            fullLabel="Ziel pro Monat"
            suffix="€"
            value={settings.targetMonthly}
            onCommit={(value) => {
              update({ targetMonthly: value ?? 0 });
            }}
          />
          <NumberField
            id="snowball-growth"
            max={PERCENT_MAX}
            label="CAGR"
            fullLabel="Dividenden-CAGR"
            suffix="%"
            value={settings.growthPercent}
            placeholder={formatDecimal(depot.growthPercent)}
            onCommit={(value) => {
              update({ growthPercent: value });
            }}
          />
          <NumberField
            id="snowball-yield"
            max={PERCENT_MAX}
            label="Rendite"
            fullLabel="Rendite neuer Käufe"
            suffix="%"
            value={settings.yieldPercent}
            placeholder={formatDecimal(depot.yieldPercent)}
            onCommit={(value) => {
              update({ yieldPercent: value });
            }}
          />
          <NumberField
            id="snowball-inflation"
            max={PERCENT_MAX}
            label="Inflation"
            fullLabel="Inflation pro Jahr"
            suffix="%"
            value={settings.inflationPercent}
            onCommit={(value) => {
              update({ inflationPercent: value ?? 0 });
            }}
          />
          <SettingCell label="Reinvestieren" htmlFor="snowball-reinvest">
            <Select
              id="snowball-reinvest"
              aria-label="Dividenden reinvestieren"
              className="h-9 py-0"
              value={settings.reinvest ? "yes" : "no"}
              onChange={(event) => {
                update({ reinvest: event.target.value === "yes" });
              }}
            >
              <option value="yes">Ja</option>
              <option value="no">Nein</option>
            </Select>
          </SettingCell>
        </SettingsList>

        <SnowballChart
          data={chartData}
          target={settings.targetMonthly > 0 ? settings.targetMonthly : null}
          ariaLabel={`Hochgerechnete Nettodividende pro Monat bis ${String(startYear + chartData.length - 1)}${real ? " in heutiger Kaufkraft" : ""}`}
        />

        <Milestones result={result} startYear={startYear} />
      </div>
    </Section>
  );
}

/**
 * Kopf des Schneeballs im selben `KpiHero` wie der Seitenkopf: das Zieljahr
 * als Hauptzahl, rechts (auf dem Telefon darunter) der heutige Monatswert und
 * die Zieljahre der beiden Szenarien.
 */
function SnowballHeadline({
  result,
  settings,
}: {
  result: SnowballResult;
  settings: SnowballSettings;
}) {
  if (settings.targetMonthly <= 0) return null;
  const target = formatMoneyWhole(
    Money.fromDecimal(new MoneyDecimal(settings.targetMonthly), EUR),
  );
  const { targetYear, targetYearEarliest, targetYearLatest } = result;
  const first = result.points[0];
  const last = result.points[result.points.length - 1].year;
  const yearText = (year: number | null) =>
    year === null ? `nach ${String(last)}` : String(year);

  return (
    <KpiHero
      label={`Ziel ${target} im Monat`}
      value={yearText(targetYear)}
      caption={
        targetYear === null
          ? "Mit diesen Annahmen nicht innerhalb von 30 Jahren erreicht."
          : targetYear === first.year
            ? "Schon erreicht."
            : `in ${formatCountNoun(targetYear - first.year, "Jahr", "Jahren")}`
      }
      stats={[
        {
          label: "Heute",
          value: formatMoneyWhole(Money.fromDecimal(first.base, EUR)),
          caption: "netto im Monat",
        },
        {
          label: "Optimistisch",
          value: yearText(targetYearEarliest),
          caption: `${formatPercent(result.growthHighPercent)} CAGR`,
        },
        {
          label: "Vorsichtig",
          value: yearText(targetYearLatest),
          caption: `${formatPercent(result.growthLowPercent)} CAGR`,
        },
      ]}
    />
  );
}

function Milestones({
  result,
  startYear,
}: {
  result: SnowballResult;
  startYear: number;
}) {
  if (result.milestones.length === 0) return null;
  return (
    <ul
      className="divide-y divide-border border-y border-border text-sm"
      aria-label="Meilensteine"
    >
      {result.milestones.map((milestone) => (
        <li
          key={`${String(milestone.amount)}-${String(milestone.isTarget)}`}
          className="flex min-h-11 items-center justify-between gap-3 py-2"
        >
          <span className={milestone.isTarget ? "font-semibold" : undefined}>
            {formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(milestone.amount), EUR))}{" "}
            im Monat{milestone.isTarget && " · Ziel"}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {milestone.year === null
              ? "nicht absehbar"
              : milestone.year <= startYear
                ? "erreicht"
                : String(milestone.year)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function toSnowballData(result: SnowballResult): SnowballDatum[] {
  return result.points.map((point) => ({
    year: point.year,
    label: String(point.year),
    base: point.base.toNumber(),
    band: [point.low.toNumber(), point.high.toNumber()],
    baseMoney: Money.fromDecimal(point.base, EUR),
    lowMoney: Money.fromDecimal(point.low, EUR),
    highMoney: Money.fromDecimal(point.high, EUR),
  }));
}

// --- Eingabe -----------------------------------------------------------------

const inputNumberFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

/** Anzeige im Feld: „1.500", „2,5" — liest sich zurueck (parseGermanNumber). */
function formatDecimal(value: DecimalInstance | number): string {
  const decimal = typeof value === "number" ? new MoneyDecimal(value) : value;
  return inputNumberFormat.format(decimal.toDecimalPlaces(2).toNumber());
}

/**
 * Einstellungen als Liste auf gedaempfter Flaeche: Beschriftung links, Feld
 * rechts. Auf dem Telefon eine Spalte, ab `md` zwei — jede Zeile gleich hoch,
 * nichts haengt unter einem Feld.
 */
/**
 * Annahmen als dichtes Raster: mobil drei Spalten, ab md alle sechs in
 * einer Zeile.
 */
function SettingsList({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Annahmen"
      className="grid grid-cols-3 gap-x-3 gap-y-3 rounded-2xl bg-muted p-3 md:grid-cols-6 md:px-5 md:py-4"
    >
      {children}
    </div>
  );
}

function SettingCell({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1 block truncate text-xs text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Zahlenfeld, das erst beim Verlassen (oder Enter) speichert: Jeder
 * Tastendruck wuerde sonst eine Profilzeile schreiben und den Schneeball neu
 * rechnen, waehrend noch getippt wird. Ein leeres Feld mit Platzhalter steht
 * fuer den Wert aus dem Depot. Werte ueber `max` gelten wie Unsinn als
 * ungueltig und stellen den gespeicherten Wert wieder her.
 */
function NumberField({
  id,
  label,
  fullLabel,
  value,
  max,
  onCommit,
  suffix,
  placeholder,
}: {
  id: string;
  /** Kurz und sichtbar; `fullLabel` ist der Name fuer Screenreader. */
  label: string;
  fullLabel: string;
  value: number | null;
  max: number;
  onCommit: (value: number | null) => void;
  suffix: string;
  placeholder?: string;
}) {
  const shown = value === null ? "" : formatDecimal(value);
  const [draft, setDraft] = React.useState(shown);
  // Gespeicherter Wert hat sich geaendert (anderes Geraet, verworfene Eingabe):
  // Entwurf nachziehen — waehrend des Renderns, nicht in einem Effekt.
  const [lastShown, setLastShown] = React.useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    setDraft(shown);
  }

  const commit = () => {
    const parsed = parseGermanNumber(draft);
    if (parsed === undefined || (parsed !== null && parsed > max)) {
      setDraft(shown);
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <SettingCell label={label} htmlFor={id}>
      <div className="relative">
        <AmountInput
          id={id}
          aria-label={fullLabel}
          value={draft}
          placeholder={placeholder}
          className="h-9 bg-background pr-7 text-right tabular-nums"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
        >
          {suffix}
        </span>
      </div>
    </SettingCell>
  );
}
