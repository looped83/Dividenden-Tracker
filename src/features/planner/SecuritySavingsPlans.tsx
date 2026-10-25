import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { Section, SectionLink } from "@/components/ui/section";
import { formatMoneyWhole } from "@/lib/money";
import { useToday } from "@/lib/hooks/useToday";
import { formatDayMonth } from "@/lib/utils/formatDate";
import { useDepots } from "@/features/depots/hooks";
import { SavingsPlanDialog } from "./SavingsPlanDialog";
import { useSavingsPlans } from "./savingsPlanHooks";
import {
  INTERVAL_LABEL,
  SAVINGS_PLANS_MAX,
  nextExecution,
  type SavingsPlan,
} from "./savingsPlans";

/**
 * Abschnitt „Sparplan" auf der Seite eines Assets (seit 2.21.0): die Pläne auf
 * dieses Asset, jeder zum Bearbeiten, und ein neuer mit dem Asset vorbelegt.
 * Die Übersicht aller Pläne steht unter Planer › Sparpläne.
 */
export function SecuritySavingsPlans({
  securityId,
  archived,
}: {
  securityId: string;
  archived: boolean;
}) {
  const { data: plans = [], isLoading } = useSavingsPlans();
  const { data: depots = [] } = useDepots();
  const today = useToday();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<SavingsPlan | null>(null);
  const own = plans.filter((plan) => plan.securityId === securityId);
  // Ein archiviertes Asset ohne Plan braucht den Abschnitt nicht.
  if (isLoading || (archived && own.length === 0)) return null;

  return (
    <Section
      title="Sparplan"
      action={
        own.length > 0 ? (
          <SectionLink to="/planer/sparplaene">Alle Sparpläne</SectionLink>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {own.length > 0 && (
          <ListGroup>
            {own.map((plan) => {
              const next = plan.paused ? null : nextExecution(plan, today);
              const depot = depots.find((entry) => entry.id === plan.depotId)?.name;
              return (
                <li key={plan.id}>
                  <ListRow asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(plan);
                      }}
                    >
                      <ListItemBody
                        title={`${formatMoneyWhole(plan.amount)} ${INTERVAL_LABEL[plan.interval]}`}
                        meta={
                          <>
                            {plan.paused ? (
                              <span>pausiert</span>
                            ) : (
                              next && <span>nächste {formatDayMonth(next)}</span>
                            )}
                            {depot && <span>{depot}</span>}
                          </>
                        }
                      />
                    </button>
                  </ListRow>
                </li>
              );
            })}
          </ListGroup>
        )}
        {own.length === 0 && (
          <p className="text-sm text-muted-foreground">Kein Sparplan hinterlegt.</p>
        )}
        {!archived && (
          <Button
            variant="outline"
            size="sm"
            disabled={plans.length >= SAVINGS_PLANS_MAX}
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus aria-hidden /> Sparplan
          </Button>
        )}
      </div>
      <SavingsPlanDialog
        open={adding}
        onOpenChange={setAdding}
        plans={plans}
        securityId={securityId}
      />
      <SavingsPlanDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        plans={plans}
        plan={editing ?? undefined}
      />
    </Section>
  );
}
