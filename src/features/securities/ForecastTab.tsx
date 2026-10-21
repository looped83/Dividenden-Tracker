import * as React from "react";
import { TrendingUp } from "lucide-react";
import { KpiHero, KpiHeroSkeleton, TrendPill } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Checkbox } from "@/components/ui/checkbox";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EUR,
  Money,
  MoneyDecimal,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import { normalizePayoutMonths } from "@/lib/statistics/effectiveMonth";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { useToday } from "@/lib/hooks/useToday";
import { useEffectivePayments } from "@/features/dashboard/hooks";
import { useResolvedCalendarEvents } from "@/features/calendar/resolvedEvents";
import {
  ForecastBarChart,
  SnowballChart,
  type ForecastBarDatum,
  type SnowballDatum,
} from "@/features/statistics/components/charts";
import { PortfolioImportButton, PortfolioImportDialog } from "./PortfolioImportDialog";
import {
  forecastTwelveMonths,
  type ForecastFacets,
  type TwelveMonthForecast,
} from "./forecast";
import {
  parseGermanNumber,
  useForecastSettings,
  useSaveForecastSettings,
} from "./forecastSettings";
import { useSecurities, useSecuritySnapshots } from "./hooks";
import {
  DEFAULT_SNOWBALL_SETTINGS,
  SCENARIO_SPREAD,
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
 * entstehen beim Anzeigen aus Depotstand, Kalender und erfassten Zahlungen
 * (dieselben Abfragen und derselbe Cache wie die uebrigen Bereiche) und werden
 * nie gespeichert — gespeichert sind nur die Annahmen des Schneeballs
 * (CALCULATION_RULES.md §14, PRODUCT_SPEC.md Grundsatz 8).
 */
export function ForecastTab() {
  const today = useToday();
  const { data: securities = [], isLoading: securitiesLoading } = useSecurities();
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSecuritySnapshots();
  const { payments, paymentsQuery } = useEffectivePayments();
  const { events } = useResolvedCalendarEvents();
  const settingsQuery = useForecastSettings();
  const [importOpen, setImportOpen] = React.useState(false);
  const openImport = React.useCallback(() => {
    setImportOpen(true);
  }, []);

  const { facets, securityIdByName } = React.useMemo(() => {
    const facetMap = new Map<string, ForecastFacets>();
    const idByName = new Map<string, string>();
    // Aktive vor archivierten: Bei gleichem Namen gehoert ein angekuendigter
    // Termin zum gehaltenen Papier.
    const ordered = [...securities].sort(
      (a, b) => (a.archived_at === null ? 0 : 1) - (b.archived_at === null ? 0 : 1),
    );
    for (const security of ordered) {
      facetMap.set(security.id, {
        name: security.name,
        payoutMonths: normalizePayoutMonths(security.payout_months),
      });
      if (!idByName.has(security.name)) idByName.set(security.name, security.id);
    }
    return { facets: facetMap, securityIdByName: idByName };
  }, [securities]);

  const result = React.useMemo(
    () =>
      forecastTwelveMonths({
        snapshots,
        facets,
        payments,
        events,
        securityIdByName,
        today,
      }),
    [snapshots, facets, payments, events, securityIdByName, today],
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

      <Section
        title="Nächste 12 Monate"
        description={<ForecastBasis forecast={forecast} />}
      >
        <ForecastBarChart
          data={toBarData(forecast)}
          ariaLabel="Erwartete Nettodividende je Monat der nächsten zwölf Monate"
        />
      </Section>

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
          label: "Angekündigt",
          value: <AmountText amount={forecast.announced} />,
          caption: "laut Kalender",
        },
      ]}
    />
  );
}

function ForecastBasis({ forecast }: { forecast: TwelveMonthForecast }) {
  const ratio = forecast.netRatio;
  return (
    <>
      Depotstand vom {formatCalendarDate(forecast.asOf)},{" "}
      {ratio === null
        ? "brutto (noch keine Zahlungen der letzten zwölf Monate)"
        : `netto mit deiner Quote von ${formatPercent(ratio.times(HUNDRED), 0)}`}
      {forecast.withoutAmount > 0 &&
        ` · ${formatCountNoun(forecast.withoutAmount, "Position", "Positionen")} ohne Jahresdividende`}
    </>
  );
}

const TOOLTIP_PAYERS = 3;

function toBarData(forecast: TwelveMonthForecast): ForecastBarDatum[] {
  return forecast.months.map((month) => ({
    key: `${String(month.year)}-${String(month.month)}`,
    label: monthNameDeShort(month.month),
    detail: `${monthNameDe(month.month)} ${String(month.year)}`,
    announced: month.announced.toChartNumber(),
    estimated: month.estimated.toChartNumber(),
    announcedMoney: month.announced,
    estimatedMoney: month.estimated,
    totalMoney: month.total,
    top: month.contributions.slice(0, TOOLTIP_PAYERS).map((item) => ({
      name: item.name,
      money: item.amount,
      announced: item.announced,
    })),
  }));
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
  const save = useSaveForecastSettings();
  const update = React.useCallback(
    (patch: Partial<SnowballSettings>) => {
      save.mutate({ ...settings, ...patch });
    },
    [save, settings],
  );

  const result = React.useMemo(
    () => projectSnowball({ depot, settings, netRatio, startYear }),
    [depot, settings, netRatio, startYear],
  );
  const chartData = React.useMemo(
    () => toSnowballData(result, settings.birthYear),
    [result, settings.birthYear],
  );
  const real = settings.inflationPercent > 0;

  return (
    <Section title="Schneeball" description="Ab wann tragen dich deine Dividenden?">
      <div className="space-y-6">
        <SnowballHeadline result={result} settings={settings} />

        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <NumberField
            id="snowball-savings"
            label="Sparrate pro Monat"
            suffix="€"
            value={settings.monthlySavings}
            onCommit={(value) => {
              update({ monthlySavings: value ?? 0 });
            }}
          />
          <NumberField
            id="snowball-target"
            label="Ziel pro Monat"
            suffix="€"
            value={settings.targetMonthly}
            onCommit={(value) => {
              update({ targetMonthly: value ?? 0 });
            }}
          />
        </div>

        <Disclosure
          summary={<AssumptionSummary result={result} settings={settings} />}
          contentClassName="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <NumberField
              id="snowball-growth"
              label="Dividendenwachstum p. a."
              suffix="%"
              value={settings.growthPercent}
              placeholder={formatDecimal(depot.growthPercent)}
              hint="leer = aus deinem Depot"
              onCommit={(value) => {
                update({ growthPercent: value });
              }}
            />
            <NumberField
              id="snowball-yield"
              label="Rendite neuer Käufe"
              suffix="%"
              value={settings.yieldPercent}
              placeholder={formatDecimal(depot.yieldPercent)}
              hint="leer = aus deinem Depot"
              onCommit={(value) => {
                update({ yieldPercent: value });
              }}
            />
            <NumberField
              id="snowball-inflation"
              label="Inflation p. a."
              suffix="%"
              value={settings.inflationPercent}
              hint="0 = Nennwerte"
              onCommit={(value) => {
                update({ inflationPercent: value ?? 0 });
              }}
            />
            <NumberField
              id="snowball-birth-year"
              label="Geburtsjahr"
              value={settings.birthYear}
              integer
              hint="für dein Alter, optional"
              onCommit={(value) => {
                update({ birthYear: value });
              }}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox
              checked={settings.reinvest}
              onCheckedChange={(checked) => {
                update({ reinvest: checked === true });
              }}
            />
            Dividenden reinvestieren
          </label>
        </Disclosure>

        <SnowballChart
          data={chartData}
          target={settings.targetMonthly > 0 ? settings.targetMonthly : null}
          ariaLabel={`Hochgerechnete Nettodividende pro Monat bis ${String(startYear + chartData.length - 1)}${real ? " in heutiger Kaufkraft" : ""}`}
        />

        <Milestones
          result={result}
          birthYear={settings.birthYear}
          startYear={startYear}
        />

        <p className="text-[0.8125rem] text-muted-foreground">
          Hochrechnung aus deinen Annahmen, keine Garantie. Kursgewinne fließen nicht ein,
          nur Dividenden und Sparrate.
          {real && " Beträge in heutiger Kaufkraft."} Die Spanne rechnet mit 2
          Prozentpunkten weniger und mehr Dividendenwachstum.
        </p>
      </div>
    </Section>
  );
}

function ageSuffix(year: number | null, birthYear: number | null): string {
  if (year === null || birthYear === null) return "";
  return ` · mit ${String(year - birthYear)}`;
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
            : `in ${formatCountNoun(targetYear - first.year, "Jahr", "Jahren")}${ageSuffix(targetYear, settings.birthYear)}`
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
          caption: `Wachstum +${String(SCENARIO_SPREAD)}`,
        },
        {
          label: "Vorsichtig",
          value: yearText(targetYearLatest),
          caption: `Wachstum −${String(SCENARIO_SPREAD)}`,
        },
      ]}
    />
  );
}

function AssumptionSummary({
  result,
  settings,
}: {
  result: SnowballResult;
  settings: SnowballSettings;
}) {
  const parts = [
    `${formatPercent(result.growthPercent, 1)} Wachstum`,
    `${formatPercent(result.yieldPercent, 1)} Rendite`,
    settings.reinvest ? "reinvestiert" : "nicht reinvestiert",
    settings.inflationPercent > 0
      ? `${formatPercent(new MoneyDecimal(settings.inflationPercent), 1)} Inflation`
      : "ohne Inflation",
  ];
  return <span>Annahmen: {parts.join(" · ")}</span>;
}

function Milestones({
  result,
  birthYear,
  startYear,
}: {
  result: SnowballResult;
  birthYear: number | null;
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
                : `${String(milestone.year)}${ageSuffix(milestone.year, birthYear)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function toSnowballData(
  result: SnowballResult,
  birthYear: number | null,
): SnowballDatum[] {
  return result.points.map((point) => ({
    year: point.year,
    label: String(point.year),
    age: birthYear === null ? null : point.year - birthYear,
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
 * Zahlenfeld, das erst beim Verlassen (oder Enter) speichert: Jeder
 * Tastendruck wuerde sonst eine Profilzeile schreiben und den Schneeball neu
 * rechnen, waehrend noch getippt wird.
 */
function NumberField({
  id,
  label,
  value,
  onCommit,
  suffix,
  placeholder,
  hint,
  integer = false,
}: {
  id: string;
  label: string;
  value: number | null;
  onCommit: (value: number | null) => void;
  suffix?: string;
  placeholder?: string;
  hint?: string;
  integer?: boolean;
}) {
  const shown = value === null ? "" : integer ? String(value) : formatDecimal(value);
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
    if (
      parsed === undefined ||
      (integer && parsed !== null && !Number.isInteger(parsed))
    ) {
      setDraft(shown);
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-[0.8125rem] text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode={integer ? "numeric" : "decimal"}
          autoComplete="off"
          value={draft}
          placeholder={placeholder}
          aria-describedby={hintId}
          className={suffix ? "pr-8 tabular-nums" : "tabular-nums"}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        {suffix && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
          >
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
