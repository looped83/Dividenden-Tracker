import * as React from "react";
import { useSearchParams } from "react-router";
import { KpiHero } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { formatMoneyWhole, formatPercent } from "@/lib/money";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import { ForecastGate, type ForecastBasis } from "@/features/securities/ForecastGate";
import { monthsEarlier } from "@/features/securities/snowball";
import {
  AMOUNT_MAX,
  DEFAULT_FORECAST_SETTINGS,
  EXCLUDED_MAX,
  parseGermanNumber,
  useForecastSettings,
  useSaveForecastSettings,
  type ForecastSettings,
} from "@/features/securities/forecastSettings";
import { NumberField, SettingCell, SettingsList } from "./fields";
import { FOCUS_LABEL, monthlyAverage, weakestMonth } from "./format";
import { BuyList, ExcludedList, SpreadLine } from "./PurchaseParts";
import {
  PURCHASE_RULES,
  concentrationAfter,
  planPurchase,
  purchaseCandidates,
  type PlanFocus,
  type PurchasePlan,
} from "./purchase";
import { POSITION_CAP_DEFAULT, usePositionCaps } from "./positionCaps";
import { useSavingsPlans } from "./savingsPlanHooks";
import { activeMonthlyTotal } from "./savingsPlans";
import { TargetGain } from "./TargetGain";
import { MIN_GAIN_MONTHS, withPlanSavings } from "./targetTime";

const NO_CAPS: ReadonlyMap<string, number> = new Map();

/**
 * Planer › **Nachkauf**: Was bringt der nächste Kauf? Ein Betrag wird auf
 * Positionen des eigenen Bestands verteilt (wenige Titel, mindestens 100 €
 * je Kauf). Die Eingaben stehen in der Adresse (`?betrag=1000&anzahl=2`),
 * damit Zurück und Direktlinks sie behalten; gespeichert werden nur die
 * ausgeschlossenen Assets (CALCULATION_RULES.md §16). Sparpläne plant seit
 * 2.33.0 nur noch Planer › Sparpläne.
 */
export function PurchaseTab() {
  const settings = useForecastSettings().data ?? DEFAULT_FORECAST_SETTINGS;
  return (
    <ForecastGate emptyDescription="Der Nachkauf verteilt einen Betrag auf deinen Bestand und zeigt, was er an Dividende bringt. Dafür braucht er einen Depotstand aus dem DivvyDiary-Portfolio-Export.">
      {(basis) => <Purchase basis={basis} settings={settings} />}
    </ForecastGate>
  );
}

/** Eingaben aus der Adresse; ohne Angabe gilt die Vorbelegung. */
function readInputs(params: URLSearchParams) {
  const rules = PURCHASE_RULES;
  const rawFocus = params.get("fokus");
  const focus: PlanFocus =
    rawFocus === "monate" || rawFocus === "wachstum" ? rawFocus : "dividende";
  const rawAmount = parseGermanNumber(params.get("betrag") ?? "");
  const amount =
    typeof rawAmount === "number" && rawAmount > 0 && rawAmount <= AMOUNT_MAX
      ? rawAmount
      : rules.defaultAmount;
  const rawBuys = Number.parseInt(params.get("anzahl") ?? "", 10);
  const buys = rawBuys >= 1 && rawBuys <= rules.maxBuys ? rawBuys : rules.defaultBuys;
  return { focus, amount, buys };
}

function Purchase({
  basis,
  settings,
}: {
  basis: ForecastBasis;
  settings: ForecastSettings;
}) {
  const { forecast, snapshots, names, facets, depot } = basis;
  const [params, setParams] = useSearchParams();
  const { data: savingsPlans = [] } = useSavingsPlans();
  const caps = usePositionCaps().data ?? NO_CAPS;
  const savingsTotal = Math.round(activeMonthlyTotal(savingsPlans).toNumber());
  const { focus, amount, buys } = readInputs(params);
  const rules = PURCHASE_RULES;
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
        buys,
        capPercent: POSITION_CAP_DEFAULT,
        caps,
      }),
    [forecast, candidates, amount, focus, buys, caps],
  );
  const spread = React.useMemo(
    () =>
      plan && plan.buys.length > 0
        ? concentrationAfter({ snapshots, facets, names, plan })
        : null,
    [snapshots, facets, names, plan],
  );

  const hasPlan = plan !== null && plan.buys.length > 0;
  // Ziel-Zeit (§14.4): Der Kauf kommt als zusätzliche Dividende ab heute zu
  // dem hinzu, womit der Schneeball ohnehin rechnet.
  const snowball = React.useMemo(
    () => withPlanSavings(settings, savingsTotal),
    [settings, savingsTotal],
  );
  const gain = React.useMemo(
    () =>
      plan && plan.buys.length > 0
        ? monthsEarlier({
            depot,
            settings: snowball,
            netRatio: forecast.netRatio,
            extraAnnualNet: plan.annual.toDecimal(),
          })
        : null,
    [plan, depot, snowball, forecast.netRatio],
  );
  return (
    <div className="space-y-10 lg:space-y-12">
      <div className="space-y-6">
        {/* Wie im Schneeball: Ergebnis oben, darunter die Eingaben (seit 2.27.0). */}
        {hasPlan && (
          <PlanSummary
            plan={plan}
            gain={
              gain !== null && gain >= MIN_GAIN_MONTHS ? (
                <TargetGain months={gain} target={snowball.targetMonthly} />
              ) : undefined
            }
          />
        )}

        <SettingsList label="Eingaben" className="grid-cols-2 md:grid-cols-3">
          <NumberField
            id="purchase-amount"
            max={AMOUNT_MAX}
            label="Betrag"
            fullLabel="Betrag des Einmalkaufs"
            suffix="€"
            value={amount}
            onCommit={(value) => {
              setParam({ betrag: value === null ? null : String(value) });
            }}
          />
          <SettingCell label="Käufe" htmlFor="purchase-buys">
            <Select
              id="purchase-buys"
              aria-label="Höchstens so viele Käufe"
              className="h-9 py-0"
              value={String(buys)}
              onChange={(event) => {
                setParam({ anzahl: event.target.value });
              }}
            >
              {Array.from({ length: rules.maxBuys }, (_, index) => index + 1).map(
                (count) => (
                  <option key={count} value={count}>
                    {String(count)}
                  </option>
                ),
              )}
            </Select>
          </SettingCell>
          {/* Mobil volle Breite: „Dividendenwachstum" passt nicht in ein Drittel. */}
          <SettingCell
            label="Schwerpunkt"
            htmlFor="purchase-focus"
            className="col-span-2 md:col-span-1"
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
        </SettingsList>

        {!hasPlan ? (
          <p className="px-1 text-sm text-muted-foreground">
            {candidates.length === 0
              ? "Im Bestand ist kein Asset mit Kurs und Dividende, das sich nachkaufen ließe."
              : plan === null
                ? `Mindestens ${String(rules.minimum)} € je Kauf.`
                : ![...caps.values()].some((cap) => cap > 0)
                  ? "Gib Assets beim Bearbeiten eine Zielgewichtung, dann schlägt der Nachkauf sie vor."
                  : "Kein Asset hat unter seiner Zielgewichtung noch Platz."}
          </p>
        ) : (
          <SpreadLine
            spread={spread}
            cap={caps.get(spread?.position.key ?? "") ?? null}
            plan={plan}
          />
        )}
      </div>

      {hasPlan && (
        <>
          <Section title="Käufe">
            <BuyList
              plan={plan}
              canExclude={settings.excluded.length < EXCLUDED_MAX}
              onExclude={(id) => {
                setExcluded([...settings.excluded, id]);
              }}
            />
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

function PlanSummary({
  plan,
  gain,
}: {
  plan: PurchasePlan;
  /** Ziel-Zeit unter der Hauptzahl ({@link TargetGain}). */
  gain: React.ReactNode;
}) {
  return (
    <KpiHero
      // Netto wie überall im Planer; „netto" stand bis 2.32 im Etikett.
      label="Dieser Kauf bringt im Jahr"
      value={
        <>
          +<AmountText amount={plan.annual} />
        </>
      }
      caption={`${formatPercent(plan.yieldPercent, 1)} auf ${formatMoneyWhole(plan.invested)}`}
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
