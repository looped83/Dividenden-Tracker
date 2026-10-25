import * as React from "react";
import { Link } from "react-router";
import { useBackState } from "@/lib/hooks/useBackState";
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { KpiHero, KpiHeroSkeleton } from "@/components/domain/KpiHero";
import { DetailBackLink } from "@/components/layout/DetailHeader";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ConfirmSummary } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FilterBar,
  FilterField,
  FilterReset,
  FilterSort,
  FilterToggle,
  useFilterDisclosure,
  type FilterSortDirection,
} from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
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
import { useGoalProgressPayments } from "@/features/goals/hooks";
import { trailingMonthlyAverage } from "@/lib/goals";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useToday } from "@/lib/hooks/useToday";
import { EUR, Money, formatMoney, formatPercent, sumMoney } from "@/lib/money";
import { coverFixedCosts, type CostCoverage, type FixedCost } from "@/lib/progress";
import { cn } from "@/lib/utils/cn";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCountNoun, formatCountNumber } from "@/lib/utils/formatNumber";
import { FixedCostDialog } from "./FixedCostDialog";
import { FIXED_COSTS_MAX, useFixedCosts, useSaveFixedCosts } from "./hooks";

type StatusFilter = "" | "covered" | "open";
type SortField = "name" | "amount";

const SORT_OPTIONS = [
  { value: "name", label: "Nach Name" },
  { value: "amount", label: "Nach Betrag" },
] as const;

const yearly = (amount: Money) =>
  formatMoney(Money.fromDecimal(amount.toDecimal().times(12), EUR));

/**
 * Alle Fixkosten (seit 2.15.0): die Pflegeseite zur kurzen Liste im
 * Fortschritt. Aufgebaut wie Bestand › Assets (seit 2.15.1): Filterleiste,
 * Kennzahlkopf, Abschnitt mit „Neue Position", ab md eine Tabelle mit Stift
 * und Papierkorb je Zeile, auf dem Telefon eine Liste, deren Zeilen zur
 * Detailseite führen — dort stehen Bearbeiten und Löschen wie bei einer
 * Dividende. Filter und Sortierung leben nur auf der Seite: Die Liste ist
 * kurz genug, dass sie keinen Weg zurück in der Adresse braucht.
 */
export function FixedCostsPage() {
  const today = useToday();
  const { data: costs = [], isLoading, isError, error } = useFixedCosts();
  const payments = useGoalProgressPayments();
  const save = useSaveFixedCosts();
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  const [adding, setAdding] = React.useState(false);
  const [editCost, setEditCost] = React.useState<FixedCost | null>(null);
  const [deleteCost, setDeleteCost] = React.useState<FixedCost | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("");
  const [sort, setSort] = React.useState<SortField>("name");
  const [direction, setDirection] = React.useState<FilterSortDirection>("asc");
  const activeFilters = (search.trim() ? 1 : 0) + (status ? 1 : 0);
  const disclosure = useFilterDisclosure(activeFilters);
  const backState = useBackState();

  const coverage = React.useMemo(
    () => coverFixedCosts(costs, trailingMonthlyAverage(payments.payments, today)),
    [costs, payments.payments, today],
  );
  const rows = React.useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de");
    const factor = direction === "asc" ? 1 : -1;
    return coverage.items
      .filter(
        (item) =>
          (!needle || item.cost.name.toLocaleLowerCase("de").includes(needle)) &&
          (status === "" || (status === "covered") === (item.status === "covered")),
      )
      .sort(
        (a, b) =>
          factor *
          (sort === "amount"
            ? a.cost.amount.compareTo(b.cost.amount) ||
              a.cost.name.localeCompare(b.cost.name, "de")
            : a.cost.name.localeCompare(b.cost.name, "de")),
      );
  }, [coverage, search, status, sort, direction]);

  const resetFilters = () => {
    setSearch("");
    setStatus("");
  };

  const backLink = <DetailBackLink to="/fortschritt" label="Zum Fortschritt" />;

  if (isLoading || payments.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        {backLink}
        <span className="sr-only">Fixkosten werden geladen …</span>
        <KpiHeroSkeleton stats={2} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        {backLink}
        <EmptyState
          icon={Receipt}
          title="Fixkosten konnten nicht geladen werden"
          description={getErrorMessage(error, "Beim Laden ist ein Fehler aufgetreten.")}
          action={
            <Button asChild>
              <Link to="/fortschritt">Zum Fortschritt</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const confirmDelete = () => {
    if (!deleteCost) return;
    setDeleteError(null);
    save.mutate(
      costs.filter((other) => other.id !== deleteCost.id),
      {
        onSuccess: () => {
          setDeleteCost(null);
        },
        onError: (cause) => {
          setDeleteError(
            getErrorMessage(cause, "Die Fixkosten konnten nicht gelöscht werden."),
          );
        },
      },
    );
  };

  const total = sumMoney(
    costs.map((cost) => cost.amount),
    EUR,
  );
  const add = () => {
    setAdding(true);
  };
  const share = (cost: FixedCost) =>
    formatPercent(cost.amount.toDecimal().div(total.toDecimal()).times(100), 0);
  const actions = (cost: FixedCost) => (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${cost.name} bearbeiten`}
        aria-haspopup="dialog"
        onClick={() => {
          setEditCost(cost);
        }}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${cost.name} löschen`}
        onClick={() => {
          setDeleteError(null);
          setDeleteCost(cost);
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title="Fixkosten"
        actions={costs.length > 0 ? <FilterToggle disclosure={disclosure} /> : undefined}
      />

      {costs.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Noch keine Fixkosten"
          description="Trag ein, was jeden Monat anfällt, etwa Strom, Handy oder Fitnessstudio."
          action={
            <Button onClick={add}>
              <Plus aria-hidden /> Fixkosten eintragen
            </Button>
          }
        />
      ) : (
        <>
          <FilterBar disclosure={disclosure}>
            <FilterField id="fixed-search" label="Name suchen">
              <Input
                id="fixed-search"
                type="search"
                placeholder="Name suchen …"
                className="rounded-full pl-4"
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                }}
              />
            </FilterField>
            <FilterField id="fixed-status" label="Status">
              <Select
                id="fixed-status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as StatusFilter);
                }}
              >
                <option value="">Alle Positionen</option>
                <option value="covered">Gedeckt</option>
                <option value="open">Offen</option>
              </Select>
            </FilterField>
            <FilterSort
              id="fixed-sort"
              value={sort}
              direction={direction}
              options={SORT_OPTIONS}
              onValueChange={(value) => {
                const field = value as SortField;
                setSort(field);
                // Beträge zuerst die großen, Namen von A an.
                setDirection(field === "amount" ? "desc" : "asc");
              }}
              onDirectionChange={setDirection}
            />
            {activeFilters > 0 && <FilterReset onClick={resetFilters} />}
          </FilterBar>

          <div className="space-y-10 lg:space-y-12">
            <KpiHero
              label="Fixkosten im Monat"
              value={formatMoney(total)}
              stats={[
                {
                  label: "Gedeckt",
                  value: `${String(coverage.covered)} von ${String(costs.length)}`,
                  caption: "Positionen",
                },
                { label: "Im Jahr", value: yearly(total) },
              ]}
            />

            <Section
              title="Positionen"
              {...(rows.length !== costs.length && {
                description: `${formatCountNumber(rows.length)} von ${formatCountNoun(costs.length, "Position", "Positionen")}`,
              })}
              action={
                <Button
                  variant="outline"
                  onClick={add}
                  disabled={costs.length >= FIXED_COSTS_MAX}
                >
                  <Plus /> Neue Position
                </Button>
              }
            >
              {rows.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="Keine Fixkosten für diese Filter"
                  action={
                    <Button variant="outline" onClick={resetFilters}>
                      Filter zurücksetzen
                    </Button>
                  }
                />
              ) : isWide ? (
                <Table>
                  <caption className="sr-only">Fixkosten</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Im Monat</TableHead>
                      <TableHead className="text-right">Im Jahr</TableHead>
                      <TableHead className="text-right">Anteil</TableHead>
                      <TableHead className="w-0">
                        <span className="sr-only">Aktionen</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((item) => (
                      <TableRow key={item.cost.id}>
                        <TableCell className="font-medium">
                          <Link
                            to={`/fortschritt/fixkosten/${item.cost.id}`}
                            state={backState}
                            className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {item.cost.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusText item={item} />
                        </TableCell>
                        <TableCell className="text-right tabular-amount">
                          {formatMoney(item.cost.amount)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-amount">
                          {yearly(item.cost.amount)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-amount">
                          {share(item.cost)}
                        </TableCell>
                        <TableCell className="text-right">{actions(item.cost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <ListGroup>
                  {rows.map((item) => (
                    <li key={item.cost.id}>
                      <ListRow asChild>
                        <Link
                          to={`/fortschritt/fixkosten/${item.cost.id}`}
                          state={backState}
                        >
                          <ListItemBody
                            title={item.cost.name}
                            meta={
                              <>
                                <StatusText item={item} /> · {share(item.cost)}
                              </>
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
                  ))}
                </ListGroup>
              )}
            </Section>
          </div>
        </>
      )}

      <FixedCostDialog open={adding} onOpenChange={setAdding} costs={costs} />
      <FixedCostDialog
        open={editCost !== null}
        onOpenChange={(next) => {
          if (!next) setEditCost(null);
        }}
        costs={costs}
        cost={editCost ?? undefined}
      />
      <ConfirmDialog
        open={deleteCost !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteCost(null);
        }}
        title="Fixkosten löschen?"
        summary={
          deleteCost && (
            <ConfirmSummary
              items={[
                { label: "Name", value: deleteCost.name },
                { label: "Im Monat", value: formatMoney(deleteCost.amount) },
              ]}
            />
          )
        }
        error={deleteError}
        isPending={save.isPending}
        confirmLabel="Löschen"
        pendingLabel="Wird gelöscht …"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/** „gedeckt" in Grün, sonst der gedeckte Anteil. */
function StatusText({ item }: { item: CostCoverage }) {
  return item.status === "covered" ? (
    <span className="text-positive">gedeckt</span>
  ) : (
    <span className={cn(item.status === "open" && "text-muted-foreground")}>
      {formatPercent(item.percent, 0)} gedeckt
    </span>
  );
}
