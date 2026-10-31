import * as React from "react";
import { useSearchParams } from "react-router";
import { KpiHero, TrendPill } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { formatMoneyWhole, formatPercent, type Money } from "@/lib/money";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import { ForecastGate, type ForecastBasis } from "@/features/securities/ForecastGate";
import { monthsEarlier } from "@/features/securities/snowball";
import {
  DEFAULT_FORECAST_SETTINGS,
  EXCLUDED_MAX,
  parseGermanNumber,
  useForecastSettings,
  useSaveForecastSettings,
} from "@/features/securities/forecastSettings";
import { NumberField, SettingCell, SettingsList } from "./fields";
import { FOCUS_LABEL, formatDecimal, monthlyAverage, weakestMonth } from "./format";
import { BuyList, ExcludedList, SpreadLine } from "./PurchaseParts";
import { PURCHASE_RULES, concentrationAfter, type PlanFocus } from "./purchase";
import { POSITION_CAP_DEFAULT, usePositionCaps } from "./positionCaps";
import { useSavingsPlans } from "./savingsPlanHooks";
import { activeMonthlyTotal } from "./savingsPlans";
import { planSwap, swapPositions, type SwapPlan } from "./swap";
import { TargetGain } from "./TargetGain";
import { MIN_GAIN_MONTHS, withPlanSavings } from "./targetTime";

const NO_CAPS: ReadonlyMap<string, number> = new Map();

/**
 * Planer › **Tausch** (seit 2.61.0): Was ändert sich, wenn du ein Asset
 * verkaufst und den Erlös wieder anlegst? Seit 2.62.0 verteilt der Nachkauf
 * den Erlös auf mehrere Titel — mit Zielgewichtungen, Ausschlüssen und
 * Schwerpunkt wie dort (CALCULATION_RULES.md §16.1). Vorbelegt ist „Monate
 * glätten": Ein Verkauf reißt Lücken in die Monate, in denen das Asset
 * zahlte. Die Eingaben stehen in der Adresse
 * (`?verkauf=…&betrag=2000&anzahl=3&fokus=dividende&ziel=ignorieren`); ohne
 * Betrag gilt die ganze Position. Seit 2.64.0 lassen sich die
 * Zielgewichtungen für den Tausch ignorieren (`ziel=ignorieren`): Dann kommt
 * jedes Asset des Bestands in Frage, gestreut wird weiter (Erlös ÷ Käufe).
 */
export function SwapTab() {
  return (
    <ForecastGate emptyDescription="Der Tausch rechnet durch, was sich ändert, wenn du ein Asset verkaufst und den Erlös auf andere verteilst. Dafür braucht er einen Depotstand aus dem DivvyDiary-Portfolio-Export.">
      {(basis) => <Swap basis={basis} />}
    </ForecastGate>
  );
}

function readFocus(raw: string | null): PlanFocus {
  return raw === "dividende" || raw === "wachstum" ? raw : "monate";
}

function Swap({ basis }: { basis: ForecastBasis }) {
  const { forecast, snapshots, names, facets, depot } = basis;
  const [params, setParams] = useSearchParams();
  const settings = useForecastSettings().data ?? DEFAULT_FORECAST_SETTINGS;
  const { mutate: save } = useSaveForecastSettings();
  const { data: savingsPlans = [] } = useSavingsPlans();
  const caps = usePositionCaps().data ?? NO_CAPS;

  const positions = React.useMemo(
    () => swapPositions(forecast, snapshots, names),
    [forecast, snapshots, names],
  );
  const sell =
    positions.find((entry) => entry.securityId === params.get("verkauf")) ?? null;
  // Ohne Betrag die ganze Position, auf volle Euro abgerundet.
  const fullAmount = sell ? Math.floor(sell.marketValue.toNumber()) : 0;
  const rawAmount = parseGermanNumber(params.get("betrag") ?? "");
  const amount =
    typeof rawAmount === "number" && rawAmount > 0 && rawAmount <= fullAmount
      ? rawAmount
      : null;
  const rawBuys = Number.parseInt(params.get("anzahl") ?? "", 10);
  const buys =
    rawBuys >= 1 && rawBuys <= PURCHASE_RULES.maxBuys
      ? rawBuys
      : PURCHASE_RULES.defaultBuys;
  const focus = readFocus(params.get("fokus"));
  const ignoreCaps = params.get("ziel") === "ignorieren";

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
  const planFor = React.useCallback(
    (planFocus: PlanFocus) =>
      sell
        ? planSwap({
            forecast,
            snapshots,
            sell,
            amount: amount ?? fullAmount,
            focus: planFocus,
            buys,
            caps: ignoreCaps ? NO_CAPS : caps,
            excluded: excludedSet,
            capPercent: ignoreCaps ? null : POSITION_CAP_DEFAULT,
          })
        : null,
    [forecast, snapshots, sell, amount, fullAmount, buys, caps, ignoreCaps, excludedSet],
  );
  const plan = React.useMemo(() => planFor(focus), [planFor, focus]);
  const hasBuys = plan !== null && plan.purchase.buys.length > 0;

  // Dividende geht zurück: Hielte ein anderer Schwerpunkt sie? Dann ein
  // Wechsel mit einem Tipp statt einer stillen Einbuße.
  const better = React.useMemo(() => {
    if (!plan?.change.isNegative()) return null;
    const keys = (Object.keys(FOCUS_LABEL) as PlanFocus[]).filter((key) => key !== focus);
    let best: { focus: PlanFocus; change: Money } | null = null;
    for (const key of keys) {
      const other = planFor(key);
      if (other && (best === null || other.change.compareTo(best.change) > 0))
        best = { focus: key, change: other.change };
    }
    return best && best.change.compareTo(plan.change) > 0 ? best : null;
  }, [plan, planFor, focus]);

  const spread = React.useMemo(
    () =>
      plan && hasBuys
        ? concentrationAfter({
            snapshots,
            facets,
            names,
            plan: plan.purchase,
            sold: sell ? { securityId: sell.securityId, amount: plan.amount } : undefined,
          })
        : null,
    [plan, hasBuys, snapshots, facets, names, sell],
  );

  // Ziel-Zeit (§14.4): Die Veränderung kommt ab heute zu dem hinzu, womit der
  // Schneeball ohnehin rechnet — oder fehlt ihm.
  const savingsTotal = Math.round(activeMonthlyTotal(savingsPlans).toNumber());
  const snowball = React.useMemo(
    () => withPlanSavings(settings, savingsTotal),
    [settings, savingsTotal],
  );
  const gain = React.useMemo(
    () =>
      plan && !plan.change.isZero()
        ? monthsEarlier({
            depot,
            settings: snowball,
            netRatio: forecast.netRatio,
            extraAnnualNet: plan.change.toDecimal(),
          })
        : null,
    [plan, depot, snowball, forecast.netRatio],
  );

  return (
    <div className="space-y-10 lg:space-y-12">
      <div className="space-y-6">
        {plan && hasBuys && (
          <SwapSummary
            plan={plan}
            sellName={sell?.name ?? ""}
            total={forecast.total}
            gain={
              gain !== null && Math.abs(gain) >= MIN_GAIN_MONTHS ? (
                <TargetGain months={gain} target={snowball.targetMonthly} />
              ) : undefined
            }
          />
        )}

        <SettingsList label="Tausch" className="grid-cols-2 md:grid-cols-5">
          <SettingCell
            label="Verkaufen"
            htmlFor="swap-sell"
            className="col-span-2 md:col-span-1"
          >
            <Select
              id="swap-sell"
              className="h-9 py-0"
              value={sell?.securityId ?? ""}
              onChange={(event) => {
                setParam({
                  verkauf: event.target.value === "" ? null : event.target.value,
                  betrag: null,
                });
              }}
            >
              <option value="">Asset wählen</option>
              {positions.map((position) => (
                <option key={position.securityId} value={position.securityId}>
                  {position.name}
                </option>
              ))}
            </Select>
          </SettingCell>
          <NumberField
            id="swap-amount"
            label="Betrag"
            fullLabel="Verkaufter Betrag, leer für die ganze Position"
            suffix="€"
            max={fullAmount}
            value={amount}
            placeholder={sell ? formatDecimal(fullAmount) : undefined}
            onCommit={(value) => {
              setParam({
                betrag: value === null || value === fullAmount ? null : String(value),
              });
            }}
          />
          <SettingCell label="Käufe" htmlFor="swap-buys">
            <Select
              id="swap-buys"
              aria-label="Höchstens so viele Käufe"
              className="h-9 py-0"
              value={String(buys)}
              onChange={(event) => {
                setParam({ anzahl: event.target.value });
              }}
            >
              {Array.from(
                { length: PURCHASE_RULES.maxBuys },
                (_, index) => index + 1,
              ).map((count) => (
                <option key={count} value={count}>
                  {String(count)}
                </option>
              ))}
            </Select>
          </SettingCell>
          <SettingCell
            label="Schwerpunkt"
            htmlFor="swap-focus"
            className="col-span-2 md:col-span-1"
          >
            <Select
              id="swap-focus"
              className="h-9 py-0"
              value={focus}
              onChange={(event) => {
                const next = event.target.value as PlanFocus;
                setParam({ fokus: next === "monate" ? null : next });
              }}
            >
              {(Object.keys(FOCUS_LABEL) as PlanFocus[]).map((key) => (
                <option key={key} value={key}>
                  {FOCUS_LABEL[key]}
                </option>
              ))}
            </Select>
          </SettingCell>
          <SettingCell
            label="Zielgewichtung"
            htmlFor="swap-caps"
            className="col-span-2 md:col-span-1"
          >
            <Select
              id="swap-caps"
              className="h-9 py-0"
              value={ignoreCaps ? "ignorieren" : "beachten"}
              onChange={(event) => {
                setParam({
                  ziel: event.target.value === "ignorieren" ? "ignorieren" : null,
                });
              }}
            >
              <option value="beachten">beachten</option>
              <option value="ignorieren">ignorieren</option>
            </Select>
          </SettingCell>
        </SettingsList>

        {plan && hasBuys ? (
          <>
            <SpreadLine
              spread={spread}
              cap={caps.get(spread?.position.key ?? "") ?? null}
              plan={plan.purchase}
            />
            {better && (
              <p className="flex flex-wrap items-center gap-x-2 px-1 text-sm text-muted-foreground">
                <span>
                  Mit „{FOCUS_LABEL[better.focus]}“ wären es{" "}
                  <SignedAmount amount={better.change} /> im Jahr.
                </span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => {
                    setParam({ fokus: better.focus === "monate" ? null : better.focus });
                  }}
                >
                  Übernehmen
                </Button>
              </p>
            )}
          </>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            {sell === null
              ? "Wähle, was du verkaufen würdest. Der Tausch verteilt den Erlös auf deinen Bestand und zeigt, was sich an deiner Dividende ändert."
              : plan === null
                ? `Mindestens ${String(PURCHASE_RULES.minimum)} €.`
                : !ignoreCaps && ![...caps.values()].some((cap) => cap > 0)
                  ? "Gib Assets beim Bearbeiten eine Zielgewichtung, dann verteilt der Tausch den Erlös auf sie."
                  : "Kein anderes Asset hat unter seiner Zielgewichtung noch Platz. Stell „Zielgewichtung“ auf „ignorieren“, um trotzdem zu tauschen."}
          </p>
        )}
      </div>

      {plan && hasBuys && (
        <>
          <Section title="Käufe">
            <BuyList
              plan={plan.purchase}
              canExclude={settings.excluded.length < EXCLUDED_MAX}
              onExclude={(id) => {
                setExcluded([...settings.excluded, id]);
              }}
            />
          </Section>

          <Section title="Nächste 12 Monate">
            <CategoryBarChart
              data={toBarData(basis, plan, sell?.name ?? "")}
              ariaLabel="Erwartete Nettodividende je Monat nach dem Tausch"
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

/** „+12,40 €" oder „−8,10 €"; rot nur, was weniger wird (AmountText). */
function SignedAmount({ amount }: { amount: Money }) {
  return (
    <>
      {amount.isPositive() && "+"}
      <AmountText amount={amount} />
    </>
  );
}

function SwapSummary({
  plan,
  sellName,
  total,
  gain,
}: {
  plan: SwapPlan;
  sellName: string;
  /** Erwartet in zwölf Monaten vor dem Tausch. */
  total: Money;
  gain: React.ReactNode;
}) {
  const change = total.isZero()
    ? null
    : plan.change.toDecimal().dividedBy(total.toDecimal()).times(100);
  const count = plan.purchase.buys.length;
  return (
    <KpiHero
      label="Der Tausch ändert im Jahr"
      value={<SignedAmount amount={plan.change} />}
      trend={
        change && !change.isZero() ? (
          <TrendPill
            tone={change.isNegative() ? "negative" : "positive"}
            title="Gegenüber der erwarteten Dividende der nächsten zwölf Monate"
          >
            {formatPercent(change.abs(), 1)}
          </TrendPill>
        ) : undefined
      }
      caption={`${
        plan.lost.isZero()
          ? `${sellName} schüttet nicht aus`
          : `−${formatMoneyWhole(plan.lost)} ohne ${sellName} (${formatPercent(plan.sellYieldPercent, 1)})`
      } · +${formatMoneyWhole(plan.purchase.annual)} durch ${count === 1 ? "1 Kauf" : `${String(count)} Käufe`} (${formatPercent(plan.purchase.yieldPercent, 1)})`}
      footer={gain}
      stats={[
        {
          label: "Ø im Monat",
          value: formatMoneyWhole(monthlyAverage(plan.after)),
          caption: `vorher ${formatMoneyWhole(monthlyAverage(plan.before))}`,
        },
        {
          label: "Schwächster Monat",
          value: formatMoneyWhole(weakestMonth(plan.after)),
          caption: `vorher ${formatMoneyWhole(weakestMonth(plan.before))}`,
        },
      ]}
    />
  );
}

function toBarData(
  { forecast }: ForecastBasis,
  plan: SwapPlan,
  sellName: string,
): CategoryDatum[] {
  return forecast.months.map((month, index) => {
    const lost = plan.before[index].subtract(plan.withoutSale[index]);
    const gained = plan.after[index].subtract(plan.withoutSale[index]);
    return {
      key: `${String(month.year)}-${String(month.month)}`,
      label: monthNameDeShort(month.month),
      detail: `${monthNameDe(month.month)} ${String(month.year)}`,
      value: plan.after[index].toChartNumber(),
      money: plan.after[index],
      count: 0,
      breakdown: [
        { name: "Bisher", money: plan.before[index] },
        ...(lost.isZero() ? [] : [{ name: `Ohne ${sellName}`, money: lost.negate() }]),
        ...(gained.isZero() ? [] : [{ name: "Durch die Käufe", money: gained }]),
      ],
    };
  });
}
