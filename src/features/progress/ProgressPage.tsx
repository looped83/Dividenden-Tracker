import * as React from "react";
import { Link } from "react-router";
import { useBackState } from "@/lib/hooks/useBackState";
import { useOpenKeys } from "@/lib/hooks/useOpenKeys";
import { Check, Plus, Trophy } from "lucide-react";
import { KpiHero, KpiHeroSkeleton, type KpiStat } from "@/components/domain/KpiHero";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListDateTile, ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { CollapsibleMonth, MonthSections } from "@/components/ui/month-section";
import { Section, SectionButton, SectionLink } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { useGoalProgressPayments } from "@/features/goals/hooks";
import { useSecurities, useSecuritySnapshots } from "@/features/securities/hooks";
import { trailingMonthlyAverage } from "@/lib/goals";
import { useOpenMonths } from "@/lib/hooks/useOpenMonths";
import { useToday } from "@/lib/hooks/useToday";
import {
  EUR,
  Money,
  MoneyDecimal,
  formatMoney,
  formatMoneyWhole,
  formatPercent,
  sumMoney,
  type DecimalInstance,
} from "@/lib/money";
import {
  coverFixedCosts,
  milestoneOverview,
  paybackOverview,
  type CostCoverage,
  type CoverageResult,
  type Milestone,
  type MonthRef,
  type NextMilestone,
  type ProgressEtas,
} from "@/lib/progress";
import { cn } from "@/lib/utils/cn";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { FixedCostDialog } from "./FixedCostDialog";
import { PaybackSection } from "./PaybackSection";
import { paybackHoldings } from "./paybackHoldings";
import { ProgressBar } from "./ProgressBar";
import { useFixedCosts, useProgressEtas } from "./hooks";
import { monthLabel, reachedText } from "./format";

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
  const snapshotsQuery = useSecuritySnapshots();
  const securitiesQuery = useSecurities();
  const [adding, setAdding] = React.useState(false);

  const costs = React.useMemo(() => costsQuery.data ?? [], [costsQuery.data]);
  const data = React.useMemo(() => {
    const average = trailingMonthlyAverage(payments, today);
    return {
      average,
      coverage: coverFixedCosts(costs, average),
      milestones: milestoneOverview(payments, today),
      payback: paybackOverview(
        payments,
        paybackHoldings(snapshotsQuery.data ?? [], securitiesQuery.data ?? []),
      ),
    };
  }, [payments, costs, today, snapshotsQuery.data, securitiesQuery.data]);

  const etas = useProgressEtas({
    payments,
    today,
    milestones: data.milestones.next,
    coverage: data.coverage,
  });

  const add = () => {
    setAdding(true);
  };

  let content: React.ReactNode;
  if (
    isLoading ||
    costsQuery.isLoading ||
    snapshotsQuery.isLoading ||
    securitiesQuery.isLoading
  ) {
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
        {/* Ab lg zweispaltig: links Fixkosten und nächste Meilensteine (das,
            worauf man hinarbeitet), rechts der zurückverdiente Kaufpreis und das
            Erreichte. So sind beide Spalten etwa gleich lang. Auf dem Telefon
            untereinander; `grid-cols-1` (minmax(0, 1fr)), sonst dehnt ein
            langer Asset-Name die Spalte über den Bildschirm hinaus. */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start lg:gap-12">
          <div className="space-y-10 lg:space-y-12">
            <CoverageSection coverage={data.coverage} etas={etas.costs} onAdd={add} />
            <Section title="Nächste Meilensteine">
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-1 xl:grid-cols-2">
                {data.milestones.next.map((milestone) => (
                  <li key={milestone.kind}>
                    <NextTile
                      milestone={milestone}
                      eta={etas.milestones.get(milestone.kind)}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          </div>
          <div className="space-y-10 lg:space-y-12">
            <PaybackSection payback={data.payback} />
            {data.milestones.reached.length > 0 && (
              <ReachedSection
                reached={data.milestones.reached}
                currentYear={String(today.year)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Fortschritt" />
      {content}
      <FixedCostDialog open={adding} onOpenChange={setAdding} costs={costs} />
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
    // Die Summe steht neben dem Ø-Monat, damit beides direkt vergleichbar ist.
    stats.push({
      label: "Fixkosten",
      value: formatMoney(coverage.total),
      // Kurz als „28/31", damit die Zeile auch auf dem iPhone SE einzeilig
      // bleibt wie die Nachbarn; vorgelesen wird „28 von 31".
      caption: (
        <>
          <span aria-hidden="true">
            {coverage.covered}/{coverage.items.length}
          </span>
          <span className="sr-only">
            {coverage.covered} von {coverage.items.length}
          </span>{" "}
          gedeckt
        </>
      ),
    });
    stats.push(
      coverage.next
        ? {
            label: "Als Nächstes",
            value: <span className="block truncate-fade">{coverage.next.cost.name}</span>,
            caption: `noch ${formatMoney(coverage.next.missing)}`,
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
          <ProgressBar percent={share.toNumber()} label="Anteil gedeckter Fixkosten" />
        ) : undefined
      }
      stats={stats}
    />
  );
}

/**
 * Die Fixkosten kurz gefasst (seit 2.14.0): Die nächste Position steht offen
 * da, Gedecktes und weitere Offene klappen ein — eine lange Liste mit dreißig
 * Zeilen verdrängte sonst alles darunter. Jede Zeile führt zur Detailseite,
 * dort stehen Bearbeiten und Löschen wie bei einer Dividende.
 */
function CoverageSection({
  coverage,
  etas,
  onAdd,
}: {
  coverage: CoverageResult;
  etas: ProgressEtas["costs"];
  onAdd: () => void;
}) {
  const { isOpen, toggle } = useOpenKeys("fixkosten");
  const backState = useBackState();
  const groups = React.useMemo(() => {
    const covered = coverage.items.filter((item) => item.status === "covered");
    const open = coverage.items.filter((item) => item.status === "open");
    return (
      [
        { key: "covered", title: "Gedeckt", items: covered },
        { key: "open", title: coverage.next ? "Weitere offen" : "Offen", items: open },
      ] as const
    ).filter((group) => group.items.length > 0);
  }, [coverage]);

  if (coverage.items.length === 0) {
    return (
      <Section title="Was Dividenden decken">
        <EmptyState
          icon={Check}
          title="Noch keine Fixkosten"
          description="Trag ein, was jeden Monat anfällt, etwa Strom, Handy oder Fitnessstudio. Dann siehst du, was deine Dividenden schon bezahlen."
          action={
            <Button onClick={onAdd}>
              <Plus aria-hidden /> Fixkosten eintragen
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <Section
      title="Was Dividenden decken"
      action={
        <SectionButton icon={Plus} onClick={onAdd} aria-haspopup="dialog">
          Neu
        </SectionButton>
      }
    >
      <div className="space-y-2">
        {coverage.next && (
          <ListGroup aria-label="Als Nächstes">
            <CoverageRow item={coverage.next} eta={etas.get(coverage.next.cost.id)} />
          </ListGroup>
        )}
        <MonthSections>
          {groups.map((group) => (
            <CollapsibleMonth
              key={group.key}
              id={`fixkosten-${group.key}`}
              title={group.title}
              aside={`${formatCountNumber(group.items.length)} · ${formatMoney(
                sumMoney(
                  group.items.map((item) => item.cost.amount),
                  EUR,
                ),
              )}`}
              open={isOpen(group.key)}
              onToggle={() => {
                toggle(group.key);
              }}
            >
              <ListGroup>
                {group.items.map((item) => (
                  <CoverageRow
                    key={item.cost.id}
                    item={item}
                    eta={etas.get(item.cost.id)}
                  />
                ))}
              </ListGroup>
            </CollapsibleMonth>
          ))}
        </MonthSections>
      </div>
      {/* Gepflegt wird auf einer eigenen Seite (seit 2.15.0): hier bleibt
            die Liste kurz, dort stehen alle Positionen mit Stift und
            Papierkorb. */}
      <SectionLink to="/fortschritt/fixkosten" state={backState} className="mt-2">
        Alle Fixkosten
      </SectionLink>
    </Section>
  );
}

function CoverageRow({ item, eta }: { item: CostCoverage; eta: MonthRef | undefined }) {
  const { status } = item;
  const backState = useBackState();
  const percent = formatPercent(item.percent, 0);
  return (
    <li>
      <ListRow asChild>
        <Link to={`/fortschritt/fixkosten/${item.cost.id}`} state={backState}>
          <ListItemBody
            leading={
              <span
                aria-hidden
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold tabular-amount",
                  status === "covered" && "text-positive",
                  status === "open" && "text-muted-foreground",
                )}
              >
                {status === "covered" ? (
                  <Check className="size-5" strokeWidth={2.5} />
                ) : (
                  percent
                )}
              </span>
            }
            title={item.cost.name}
            meta={
              status === "covered" ? (
                <span>gedeckt</span>
              ) : (
                // Den gedeckten Anteil nennt die Kachel links; daneben der
                // voraussichtliche Monat (§15.4), sonst der Anteil.
                <span>
                  {status === "next" && <span className="sr-only">Als Nächstes, </span>}
                  noch {formatMoney(item.missing)}
                  {eta ? (
                    <>
                      {" "}
                      · <span className="sr-only">voraussichtlich gedeckt </span>ab{" "}
                      {monthLabel(eta)}
                    </>
                  ) : (
                    status === "next" && ` · ${percent} gedeckt`
                  )}
                </span>
              )
            }
            trailing={
              <>
                {formatMoney(item.cost.amount)}
                <span className="sr-only"> im Monat</span>
              </>
            }
          />
        </Link>
      </ListRow>
    </li>
  );
}

const NEXT_LABEL: Record<NextMilestone["kind"], string> = {
  total: "Insgesamt erhalten",
  year: "Bestes Jahr",
  month: "Bester Monat",
  streak: "Monate in Folge",
};

function isMoney(kind: Milestone["kind"]): boolean {
  return kind === "total" || kind === "year" || kind === "month";
}

function NextTile({
  milestone,
  eta,
}: {
  milestone: NextMilestone;
  eta: MonthRef | undefined;
}) {
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
        <ProgressBar
          percent={milestone.percent.toNumber()}
          label={`${label}: Weg zum nächsten Meilenstein`}
        />
        <p className="flex justify-between gap-3 text-xs text-muted-foreground tabular-amount">
          <span>
            noch {format(missing)}
            {milestone.kind === "streak" ? " Monate" : ""}
          </span>
          {eta && (
            <span>
              <span className="sr-only">voraussichtlich </span>
              <span aria-hidden>≈ </span>
              {monthLabel(eta)}
            </span>
          )}
        </p>
      </div>
    </div>
  );
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
