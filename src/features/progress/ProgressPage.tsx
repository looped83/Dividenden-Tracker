import * as React from "react";
import { Check, Pencil, Plus, Trophy } from "lucide-react";
import { KpiHero, KpiHeroSkeleton, type KpiStat } from "@/components/domain/KpiHero";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListDateTile, ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { CollapsibleMonth, MonthSections } from "@/components/ui/month-section";
import { Section, SectionButton } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { useGoalProgressPayments } from "@/features/goals/hooks";
import { trailingMonthlyAverage } from "@/lib/goals";
import { useOpenMonths } from "@/lib/hooks/useOpenMonths";
import { useToday } from "@/lib/hooks/useToday";
import {
  EUR,
  Money,
  MoneyDecimal,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import {
  coverFixedCosts,
  milestoneOverview,
  type CostCoverage,
  type CoverageResult,
  type Milestone,
  type NextMilestone,
} from "@/lib/progress";
import { cn } from "@/lib/utils/cn";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { FixedCostsDialog } from "./FixedCostsDialog";
import { useFixedCosts } from "./hooks";

const euro = (value: number) =>
  formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(value), EUR));

/**
 * Fortschritt (seit 2.12.0): **Wofür das Ganze, und komme ich voran?**
 *
 * Oben der Ø-Monat der letzten zwölf Monate, darunter, welche Fixkosten er
 * schon bezahlt, die nächsten Meilensteine und die erreichten. Alles leitet
 * sich aus den erhaltenen Dividenden ab (CALCULATION_RULES.md §15); gepflegt
 * werden nur die Fixkosten.
 */
export function ProgressPage() {
  const today = useToday();
  const { payments, isLoading, isError, error } = useGoalProgressPayments();
  const costsQuery = useFixedCosts();
  const [editing, setEditing] = React.useState(false);

  const costs = React.useMemo(() => costsQuery.data ?? [], [costsQuery.data]);
  const data = React.useMemo(() => {
    const average = trailingMonthlyAverage(payments, today);
    return {
      average,
      coverage: coverFixedCosts(costs, average),
      milestones: milestoneOverview(payments, today),
    };
  }, [payments, costs, today]);

  const edit = () => {
    setEditing(true);
  };

  let content: React.ReactNode;
  if (isLoading || costsQuery.isLoading) {
    content = (
      <div className="space-y-10" aria-busy="true">
        <span className="sr-only">Fortschritt wird geladen …</span>
        <KpiHeroSkeleton />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  } else if (isError) {
    content = (
      <EmptyState
        icon={Trophy}
        title="Fortschritt konnte nicht geladen werden"
        description={getErrorMessage(
          error,
          "Beim Laden der Dividenden ist ein Fehler aufgetreten.",
        )}
      />
    );
  } else {
    content = (
      <div className="space-y-10 lg:space-y-12">
        <ProgressHero
          average={data.average}
          coverage={data.coverage}
          reached={data.milestones.reached.length}
        />
        <CoverageSection coverage={data.coverage} onEdit={edit} />
        <Section title="Nächste Meilensteine">
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {data.milestones.next.map((milestone) => (
              <li key={milestone.kind}>
                <NextTile milestone={milestone} />
              </li>
            ))}
          </ul>
        </Section>
        {data.milestones.reached.length > 0 && (
          <ReachedSection
            reached={data.milestones.reached}
            currentYear={String(today.year)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Fortschritt" />
      {content}
      <FixedCostsDialog open={editing} onOpenChange={setEditing} costs={costs} />
    </div>
  );
}

function ProgressHero({
  average,
  coverage,
  reached,
}: {
  average: Money;
  coverage: CoverageResult;
  reached: number;
}) {
  const stats: KpiStat[] = [];
  if (coverage.items.length > 0) {
    stats.push({
      label: "Gedeckt",
      value: `${String(coverage.covered)} von ${String(coverage.items.length)}`,
      caption: "Fixkosten",
    });
    stats.push(
      coverage.next
        ? {
            label: "Als Nächstes",
            value: <span className="block truncate-fade">{coverage.next.cost.name}</span>,
            caption: `noch ${formatMoneyWhole(coverage.next.missing)}`,
          }
        : { label: "Als Nächstes", value: "–", caption: "alles gedeckt" },
    );
  }
  stats.push({
    label: "Erreicht",
    value: formatCountNumber(reached),
    caption: "Meilensteine",
  });

  const share = coverage.share;
  return (
    <KpiHero
      label="Ø im Monat · letzte 12 Monate"
      value={formatMoneyWhole(average)}
      caption={share ? `deckt ${formatPercent(share, 0)} deiner Fixkosten` : undefined}
      footer={
        share ? (
          <Bar percent={share.toNumber()} label="Anteil gedeckter Fixkosten" />
        ) : undefined
      }
      stats={stats}
    />
  );
}

function Bar({ percent, label }: { percent: number; label: string }) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      className="flex h-1 w-full overflow-hidden rounded-full bg-border"
    >
      <span
        className="h-full rounded-full bg-primary"
        style={{ width: `${String(width)}%` }}
      />
    </span>
  );
}

function CoverageSection({
  coverage,
  onEdit,
}: {
  coverage: CoverageResult;
  onEdit: () => void;
}) {
  if (coverage.items.length === 0) {
    return (
      <Section title="Was deine Dividenden bezahlen">
        <EmptyState
          icon={Check}
          title="Noch keine Fixkosten"
          description="Trag ein, was jeden Monat anfällt, etwa Strom, Handy oder Fitnessstudio. Dann siehst du, was deine Dividenden schon bezahlen."
          action={
            <Button onClick={onEdit}>
              <Plus aria-hidden /> Fixkosten eintragen
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <Section
      title="Was deine Dividenden bezahlen"
      action={
        <SectionButton icon={Pencil} onClick={onEdit}>
          Bearbeiten
        </SectionButton>
      }
    >
      <ListGroup>
        {coverage.items.map((item, index) => (
          <li key={`${String(index)}-${item.cost.name}`}>
            <CoverageRow item={item} />
          </li>
        ))}
      </ListGroup>
    </Section>
  );
}

function CoverageRow({ item }: { item: CostCoverage }) {
  const { status } = item;
  const percent = formatPercent(item.percent, 0);
  return (
    <ListRow>
      <span
        aria-hidden
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold tabular-amount",
          status === "covered" && "text-positive",
          status === "open" && "text-muted-foreground",
        )}
      >
        {status === "covered" ? <Check className="size-5" strokeWidth={2.5} /> : percent}
      </span>
      <ListItemBody
        title={item.cost.name}
        meta={
          status === "covered" ? (
            <span>gedeckt</span>
          ) : (
            <span>
              <span className="sr-only">{percent} gedeckt, </span>noch{" "}
              {formatMoneyWhole(item.missing)}
            </span>
          )
        }
        trailing={
          <>
            {formatMoneyWhole(item.cost.amount)}
            <span className="sr-only"> im Monat</span>
          </>
        }
      />
    </ListRow>
  );
}

const NEXT_LABEL: Record<NextMilestone["kind"], string> = {
  total: "Insgesamt erhalten",
  year: "Bestes Jahr",
  month: "Bester Monat",
  streak: "Monate in Folge",
  payers: "Verschiedene Zahler",
};

function isMoney(kind: Milestone["kind"]): boolean {
  return kind === "total" || kind === "year" || kind === "month";
}

function NextTile({ milestone }: { milestone: NextMilestone }) {
  const money = isMoney(milestone.kind);
  const format = (value: DecimalInstance | number) =>
    money
      ? formatMoneyWhole(Money.fromDecimal(new MoneyDecimal(value), EUR))
      : formatCountNumber(new MoneyDecimal(value).toNumber());
  const missing = new MoneyDecimal(milestone.threshold).minus(milestone.current);
  const label = NEXT_LABEL[milestone.kind];

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl bg-muted p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.8125rem] font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-[0.8125rem] text-muted-foreground tabular-amount">
          Ziel {format(milestone.threshold)}
        </span>
      </div>
      <span className="text-xl font-bold tracking-[-0.02em] tabular-amount">
        {format(milestone.current)}
      </span>
      <div className="mt-auto space-y-1.5">
        <Bar
          percent={milestone.percent.toNumber()}
          label={`${label}: Weg zum nächsten Meilenstein`}
        />
        <p className="text-xs text-muted-foreground tabular-amount">
          noch {format(missing)}
          {milestone.kind === "streak" ? " Monate" : ""}
        </p>
      </div>
    </div>
  );
}

function reachedText(milestone: Milestone): string {
  const n = formatCountNumber(milestone.threshold);
  switch (milestone.kind) {
    case "first":
      return "Erste Dividende";
    case "total":
      return `${euro(milestone.threshold)} insgesamt erhalten`;
    case "year":
      return `Erstmals ${euro(milestone.threshold)} in einem Jahr`;
    case "month":
      return `Erstmals ${euro(milestone.threshold)} in einem Monat`;
    case "streak":
      return `${n} Monate in Folge mit Dividende`;
    case "payers":
      return `${n} verschiedene Zahler`;
  }
}

/**
 * Erreichte Meilensteine nach Jahren, einklappbar wie die Monate der
 * Dividendenliste (`useOpenMonths`): offen ist das jüngste Jahr. Jahre statt
 * Monate, weil fast jeder Monat nur einen Meilenstein trägt — bei einer
 * langen Historie wären das Dutzende Zeilen mit je einem Eintrag. Eine zweite
 * Ebene mit Monaten kostete einen Tipp mehr je Eintrag; den Monat nennt die
 * Datumskachel.
 */
function ReachedSection({
  reached,
  currentYear,
}: {
  reached: readonly Milestone[];
  currentYear: string;
}) {
  const groups = React.useMemo(() => {
    const byMonth = new Map<string, Milestone[]>();
    for (const milestone of reached) {
      const key = milestone.reachedOn.slice(0, 4);
      const group = byMonth.get(key);
      if (group) group.push(milestone);
      else byMonth.set(key, [milestone]);
    }
    return [...byMonth].map(([key, items]) => ({ key, items }));
  }, [reached]);
  const { isOpen, toggle } = useOpenMonths(
    groups.map((group) => group.key),
    currentYear,
  );

  return (
    <Section title="Erreicht">
      <MonthSections>
        {groups.map((group) => (
          <CollapsibleMonth
            key={group.key}
            id={`erreicht-${group.key}`}
            title={group.key}
            aside={formatCountNoun(group.items.length, "Meilenstein", "Meilensteine")}
            open={isOpen(group.key)}
            onToggle={() => {
              toggle(group.key);
            }}
          >
            <ListGroup>
              {group.items.map((milestone) => (
                <li key={`${milestone.kind}-${String(milestone.threshold)}`}>
                  <ListRow>
                    <ListDateTile iso={milestone.reachedOn} />
                    <ListItemBody
                      title={
                        <>
                          {reachedText(milestone)}
                          <span className="sr-only">
                            , am {formatCalendarDate(milestone.reachedOn)}
                          </span>
                        </>
                      }
                    />
                  </ListRow>
                </li>
              ))}
            </ListGroup>
          </CollapsibleMonth>
        ))}
      </MonthSections>
    </Section>
  );
}
