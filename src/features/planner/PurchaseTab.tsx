import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronDown, EyeOff, RotateCcw } from "lucide-react";
import { KpiHero } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Button } from "@/components/ui/button";
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
  EUR,
  Money,
  formatMoney,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { useBackState } from "@/lib/hooks/useBackState";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils/cn";
import { formatCountNoun } from "@/lib/utils/formatNumber";
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
import { AssetLink } from "./AssetLink";
import { NumberField, SettingCell, SettingsList } from "./fields";
import { rhythm } from "./format";
import {
  PURCHASE_RULES,
  concentrationAfter,
  planPurchase,
  purchaseCandidates,
  type PlanFocus,
  type PlannedBuy,
  type PurchasePlan,
} from "./purchase";
import { POSITION_CAP_DEFAULT, usePositionCaps } from "./positionCaps";
import { useSavingsPlans } from "./savingsPlanHooks";
import { activeMonthlyTotal } from "./savingsPlans";
import { TargetGain } from "./TargetGain";
import { MIN_GAIN_MONTHS, withPlanSavings } from "./targetTime";

const FOCUS_LABEL: Record<PlanFocus, string> = {
  dividende: "Mehr Dividende",
  monate: "Monate glätten",
  wachstum: "Dividendenwachstum",
};

const NO_CAPS: ReadonlyMap<string, number> = new Map();

const sharesFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

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
                : caps.size === 0
                  ? "Gib Assets auf ihrer Seite eine Zielgewichtung, dann schlägt der Nachkauf sie vor."
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
  /**
   * Gewichtung der größten Position; `null` ohne eigene. Dann gibt es nichts
   * zu überschreiten: Der Standard 0 % hieße sonst „immer darüber".
   */
  cap: number | null;
  plan: PurchasePlan;
}) {
  if (spread === null) return null;
  const over = cap !== null && spread.position.percent.greaterThan(cap);
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
          {formatMoneyWhole(plan.unplaced)} finden unter den Zielgewichtungen keinen
          Platz. Mehr Käufe oder höhere Zielgewichtungen verteilen sie.
        </p>
      )}
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
          value: formatMoneyWhole(average(plan.after)),
          caption: `vorher ${formatMoneyWhole(average(plan.before))}`,
        },
        {
          label: "Schwächster Monat",
          value: formatMoneyWhole(weakest(plan.after)),
          caption: `vorher ${formatMoneyWhole(weakest(plan.before))}`,
        },
      ]}
    />
  );
}

/** „monatlich" oder „quartalsweise · Mär, Jun, Sep, Dez". */
function payoutText(months: readonly number[]): {
  rhythm: string;
  months: string | null;
} {
  return {
    rhythm: rhythm(months.length),
    // Ein Monatszahler braucht keine Monatsliste: „monatlich" sagt alles.
    months: months.length === 12 ? null : months.map(monthNameDeShort).join(", "),
  };
}

function sharesText(buy: PlannedBuy): string | null {
  return buy.shares?.greaterThanOrEqualTo("0.1")
    ? `≈ ${sharesFormat.format(buy.shares.toNumber())} Stück`
    : null;
}

/**
 * Käufe des Plans: ab `md` als Tabelle wie Bestand › Assets (seit 2.32.0),
 * auf dem Telefon als Liste.
 */
function BuyList({
  plan,
  canExclude,
  onExclude,
}: {
  plan: PurchasePlan;
  canExclude: boolean;
  onExclude: (securityId: string) => void;
}) {
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  if (!isWide) {
    return (
      <ListGroup>
        {plan.buys.map((buy) => (
          <li key={buy.securityId}>
            <BuyRow
              buy={buy}
              canExclude={canExclude}
              onExclude={() => {
                onExclude(buy.securityId);
              }}
            />
          </li>
        ))}
      </ListGroup>
    );
  }
  return (
    <Table>
      <caption className="sr-only">Vorgeschlagene Käufe</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Ausschüttung</TableHead>
          <TableHead className="whitespace-nowrap text-right">Stück</TableHead>
          <TableHead className="whitespace-nowrap text-right">Betrag</TableHead>
          <TableHead className="whitespace-nowrap text-right">Mehr im Jahr</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Aktionen</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {plan.buys.map((buy) => {
          const payout = payoutText(buy.months);
          const shares = sharesText(buy);
          return (
            <TableRow key={buy.securityId}>
              <TableCell>
                <AssetLink id={buy.securityId} name={buy.name} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {payout.rhythm}
                {payout.months && <span className="block text-xs">{payout.months}</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-amount text-muted-foreground">
                {shares ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-amount">
                {formatMoneyWhole(buy.invest)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-amount">
                +{formatMoney(buy.annual)}
              </TableCell>
              <TableCell className="text-right">
                {canExclude && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${buy.name} nicht mehr vorschlagen`}
                    title="Nicht mehr vorschlagen"
                    onClick={() => {
                      onExclude(buy.securityId);
                    }}
                  >
                    <EyeOff aria-hidden />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function BuyRow({
  buy,
  canExclude,
  onExclude,
}: {
  buy: PlannedBuy;
  canExclude: boolean;
  onExclude: () => void;
}) {
  const backState = useBackState();
  const payout = payoutText(buy.months);
  const shares = sharesText(buy);
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
              <span>{payout.rhythm}</span>
              {payout.months && <span>{payout.months}</span>}
              {shares && <span className="tabular-amount">{shares}</span>}
            </>
          }
          trailing={
            <span className="flex flex-col items-end">
              <span className="font-medium text-foreground">
                {formatMoneyWhole(buy.invest)}
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
