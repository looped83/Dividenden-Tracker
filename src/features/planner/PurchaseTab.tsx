import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronDown, EyeOff, RotateCcw } from "lucide-react";
import { KpiHero } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Button } from "@/components/ui/button";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { Section } from "@/components/ui/section";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  EUR,
  Money,
  formatMoney,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { useBackState } from "@/lib/hooks/useBackState";
import { cn } from "@/lib/utils/cn";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import { ForecastGate, type ForecastBasis } from "@/features/securities/ForecastGate";
import {
  AMOUNT_MAX,
  DEFAULT_FORECAST_SETTINGS,
  EXCLUDED_MAX,
  parseGermanNumber,
  useForecastSettings,
  useSaveForecastSettings,
  type ForecastSettings,
} from "@/features/securities/forecastSettings";
import { PlannerHeaderActions } from "./PlannerPage";
import { NumberField, SettingCell, SettingsList } from "./fields";
import { rhythm } from "./format";
import {
  MODE_RULES,
  concentrationAfter,
  planPurchase,
  purchaseCandidates,
  type PlanFocus,
  type PlanMode,
  type PlannedBuy,
  type PurchasePlan,
} from "./purchase";
import { POSITION_CAP_DEFAULT, usePositionCaps } from "./positionCaps";
import { useSavingsPlans } from "./savingsPlanHooks";
import { activeMonthlyTotal, savingsPlanOverview } from "./savingsPlans";

const MODE_OPTIONS: readonly SegmentOption<PlanMode>[] = [
  { value: "einmal", label: "Einmalkauf" },
  { value: "sparplan", label: "Sparpläne" },
];

const FOCUS_LABEL: Record<PlanFocus, string> = {
  dividende: "Mehr Dividende",
  monate: "Monate glätten",
  wachstum: "Dividendenwachstum",
};

const NO_CAPS: ReadonlyMap<string, number> = new Map();

const sharesFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/**
 * Planer › **Nachkauf**: Was bringt der nächste Kauf? Ein Betrag wird auf
 * Positionen des eigenen Bestands verteilt — als Einmalkauf (wenige Titel,
 * mindestens 100 € je Kauf) oder als monatliche Sparpläne (mehr Titel, ab
 * 25 €). Die Eingaben stehen in der Adresse (`?modus=sparplan&betrag=1000`),
 * damit Zurück und Direktlinks sie behalten; gespeichert werden nur die
 * ausgeschlossenen Assets (CALCULATION_RULES.md §16).
 */
export function PurchaseTab() {
  const settings = useForecastSettings().data ?? DEFAULT_FORECAST_SETTINGS;
  return (
    <ForecastGate emptyDescription="Der Nachkauf verteilt einen Betrag auf deinen Bestand und zeigt, was er an Dividende bringt. Dafür braucht er einen Depotstand aus dem DivvyDiary-Portfolio-Export.">
      {(basis) => <Purchase basis={basis} settings={settings} />}
    </ForecastGate>
  );
}

/**
 * Eingaben aus der Adresse. Ohne Betrag gilt die Vorbelegung des Modus; beim
 * Sparplan die Summe der eigenen Pläne, sobald welche gepflegt sind (§17).
 */
function readInputs(params: URLSearchParams, savingsTotal: number) {
  const mode: PlanMode = params.get("modus") === "sparplan" ? "sparplan" : "einmal";
  const rules = MODE_RULES[mode];
  const rawFocus = params.get("fokus");
  const focus: PlanFocus =
    rawFocus === "monate" || rawFocus === "wachstum" ? rawFocus : "dividende";
  const rawAmount = parseGermanNumber(params.get("betrag") ?? "");
  const amount =
    typeof rawAmount === "number" && rawAmount > 0 && rawAmount <= AMOUNT_MAX
      ? rawAmount
      : mode === "sparplan" && savingsTotal > 0
        ? savingsTotal
        : rules.defaultAmount;
  const rawBuys = Number.parseInt(params.get("anzahl") ?? "", 10);
  const buys = rawBuys >= 1 && rawBuys <= rules.maxBuys ? rawBuys : rules.defaultBuys;
  return { mode, focus, amount, buys };
}

function Purchase({
  basis,
  settings,
}: {
  basis: ForecastBasis;
  settings: ForecastSettings;
}) {
  const { forecast, snapshots, names, facets } = basis;
  const [params, setParams] = useSearchParams();
  const { data: savingsPlans = [] } = useSavingsPlans();
  const caps = usePositionCaps().data ?? NO_CAPS;
  const savingsTotal = Math.round(activeMonthlyTotal(savingsPlans).toNumber());
  const { mode, focus, amount, buys } = readInputs(params, savingsTotal);
  const rules = MODE_RULES[mode];
  const { mutate: save } = useSaveForecastSettings();

  const setParam = React.useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setExcluded = React.useCallback(
    (excluded: readonly string[]) => {
      save({ ...settings, excluded });
    },
    [save, settings],
  );

  const excludedSet = React.useMemo(
    () => new Set(settings.excluded),
    [settings.excluded],
  );
  const candidates = React.useMemo(
    () => purchaseCandidates(forecast, snapshots, excludedSet),
    [forecast, snapshots, excludedSet],
  );
  const plan = React.useMemo(
    () =>
      planPurchase({
        forecast,
        candidates,
        amount,
        focus,
        mode,
        buys,
        capPercent: POSITION_CAP_DEFAULT,
        caps,
      }),
    [forecast, candidates, amount, focus, mode, buys, caps],
  );
  const spread = React.useMemo(
    () =>
      plan && plan.buys.length > 0
        ? concentrationAfter({ snapshots, facets, names, plan, mode })
        : null,
    [snapshots, facets, names, plan, mode],
  );

  const isSavings = mode === "sparplan";
  // Zum Vergleich: was die gepflegten Sparpläne heute bringen.
  const current = React.useMemo(
    () =>
      isSavings && savingsPlans.length > 0
        ? savingsPlanOverview(
            forecast,
            purchaseCandidates(forecast, snapshots, new Set()),
            savingsPlans,
            names,
          )
        : null,
    [isSavings, forecast, snapshots, savingsPlans, names],
  );

  return (
    <div className="space-y-10 lg:space-y-12">
      <PlannerHeaderActions>
        <SegmentedControl<PlanMode>
          label="Art des Kaufs"
          variant="pill"
          options={MODE_OPTIONS}
          value={mode}
          onChange={(next) => {
            // Betrag und Anzahl gehören zum Modus: ein Sparplan ist keine 1.000-€-Order.
            setParam({
              modus: next === "sparplan" ? next : null,
              betrag: null,
              anzahl: null,
            });
          }}
        />
      </PlannerHeaderActions>

      <div className="space-y-6">
        <SettingsList label="Eingaben" className="grid-cols-2 md:grid-cols-3">
          <NumberField
            id="purchase-amount"
            max={AMOUNT_MAX}
            label={isSavings ? "Pro Monat" : "Betrag"}
            fullLabel={isSavings ? "Sparrate pro Monat" : "Betrag des Einmalkaufs"}
            suffix="€"
            value={amount}
            onCommit={(value) => {
              setParam({ betrag: value === null ? null : String(value) });
            }}
          />
          {/* Mobil volle Breite und zuletzt: „Dividendenwachstum" passt nicht in ein Drittel. */}
          <SettingCell
            label="Schwerpunkt"
            htmlFor="purchase-focus"
            className="order-last col-span-2 md:order-none md:col-span-1"
          >
            <Select
              id="purchase-focus"
              className="h-9 py-0"
              value={focus}
              onChange={(event) => {
                const next = event.target.value as PlanFocus;
                setParam({ fokus: next === "dividende" ? null : next });
              }}
            >
              {(Object.keys(FOCUS_LABEL) as PlanFocus[]).map((key) => (
                <option key={key} value={key}>
                  {FOCUS_LABEL[key]}
                </option>
              ))}
            </Select>
          </SettingCell>
          <SettingCell label={isSavings ? "Pläne" : "Käufe"} htmlFor="purchase-buys">
            <Select
              id="purchase-buys"
              aria-label={
                isSavings ? "Höchstens so viele Sparpläne" : "Höchstens so viele Käufe"
              }
              className="h-9 py-0"
              value={String(buys)}
              onChange={(event) => {
                setParam({ anzahl: event.target.value });
              }}
            >
              {Array.from({ length: rules.maxBuys }, (_, index) => index + 1).map(
                (count) => (
                  <option key={count} value={count}>
                    {isSavings ? `bis ${String(count)}` : String(count)}
                  </option>
                ),
              )}
            </Select>
          </SettingCell>
        </SettingsList>

        {plan === null || plan.buys.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            {candidates.length === 0
              ? "Im Bestand ist kein Asset mit Kurs und Dividende, das sich nachkaufen ließe."
              : plan === null
                ? `Mindestens ${String(rules.minimum)} € je ${isSavings ? "Sparplan" : "Kauf"}.`
                : "Kein Asset hat unter seiner Gewichtung noch Platz."}
          </p>
        ) : (
          <>
            <PlanSummary plan={plan} mode={mode} current={current?.annual ?? null} />
            <SpreadLine
              spread={spread}
              cap={caps.get(spread?.position.key ?? "") ?? POSITION_CAP_DEFAULT}
              plan={plan}
            />
          </>
        )}
      </div>

      {plan !== null && plan.buys.length > 0 && (
        <>
          <Section title={isSavings ? "Sparpläne" : "Käufe"}>
            <ListGroup>
              {plan.buys.map((buy) => (
                <li key={buy.securityId}>
                  <BuyRow
                    buy={buy}
                    mode={mode}
                    canExclude={settings.excluded.length < EXCLUDED_MAX}
                    onExclude={() => {
                      setExcluded([...settings.excluded, buy.securityId]);
                    }}
                  />
                </li>
              ))}
            </ListGroup>
          </Section>

          <Section title="Nächste 12 Monate">
            <CategoryBarChart
              data={toBarData(basis, plan)}
              ariaLabel="Erwartete Nettodividende je Monat mit dem Plan"
              categoryHeader="Monat"
              color="primary"
              showCount={false}
            />
          </Section>
        </>
      )}

      <ExcludedList
        excluded={settings.excluded}
        names={names}
        onRestore={(id) => {
          setExcluded(settings.excluded.filter((entry) => entry !== id));
        }}
      />
    </div>
  );
}

/**
 * Streuung nach dem Kauf in einer Zeile (seit 2.22.0): größte Position,
 * Branche und Land. Eine Position über der Grenze ist hervorgehoben — das
 * kann nur eine sein, die schon vorher darüber lag.
 */
function SpreadLine({
  spread,
  cap,
  plan,
}: {
  spread: ReturnType<typeof concentrationAfter>;
  /** Grenze der größten Position (eigene oder Standard). */
  cap: number;
  plan: PurchasePlan;
}) {
  if (spread === null) return null;
  const over = spread.position.percent.greaterThan(cap);
  const part = (label: string, entry: { name: string; percent: DecimalInstance }) =>
    `${label} ${entry.name} ${formatPercent(entry.percent, 1)}`;
  return (
    <div className="space-y-1 px-1 text-sm text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Nach dem Kauf:</span>{" "}
        <span className={cn(over && "font-medium text-negative")}>
          {part("größte Position", spread.position)}
        </span>
        {spread.sector && <> · {part("Branche", spread.sector)}</>}
        {spread.country && <> · {part("Land", spread.country)}</>}
      </p>
      {plan.unplaced.isPositive() && (
        <p>
          {formatMoneyWhole(plan.unplaced)} finden unter den Gewichtungen keinen Platz.
          Mehr Käufe oder höhere Gewichtungen verteilen sie.
        </p>
      )}
    </div>
  );
}

function PlanSummary({
  plan,
  mode,
  current,
}: {
  plan: PurchasePlan;
  mode: PlanMode;
  /** Mehr im Jahr durch die gepflegten Sparpläne; `null` ohne Pläne. */
  current: Money | null;
}) {
  const average = (values: PurchasePlan["before"]) =>
    Money.fromDecimal(
      values
        .reduce((sum, value) => sum.add(value))
        .toDecimal()
        .dividedBy(12),
      EUR,
    );
  const weakest = (values: PurchasePlan["before"]) =>
    values.reduce((low, value) => (value.compareTo(low) < 0 ? value : low));
  return (
    <KpiHero
      label={
        mode === "sparplan"
          ? "Mehr im Jahr nach 12 Monaten · netto"
          : "Mehr im Jahr · netto"
      }
      value={
        <>
          +<AmountText amount={plan.annual} />
        </>
      }
      caption={`${formatPercent(plan.yieldPercent, 1)} auf ${formatMoneyWhole(plan.invested)}`}
      stats={[
        {
          label: "Ø im Monat",
          value: formatMoneyWhole(average(plan.after)),
          caption: `vorher ${formatMoneyWhole(average(plan.before))}`,
        },
        {
          label: "Schwächster Monat",
          value: formatMoneyWhole(weakest(plan.after)),
          caption: `vorher ${formatMoneyWhole(weakest(plan.before))}`,
        },
        ...(current
          ? [
              {
                label: "Deine Sparpläne",
                value: `+${formatMoneyWhole(current)}`,
                caption: "nach 12 Monaten",
              },
            ]
          : []),
      ]}
    />
  );
}

function BuyRow({
  buy,
  mode,
  canExclude,
  onExclude,
}: {
  buy: PlannedBuy;
  mode: PlanMode;
  canExclude: boolean;
  onExclude: () => void;
}) {
  const backState = useBackState();
  // Ein Monatszahler braucht keine Monatsliste: „monatlich" sagt alles.
  const months =
    buy.months.length === 12 ? null : buy.months.map(monthNameDeShort).join(", ");
  return (
    <ListRow className="gap-1 py-0 pr-0">
      <Link
        to={`/depot/${buy.securityId}`}
        state={backState}
        className="-ml-3 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
      >
        <ListItemBody
          title={buy.name}
          meta={
            <>
              <span>{rhythm(buy.months.length)}</span>
              {months && <span>{months}</span>}
              {buy.shares?.greaterThanOrEqualTo("0.1") && (
                <span className="tabular-amount">
                  ≈ {sharesFormat.format(buy.shares.toNumber())} Stück
                </span>
              )}
            </>
          }
          trailing={
            <span className="flex flex-col items-end">
              <span className="font-medium text-foreground">
                {formatMoneyWhole(buy.invest)}
                {mode === "sparplan" && (
                  <span className="text-muted-foreground">/Monat</span>
                )}
              </span>
              <span>+{formatMoney(buy.annual)} im Jahr</span>
            </span>
          }
        />
      </Link>
      {canExclude && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={`${buy.name} nicht mehr vorschlagen`}
          title="Nicht mehr vorschlagen"
          onClick={onExclude}
        >
          <EyeOff aria-hidden className="size-4" />
        </Button>
      )}
    </ListRow>
  );
}

/** Ausgeschlossene Assets, eingeklappt; jedes lässt sich zurücknehmen. */
function ExcludedList({
  excluded,
  names,
  onRestore,
}: {
  excluded: readonly string[];
  names: ReadonlyMap<string, string>;
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (excluded.length === 0) return null;
  const listId = "planer-ausgeschlossen";
  return (
    <section aria-label="Ausgeschlossene Assets">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
      >
        {formatCountNoun(
          excluded.length,
          "Asset ausgeschlossen",
          "Assets ausgeschlossen",
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ListGroup id={listId}>
          {excluded.map((id) => {
            const name = names.get(id) ?? "Unbekanntes Asset";
            return (
              <li key={id}>
                <ListRow className="py-0 pr-0">
                  <span className="min-w-0 flex-1 truncate-fade text-sm">{name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    aria-label={`${name} wieder vorschlagen`}
                    onClick={() => {
                      onRestore(id);
                    }}
                  >
                    <RotateCcw aria-hidden className="size-4" />
                    Wieder vorschlagen
                  </Button>
                </ListRow>
              </li>
            );
          })}
        </ListGroup>
      )}
    </section>
  );
}

function toBarData({ forecast }: ForecastBasis, plan: PurchasePlan): CategoryDatum[] {
  return forecast.months.map((month, index) => {
    const after = plan.after[index];
    const before = plan.before[index];
    return {
      key: `${String(month.year)}-${String(month.month)}`,
      label: monthNameDeShort(month.month),
      detail: `${monthNameDe(month.month)} ${String(month.year)}`,
      value: after.toChartNumber(),
      money: after,
      count: 0,
      breakdown: [
        { name: "Bisher", money: before },
        { name: "Durch den Plan", money: after.subtract(before) },
      ],
    };
  });
}
