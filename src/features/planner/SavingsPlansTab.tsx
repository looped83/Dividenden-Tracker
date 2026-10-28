import * as React from "react";
import { Link } from "react-router";
import { Pencil, PiggyBank, Plus } from "lucide-react";
import { KpiHero, KpiHeroSkeleton } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { Section } from "@/components/ui/section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EUR, Money, formatMoney, formatMoneyWhole, formatPercent } from "@/lib/money";
import { useBackState } from "@/lib/hooks/useBackState";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils/cn";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import { useDepots } from "@/features/depots/hooks";
import { monthsEarlier } from "@/features/securities/snowball";
import { ForecastGate, type ForecastBasis } from "@/features/securities/ForecastGate";
import {
  DEFAULT_FORECAST_SETTINGS,
  useForecastSettings,
} from "@/features/securities/forecastSettings";
import { AssetLink } from "./AssetLink";
import { formatDecimal } from "./format";
import { usePositionCaps } from "./positionCaps";
import { purchaseCandidates } from "./purchase";
import { savingsPlanTips, type SavingsPlanTip } from "./savingsPlanTips";
import { SavingsPlanDialog } from "./SavingsPlanDialog";
import { useSavingsPlans } from "./savingsPlanHooks";
import {
  SAVINGS_PLANS_MAX,
  activeMonthlyTotal,
  savingsPlanOverview,
  type SavingsPlan,
  type SavingsPlanOverview,
  type SavingsPlanRow,
} from "./savingsPlans";
import { TargetGain } from "./TargetGain";
import { MIN_GAIN_MONTHS } from "./targetTime";

const NO_EXCLUSIONS: ReadonlySet<string> = new Set();

/**
 * Planer › **Sparpläne** (seit 2.21.0): die eigenen, von Hand gepflegten
 * Sparpläne — wie viel Geld monatlich fließt und was es nach zwölf Raten an
 * Nettodividende bringt (CALCULATION_RULES.md §17). Angelegt und geändert wird
 * hier oder auf der Seite des Assets.
 */
export function SavingsPlansTab() {
  const plansQuery = useSavingsPlans();
  return (
    <ForecastGate emptyDescription="Die Sparpläne zeigen, was deine Raten an Dividende bringen. Dafür brauchen sie einen Depotstand aus dem DivvyDiary-Portfolio-Export.">
      {(basis) =>
        plansQuery.isLoading ? (
          <KpiHeroSkeleton stats={2} />
        ) : (
          <SavingsPlans basis={basis} plans={plansQuery.data ?? []} />
        )
      }
    </ForecastGate>
  );
}

function SavingsPlans({
  basis,
  plans,
}: {
  basis: ForecastBasis;
  plans: readonly SavingsPlan[];
}) {
  const { forecast, snapshots, names, depot, reinvested } = basis;
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<SavingsPlan | null>(null);
  const overview = React.useMemo(
    () =>
      savingsPlanOverview(
        forecast,
        purchaseCandidates(forecast, snapshots, NO_EXCLUSIONS),
        plans,
        names,
      ),
    [forecast, snapshots, plans, names],
  );
  const caps = usePositionCaps().data;
  const forecastSettings = useForecastSettings().data ?? DEFAULT_FORECAST_SETTINGS;
  const excluded = forecastSettings.excluded;
  // Ziel-Zeit (§14.4): der Schneeball mit und ohne die aktiven Pläne; sie
  // kommen zu den Einmalkäufen hinzu.
  const target = forecastSettings.targetMonthly;
  const gain = React.useMemo(() => {
    const planSavings = Math.round(activeMonthlyTotal(plans).toNumber());
    if (planSavings <= 0) return null;
    return monthsEarlier({
      depot,
      settings: forecastSettings,
      netRatio: forecast.netRatio,
      extraSavings: planSavings,
    });
  }, [plans, forecastSettings, depot, forecast.netRatio]);
  const tips = React.useMemo(
    () =>
      caps === undefined
        ? []
        : savingsPlanTips({
            plans,
            snapshots,
            caps,
            excluded: new Set(excluded),
            names,
            reinvested,
          }),
    [plans, snapshots, caps, excluded, names, reinvested],
  );
  const full = plans.length >= SAVINGS_PLANS_MAX;
  const add = () => {
    setAdding(true);
  };

  const dialogs = (
    <>
      <SavingsPlanDialog open={adding} onOpenChange={setAdding} plans={plans} />
      <SavingsPlanDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        plans={plans}
        plan={editing ?? undefined}
      />
    </>
  );

  if (plans.length === 0) {
    return (
      <>
        <EmptyState
          icon={PiggyBank}
          title="Noch keine Sparpläne"
          description="Trag deine Sparpläne ein und sieh, wie viel monatlich fließt und was es an Dividende bringt."
          action={
            <Button onClick={add}>
              <Plus aria-hidden /> Sparplan eintragen
            </Button>
          }
        />
        {dialogs}
      </>
    );
  }

  const rowList = (rows: readonly SavingsPlanRow[], muted = false) => (
    <PlanList rows={rows} names={names} muted={muted} onOpen={setEditing} />
  );

  return (
    <div className="space-y-10 lg:space-y-12">
      <PlansSummary
        overview={overview}
        gain={
          gain !== null && gain >= MIN_GAIN_MONTHS ? (
            <TargetGain months={gain} target={target} />
          ) : undefined
        }
      />

      <Section
        title="Pläne"
        action={
          <Button variant="outline" onClick={add} disabled={full}>
            <Plus aria-hidden /> Neuer Sparplan
          </Button>
        }
      >
        {overview.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Alle Sparpläne sind pausiert.</p>
        ) : (
          rowList(overview.rows)
        )}
      </Section>

      {overview.paused.length > 0 && (
        <Section title="Pausiert">{rowList(overview.paused, true)}</Section>
      )}

      {tips.length > 0 && <PlanTips tips={tips} />}

      {overview.annual.isPositive() && (
        <Section title="Nächste 12 Monate">
          <CategoryBarChart
            data={toBarData(basis, overview)}
            ariaLabel="Erwartete Nettodividende je Monat mit den Sparplänen"
            categoryHeader="Monat"
            color="primary"
            showCount={false}
          />
        </Section>
      )}

      {dialogs}
    </div>
  );
}

function PlansSummary({
  overview,
  gain,
}: {
  overview: SavingsPlanOverview;
  /** Ziel-Zeit unter der Hauptzahl ({@link TargetGain}). */
  gain: React.ReactNode;
}) {
  const count = overview.rows.length;
  return (
    <KpiHero
      label="Sparpläne im Monat"
      value={<AmountText amount={overview.monthly} />}
      caption={`${formatMoneyWhole(overview.yearly)} im Jahr · ${formatCountNoun(count, "aktiver Plan", "aktive Pläne")}`}
      footer={gain}
      stats={[
        {
          label: "Mehr Dividende",
          value: `+${formatMoneyWhole(overview.annual)}`,
          caption: "p. a. in 12 Monaten",
        },
        {
          label: "Ertrag",
          value:
            overview.yieldPercent === null
              ? "–"
              : formatPercent(overview.yieldPercent, 1),
          caption: "netto auf die Raten",
        },
      ]}
    />
  );
}

/**
 * Pläne ab `md` als Tabelle wie Bestand › Assets (seit 2.32.0): Der Name
 * führt zum Asset, der Stift öffnet den Dialog. Auf dem Telefon eine Liste,
 * in der die ganze Zeile den Dialog öffnet.
 */
function PlanList({
  rows,
  names,
  muted,
  onOpen,
}: {
  rows: readonly SavingsPlanRow[];
  names: ReadonlyMap<string, string>;
  muted: boolean;
  onOpen: (plan: SavingsPlan) => void;
}) {
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  const { data: depots = [] } = useDepots();
  const nameOf = (row: SavingsPlanRow) =>
    names.get(row.plan.securityId) ?? "Unbekanntes Asset";
  if (!isWide) {
    return (
      <ListGroup>
        {rows.map((row) => (
          <li key={row.plan.id}>
            <PlanRow
              row={row}
              name={nameOf(row)}
              depot={depots.find((entry) => entry.id === row.plan.depotId)?.name}
              muted={muted}
              onOpen={() => {
                onOpen(row.plan);
              }}
            />
          </li>
        ))}
      </ListGroup>
    );
  }
  return (
    <Table className={cn(muted && "text-muted-foreground")}>
      <caption className="sr-only">{muted ? "Pausierte Sparpläne" : "Sparpläne"}</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Rhythmus</TableHead>
          <TableHead>Depot</TableHead>
          <TableHead className="whitespace-nowrap text-right">Im Monat</TableHead>
          <TableHead className="whitespace-nowrap text-right">Mehr im Jahr</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Aktionen</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { plan } = row;
          const name = nameOf(row);
          const weekly = plan.interval === "weekly";
          return (
            <TableRow key={plan.id}>
              <TableCell>
                <AssetLink id={plan.securityId} name={name} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {weekly ? `${formatMoneyWhole(plan.amount)} wöchentlich` : "monatlich"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {depots.find((entry) => entry.id === plan.depotId)?.name ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-amount">
                {weekly && "≈ "}
                {formatMoneyWhole(row.monthly)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-amount">
                {row.annual === null ? "keine Dividende" : `+${formatMoney(row.annual)}`}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Sparplan ${name} bearbeiten`}
                  onClick={() => {
                    onOpen(plan);
                  }}
                >
                  <Pencil />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Ein Plan als Zeile, **zwei Zeilen hoch** (seit 2.23.0): oben Name und Rate,
 * unten Rhythmus mit Depot und was zwölf Raten im Jahr bringen. Lange Namen
 * laufen aus, statt der Rate eine eigene Zeile zu geben — die Liste bleibt
 * gleichmäßig. Die ganze Zeile öffnet den Dialog.
 */
function PlanRow({
  row,
  name,
  depot,
  muted,
  onOpen,
}: {
  row: SavingsPlanRow;
  name: string;
  depot: string | undefined;
  muted: boolean;
  onOpen: () => void;
}) {
  const { plan } = row;
  const weekly = plan.interval === "weekly";
  const rhythm = weekly ? `${formatMoneyWhole(plan.amount)} wöchentlich` : "monatlich";
  return (
    <ListRow asChild>
      <button
        type="button"
        onClick={onOpen}
        className={muted ? "text-muted-foreground" : undefined}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate-fade font-medium">{name}</span>
            <span className="shrink-0 font-semibold tabular-amount">
              {weekly && "≈ "}
              {formatMoneyWhole(row.monthly)}
              <span className="text-muted-foreground">/Monat</span>
            </span>
          </span>
          <span className="mt-0.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate-fade text-muted-foreground">
              {rhythm}
              {depot && <span className="ml-2">{depot}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-amount">
              {row.annual === null
                ? "keine Dividende"
                : `+${formatMoney(row.annual)} im Jahr`}
            </span>
          </span>
        </span>
      </button>
    </ListRow>
  );
}

/**
 * Tipps (seit 2.26.0, `savingsPlanTips`): Abgleich der Pläne mit den
 * Gewichtungen. Jede Zeile führt zum Asset, wo Plan und Gewichtung stehen.
 * Ohne Befund fehlt der Abschnitt. Ab `md` als Tabelle (seit 2.32.0).
 */
function PlanTips({ tips }: { tips: readonly SavingsPlanTip[] }) {
  const backState = useBackState();
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  if (isWide) {
    return (
      <Section title="Tipps">
        <Table>
          <caption className="sr-only">Tipps zu Sparplänen und Zielgewichtungen</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Hinweis</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Wert</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tips.map((tip) => {
              const text = tipText(tip);
              return (
                <TableRow key={`${tip.kind}-${tip.securityId}`}>
                  <TableCell>
                    <AssetLink id={tip.securityId} name={tip.name} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{text.meta}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold tabular-amount">
                    {text.trailing ?? ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>
    );
  }
  return (
    <Section title="Tipps">
      <ListGroup>
        {tips.map((tip) => (
          <li key={`${tip.kind}-${tip.securityId}`}>
            <ListRow asChild>
              <Link to={`/depot/${tip.securityId}`} state={backState}>
                <ListItemBody title={tip.name} {...tipText(tip)} />
              </Link>
            </ListRow>
          </li>
        ))}
      </ListGroup>
    </Section>
  );
}

function tipText(tip: SavingsPlanTip): { meta: string; trailing?: string } {
  switch (tip.kind) {
    case "over":
      return {
        meta: `Über der Zielgewichtung von ${formatDecimal(tip.cap)}\u00A0%${tip.reinvested ? " · Dividenden reinvestiert" : ""}`,
        trailing: formatPercent(tip.percent, 1),
      };
    case "reinvestOver":
      return {
        meta: `Über der Zielgewichtung von ${formatDecimal(tip.cap)}\u00A0% · Reinvestition ausschalten`,
        trailing: formatPercent(tip.percent, 1),
      };
    case "reinvestRoom":
      return {
        meta: `Zielgewichtung ${formatDecimal(tip.cap)}\u00A0% · Reinvestition einschalten`,
        trailing: `${formatMoneyWhole(Money.fromDecimal(tip.room, EUR))} frei`,
      };
    case "reaching":
      return {
        meta: `Erreicht die Zielgewichtung von ${formatDecimal(tip.cap)}\u00A0%`,
        trailing: `in ${formatCountNoun(tip.months, "Monat", "Monaten")}`,
      };
    case "unweighted":
      return { meta: "Sparplan ohne Zielgewichtung" };
    case "room":
      return {
        meta: `Zielgewichtung ${formatDecimal(tip.cap)}\u00A0% · kein Sparplan`,
        trailing: `${formatMoneyWhole(Money.fromDecimal(tip.room, EUR))} frei`,
      };
  }
}

function toBarData(
  { forecast }: ForecastBasis,
  overview: SavingsPlanOverview,
): CategoryDatum[] {
  return forecast.months.map((month, index) => {
    const after = overview.after[index];
    const before = overview.before[index];
    return {
      key: `${String(month.year)}-${String(month.month)}`,
      label: monthNameDeShort(month.month),
      detail: `${monthNameDe(month.month)} ${String(month.year)}`,
      value: after.toChartNumber(),
      money: after,
      count: 0,
      breakdown: [
        { name: "Bisher", money: before },
        { name: "Durch Sparpläne", money: after.subtract(before) },
      ],
    };
  });
}
