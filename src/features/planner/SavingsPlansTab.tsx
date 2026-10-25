import * as React from "react";
import { PiggyBank, Plus } from "lucide-react";
import { KpiHero, KpiHeroSkeleton } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { Section } from "@/components/ui/section";
import { formatMoney, formatMoneyWhole, formatPercent } from "@/lib/money";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { useToday } from "@/lib/hooks/useToday";
import { formatDayMonth } from "@/lib/utils/formatDate";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import {
  CategoryBarChart,
  type CategoryDatum,
} from "@/features/statistics/components/charts";
import { useDepots } from "@/features/depots/hooks";
import { ForecastGate, type ForecastBasis } from "@/features/securities/ForecastGate";
import { purchaseCandidates } from "./purchase";
import { SavingsPlanDialog } from "./SavingsPlanDialog";
import { useSavingsPlans } from "./savingsPlanHooks";
import {
  SAVINGS_PLANS_MAX,
  nextExecution,
  savingsPlanOverview,
  type SavingsPlan,
  type SavingsPlanOverview,
  type SavingsPlanRow,
} from "./savingsPlans";

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
  const { forecast, snapshots, names } = basis;
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<SavingsPlan | null>(null);
  const overview = React.useMemo(
    () =>
      savingsPlanOverview(
        forecast,
        purchaseCandidates(forecast, snapshots, NO_EXCLUSIONS),
        plans,
      ),
    [forecast, snapshots, plans],
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
    <ListGroup>
      {rows.map((row) => (
        <li key={row.plan.id}>
          <PlanRow
            row={row}
            name={names.get(row.plan.securityId) ?? "Unbekanntes Asset"}
            muted={muted}
            onOpen={() => {
              setEditing(row.plan);
            }}
          />
        </li>
      ))}
    </ListGroup>
  );

  return (
    <div className="space-y-10 lg:space-y-12">
      <PlansSummary overview={overview} />

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

function PlansSummary({ overview }: { overview: SavingsPlanOverview }) {
  const count = overview.rows.length;
  return (
    <KpiHero
      label="Sparpläne im Monat"
      value={<AmountText amount={overview.monthly} />}
      caption={`${formatMoneyWhole(overview.yearly)} im Jahr · ${formatCountNoun(count, "aktiver Plan", "aktive Pläne")}`}
      stats={[
        {
          label: "Mehr Dividende",
          value: `+${formatMoneyWhole(overview.annual)}`,
          caption: "im Jahr nach 12 Monaten",
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
 * Ein Plan als Zeile: Rhythmus, nächste Ausführung und Depot links, rechts die
 * Rate und was zwölf Raten im Jahr bringen. Die ganze Zeile öffnet den Dialog.
 */
function PlanRow({
  row,
  name,
  muted,
  onOpen,
}: {
  row: SavingsPlanRow;
  name: string;
  muted: boolean;
  onOpen: () => void;
}) {
  const { plan } = row;
  const today = useToday();
  const { data: depots = [] } = useDepots();
  const next = muted ? null : nextExecution(plan, today);
  const depot = depots.find((entry) => entry.id === plan.depotId)?.name;
  const weekly = plan.interval === "weekly";
  return (
    <ListRow asChild>
      <button
        type="button"
        onClick={onOpen}
        className={muted ? "text-muted-foreground" : undefined}
      >
        <ListItemBody
          title={name}
          meta={
            <>
              <span>
                {weekly ? `${formatMoneyWhole(plan.amount)} wöchentlich` : "monatlich"}
              </span>
              {next && <span>nächste {formatDayMonth(next)}</span>}
              {depot && <span>{depot}</span>}
            </>
          }
          trailing={
            <span className="flex flex-col items-end">
              <span className="font-medium text-foreground">
                {weekly && "≈ "}
                {formatMoneyWhole(row.monthly)}
                <span className="text-muted-foreground">/Monat</span>
              </span>
              <span>
                {row.annual === null
                  ? "keine Dividende"
                  : `+${formatMoney(row.annual)} im Jahr`}
              </span>
            </span>
          }
        />
      </button>
    </ListRow>
  );
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
