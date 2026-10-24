import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Pencil, Receipt, Trash2 } from "lucide-react";
import { KpiHero, KpiHeroSkeleton } from "@/components/domain/KpiHero";
import { DetailBackLink, DetailHeader } from "@/components/layout/DetailHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ConfirmSummary } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useGoalProgressPayments } from "@/features/goals/hooks";
import { trailingMonthlyAverage } from "@/lib/goals";
import { useToday } from "@/lib/hooks/useToday";
import { EUR, Money, formatMoneyWhole, formatPercent } from "@/lib/money";
import { coverFixedCosts } from "@/lib/progress";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { FixedCostDialog } from "./FixedCostDialog";
import { ProgressBar } from "./ProgressBar";
import { useFixedCost, useSaveFixedCosts } from "./hooks";

/**
 * Eine Fixkostenposition (seit 2.14.0), aufgebaut wie die Detailseite einer
 * Dividende: oben Rückweg und Symbolaktionen Bearbeiten und Löschen, darunter
 * Betrag und wie weit die Dividende ihn deckt.
 */
export function FixedCostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const { cost, data: costs = [], isLoading, isError, error } = useFixedCost(id);
  const payments = useGoalProgressPayments();
  const save = useSaveFixedCosts();

  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const coverage = React.useMemo(
    () => coverFixedCosts(costs, trailingMonthlyAverage(payments.payments, today)),
    [costs, payments.payments, today],
  );

  const backLink = <DetailBackLink to="/fortschritt" label="Zum Fortschritt" />;

  if (isLoading || payments.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        {backLink}
        <span className="sr-only">Fixkosten werden geladen …</span>
        <KpiHeroSkeleton />
      </div>
    );
  }

  const item = coverage.items.find((entry) => entry.cost.id === id);
  if (isError || !cost || !item) {
    return (
      <div className="space-y-6">
        {backLink}
        <EmptyState
          icon={Receipt}
          title="Fixkosten nicht gefunden"
          description={getErrorMessage(
            error,
            "Diese Position gibt es nicht (mehr). Möglicherweise wurde sie gelöscht.",
          )}
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
    setDeleteError(null);
    save.mutate(
      costs.filter((other) => other.id !== cost.id),
      {
        onSuccess: () => {
          setDeleteOpen(false);
          void navigate("/fortschritt");
        },
        onError: (cause) => {
          setDeleteError(
            getErrorMessage(cause, "Die Fixkosten konnten nicht gelöscht werden."),
          );
        },
      },
    );
  };

  const covered = item.status === "covered";
  const percent = formatPercent(item.percent, 0);
  const share = cost.amount.toDecimal().div(coverage.total.toDecimal()).times(100);
  const rank = coverage.items.indexOf(item) + 1;

  return (
    <div className="space-y-6">
      <DetailHeader
        back={backLink}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Bearbeiten"
              aria-haspopup="dialog"
              onClick={() => {
                setEditOpen(true);
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Löschen"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
        title={cost.name}
        badge={
          covered ? (
            <Badge variant="positive">Gedeckt</Badge>
          ) : item.status === "next" ? (
            <Badge variant="primary">Als Nächstes</Badge>
          ) : undefined
        }
        subtitle="Fixkosten"
      />

      <KpiHero
        label="Im Monat"
        value={formatMoneyWhole(cost.amount)}
        caption={
          covered
            ? "bezahlen deine Dividenden schon"
            : `zu ${percent} gedeckt · noch ${formatMoneyWhole(item.missing)}`
        }
        footer={
          <ProgressBar
            percent={item.percent.toNumber()}
            label={`${cost.name}: gedeckter Anteil`}
          />
        }
        stats={[
          {
            label: "Im Jahr",
            value: formatMoneyWhole(
              Money.fromDecimal(cost.amount.toDecimal().times(12), EUR),
            ),
          },
          {
            label: "Anteil",
            value: formatPercent(share, 0),
          },
          {
            label: "Platz",
            value: `${String(rank)} von ${String(coverage.items.length)}`,
          },
        ]}
      />

      <FixedCostDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        costs={costs}
        cost={cost}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Fixkosten löschen?"
        summary={
          <ConfirmSummary
            items={[
              { label: "Name", value: cost.name },
              { label: "Im Monat", value: formatMoneyWhole(cost.amount) },
            ]}
          />
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
