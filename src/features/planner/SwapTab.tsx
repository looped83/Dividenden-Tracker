import * as React from "react";
import { useSearchParams } from "react-router";
import { KpiHero, TrendPill } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MoneyDecimal,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
  type Money,
} from "@/lib/money";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils/cn";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import { ForecastGate, type ForecastBasis } from "@/features/securities/ForecastGate";
import { monthsEarlier } from "@/features/securities/snowball";
import {
  DEFAULT_FORECAST_SETTINGS,
  parseGermanNumber,
  useForecastSettings,
} from "@/features/securities/forecastSettings";
import { AssetLink } from "./AssetLink";
import { NumberField, SettingCell, SettingsList } from "./fields";
import { formatDecimal, monthlyAverage, payoutText, weakestMonth } from "./format";
import { usePositionCaps } from "./positionCaps";
import { useSavingsPlans } from "./savingsPlanHooks";
import { activeMonthlyTotal } from "./savingsPlans";
import {
  planSwap,
  swapAlternatives,
  swapPositions,
  type SwapLeg,
  type SwapPlan,
  type SwapPosition,
} from "./swap";
import { TargetGain } from "./TargetGain";
import { MIN_GAIN_MONTHS, withPlanSavings } from "./targetTime";

const ALTERNATIVES = 5;
const NO_CAPS: ReadonlyMap<string, number> = new Map();
const sharesFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/**
 * Planer › **Tausch** (seit 2.61.0): Was ändert sich, wenn du einen Teil von
 * A verkaufst und in B steckst? Dividende im Jahr, Monate, Gewichtung und
 * Ziel-Zeit vorher und nachher (CALCULATION_RULES.md §16.1). Die Eingaben
 * stehen in der Adresse (`?verkauf=…&kauf=…&betrag=2000`) wie im Nachkauf;
 * ohne Betrag gilt die ganze Position.
 */
export function SwapTab() {
  return (
    <ForecastGate emptyDescription="Der Tausch rechnet durch, was sich ändert, wenn du ein Asset verkaufst und den Erlös in ein anderes steckst. Dafür braucht er einen Depotstand aus dem DivvyDiary-Portfolio-Export.">
      {(basis) => <Swap basis={basis} />}
    </ForecastGate>
  );
}

function Swap({ basis }: { basis: ForecastBasis }) {
  const { forecast, snapshots, names, depot } = basis;
  const [params, setParams] = useSearchParams();
  const settings = useForecastSettings().data ?? DEFAULT_FORECAST_SETTINGS;
  const { data: savingsPlans = [] } = useSavingsPlans();
  const caps = usePositionCaps().data ?? NO_CAPS;

  const positions = React.useMemo(
    () => swapPositions(forecast, snapshots, names),
    [forecast, snapshots, names],
  );
  const byId = React.useMemo(
    () => new Map(positions.map((position) => [position.securityId, position])),
    [positions],
  );
  const sell = byId.get(params.get("verkauf") ?? "") ?? null;
  const rawBuy = byId.get(params.get("kauf") ?? "") ?? null;
  const buy = rawBuy && rawBuy !== sell ? rawBuy : null;
  // Ohne Betrag die ganze Position, auf volle Euro abgerundet.
  const fullAmount = sell ? Math.floor(sell.marketValue.toNumber()) : 0;
  const rawAmount = parseGermanNumber(params.get("betrag") ?? "");
  const amount =
    typeof rawAmount === "number" && rawAmount > 0 && rawAmount <= fullAmount
      ? rawAmount
      : null;

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

  const plan = React.useMemo(
    () =>
      sell && buy
        ? planSwap({ forecast, sell, buy, amount: amount ?? fullAmount })
        : null,
    [forecast, sell, buy, amount, fullAmount],
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

  const alternatives = React.useMemo(
    () =>
      sell
        ? swapAlternatives(
            positions,
            [sell.securityId, ...(buy ? [buy.securityId] : [])],
            ALTERNATIVES,
          )
            .map((position) =>
              planSwap({ forecast, sell, buy: position, amount: amount ?? fullAmount }),
            )
            .filter((entry) => entry !== null)
        : [],
    [positions, sell, buy, forecast, amount, fullAmount],
  );

  return (
    <div className="space-y-10 lg:space-y-12">
      <div className="space-y-6">
        {plan && (
          <SwapSummary
            plan={plan}
            depotTotal={forecast.total}
            gain={
              gain !== null && Math.abs(gain) >= MIN_GAIN_MONTHS ? (
                <TargetGain months={gain} target={snowball.targetMonthly} />
              ) : undefined
            }
          />
        )}

        <SettingsList label="Tausch" className="grid-cols-1 md:grid-cols-3">
          <SettingCell label="Verkaufen" htmlFor="swap-sell">
            <Select
              id="swap-sell"
              className="h-9 py-0"
              value={sell?.securityId ?? ""}
              onChange={(event) => {
                const next = event.target.value;
                setParam({
                  verkauf: next === "" ? null : next,
                  betrag: null,
                  ...(next === buy?.securityId ? { kauf: null } : {}),
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
          <SettingCell label="Kaufen" htmlFor="swap-buy">
            <Select
              id="swap-buy"
              className="h-9 py-0"
              value={buy?.securityId ?? ""}
              onChange={(event) => {
                setParam({ kauf: event.target.value === "" ? null : event.target.value });
              }}
            >
              <option value="">Asset wählen</option>
              {positions
                .filter((position) => position !== sell)
                .map((position) => (
                  <option key={position.securityId} value={position.securityId}>
                    {position.name}
                  </option>
                ))}
            </Select>
          </SettingCell>
        </SettingsList>

        {plan ? (
          <AfterLine plan={plan} caps={caps} />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            {positions.length < 2
              ? "Für einen Tausch braucht der Depotstand mindestens zwei Positionen."
              : sell
                ? "Wähle, was du stattdessen kaufen würdest – oder nimm eins der Kaufziele unten."
                : "Wähle, was du verkaufen würdest. Der Tausch zeigt, was sich an deiner Dividende ändert."}
          </p>
        )}
      </div>

      {plan && (
        <>
          <Section title="Verkauf und Kauf">
            <LegList plan={plan} />
          </Section>

          <Section title="Nächste 12 Monate">
            <CategoryBarChart
              data={toBarData(basis, plan)}
              ariaLabel="Erwartete Nettodividende je Monat nach dem Tausch"
              categoryHeader="Monat"
              color="primary"
              showCount={false}
            />
          </Section>
        </>
      )}

      {alternatives.length > 0 && (
        <Section title={plan ? "Andere Kaufziele" : "Kaufziele"}>
          <AlternativeList
            alternatives={alternatives}
            caps={caps}
            onChoose={(id) => {
              setParam({ kauf: id });
              const reduce = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
              ).matches;
              window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
            }}
          />
        </Section>
      )}
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
  depotTotal,
  gain,
}: {
  plan: SwapPlan;
  /** Erwartet in zwölf Monaten vor dem Tausch. */
  depotTotal: Money;
  gain: React.ReactNode;
}) {
  const change = depotTotal.isZero()
    ? null
    : plan.change.toDecimal().dividedBy(depotTotal.toDecimal()).times(100);
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
      caption={`Rendite ${formatPercent(plan.sell.yieldPercent, 1)} → ${formatPercent(plan.buy.yieldPercent, 1)} auf ${formatMoneyWhole(plan.amount)}`}
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

/** Über der eigenen Zielgewichtung (0 % heißt „nicht aufstocken" und zählt nicht). */
function overTarget(
  caps: ReadonlyMap<string, number>,
  id: string,
  share: DecimalInstance,
): boolean {
  const cap = caps.get(id);
  return cap !== undefined && cap > 0 && share.greaterThan(cap);
}

/**
 * Gewichtung beider Seiten vorher und nachher, dazu die Zielgewichtung des
 * gekauften Assets; darüber rot (wie die Streuungszeile im Nachkauf). Darunter
 * der Blick fünf Jahre voraus mit dem Dividendenwachstum.
 */
function AfterLine({
  plan,
  caps,
}: {
  plan: SwapPlan;
  caps: ReadonlyMap<string, number>;
}) {
  const part = (leg: SwapLeg) => {
    const cap = caps.get(leg.position.securityId);
    const over = overTarget(caps, leg.position.securityId, leg.shareAfter);
    return (
      <span className={cn(over && "font-medium text-negative")}>
        {leg.position.name} {formatPercent(leg.shareBefore, 1)} →{" "}
        {formatPercent(leg.shareAfter, 1)}
        {cap !== undefined &&
          cap > 0 &&
          ` (Ziel ${formatPercent(new MoneyDecimal(cap), 1)})`}
      </span>
    );
  };
  const future = plan.changeInFiveYears;
  return (
    <div className="space-y-1 px-1 text-sm text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Gewichtung:</span> {part(plan.sell)}{" "}
        · {part(plan.buy)}
      </p>
      {future && !future.isZero() && (
        <p>
          <span className="font-medium text-foreground">In 5 Jahren:</span>{" "}
          <SignedAmount amount={future} /> im Jahr mit dem Dividendenwachstum beider
          Assets
        </p>
      )}
    </div>
  );
}

function payoutLabel(position: SwapPosition): { rhythm: string; months: string | null } {
  return position.months.length === 0
    ? { rhythm: "keine Ausschüttung", months: null }
    : payoutText(position.months);
}

function sharesLabel(leg: SwapLeg): string | null {
  return leg.shares?.greaterThanOrEqualTo("0.1")
    ? `≈ ${sharesFormat.format(leg.shares.toNumber())} Stück`
    : null;
}

/** Verkauf und Kauf: ab `md` als Tabelle wie im Nachkauf, auf dem Telefon als Liste. */
function LegList({ plan }: { plan: SwapPlan }) {
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  const legs = [
    { key: "sell", label: "Verkauf", leg: plan.sell, annual: plan.sell.annual.negate() },
    { key: "buy", label: "Kauf", leg: plan.buy, annual: plan.buy.annual },
  ] as const;

  if (!isWide) {
    return (
      <ListGroup>
        {legs.map(({ key, label, leg, annual }) => {
          const payout = payoutLabel(leg.position);
          const shares = sharesLabel(leg);
          return (
            <li key={key}>
              <ListRow>
                <ListItemBody
                  title={
                    <AssetLink id={leg.position.securityId} name={leg.position.name} />
                  }
                  meta={
                    <>
                      <span className="font-medium text-foreground">{label}</span>
                      <span>{payout.rhythm}</span>
                      {shares && <span className="tabular-amount">{shares}</span>}
                    </>
                  }
                  trailing={
                    <span className="flex flex-col items-end">
                      <span className="font-medium text-foreground">
                        {formatMoneyWhole(plan.amount)}
                      </span>
                      <span className="whitespace-nowrap">
                        <SignedAmount amount={annual} /> im Jahr
                      </span>
                    </span>
                  }
                />
              </ListRow>
            </li>
          );
        })}
      </ListGroup>
    );
  }

  return (
    <Table>
      <caption className="sr-only">Verkauf und Kauf des Tauschs</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Ausschüttung</TableHead>
          <TableHead className="whitespace-nowrap text-right">Stück</TableHead>
          <TableHead className="whitespace-nowrap text-right">Betrag</TableHead>
          <TableHead className="whitespace-nowrap text-right">Rendite</TableHead>
          <TableHead className="whitespace-nowrap text-right">Im Jahr</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {legs.map(({ key, label, leg, annual }) => {
          const payout = payoutLabel(leg.position);
          return (
            <TableRow key={key}>
              <TableCell>
                <span className="block text-xs text-muted-foreground">{label}</span>
                <AssetLink id={leg.position.securityId} name={leg.position.name} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {payout.rhythm}
                {payout.months && <span className="block text-xs">{payout.months}</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-amount text-muted-foreground">
                {sharesLabel(leg) ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-amount">
                {formatMoneyWhole(plan.amount)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-amount">
                {formatPercent(leg.yieldPercent, 1)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-amount">
                <SignedAmount amount={annual} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Andere Kaufziele für denselben Verkauf, nach Rendite: Was jedes im Jahr
 * gegenüber dem Behalten ändert. Antippen wählt es als Kauf.
 */
function AlternativeList({
  alternatives,
  caps,
  onChoose,
}: {
  alternatives: readonly SwapPlan[];
  caps: ReadonlyMap<string, number>;
  onChoose: (securityId: string) => void;
}) {
  return (
    <ListGroup>
      {alternatives.map((entry) => {
        const { position } = entry.buy;
        const over = overTarget(caps, position.securityId, entry.buy.shareAfter);
        return (
          <li key={position.securityId}>
            <ListRow asChild>
              <button
                type="button"
                className="w-full text-left"
                aria-label={`${position.name} als Kauf wählen`}
                onClick={() => {
                  onChoose(position.securityId);
                }}
              >
                <ListItemBody
                  title={position.name}
                  meta={
                    <>
                      <span>{formatPercent(entry.buy.yieldPercent, 1)} Rendite</span>
                      <span>{payoutLabel(position).rhythm}</span>
                      {over && (
                        <span className="font-medium text-negative">
                          über Zielgewichtung
                        </span>
                      )}
                    </>
                  }
                  trailing={
                    <span className="whitespace-nowrap">
                      <SignedAmount amount={entry.change} /> im Jahr
                    </span>
                  }
                />
              </button>
            </ListRow>
          </li>
        );
      })}
    </ListGroup>
  );
}

function toBarData({ forecast }: ForecastBasis, plan: SwapPlan): CategoryDatum[] {
  return forecast.months.map((month, index) => {
    const lost = plan.lost[index];
    const gained = plan.gained[index];
    return {
      key: `${String(month.year)}-${String(month.month)}`,
      label: monthNameDeShort(month.month),
      detail: `${monthNameDe(month.month)} ${String(month.year)}`,
      value: plan.after[index].toChartNumber(),
      money: plan.after[index],
      count: 0,
      breakdown: [
        { name: "Bisher", money: plan.before[index] },
        ...(lost.isZero()
          ? []
          : [{ name: `Ohne ${plan.sell.position.name}`, money: lost.negate() }]),
        ...(gained.isZero()
          ? []
          : [{ name: `Mit ${plan.buy.position.name}`, money: gained }]),
      ],
    };
  });
}
