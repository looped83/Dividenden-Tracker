import { Target } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { TimeStatus } from "@/lib/goals";
import { GoalCard } from "./GoalCard";
import { useGoalsContext } from "./context";

const EMPTY_TEXT: Record<TimeStatus, string> = {
  current: "Zurzeit läuft kein Zielzeitraum.",
  upcoming: "Kein Ziel liegt in der Zukunft.",
  ended: "Noch kein Zielzeitraum ist abgeschlossen.",
};

/**
 * Ein Reiter der Zielseite: die Ziele **eines** Zeitstatus.
 *
 * Die drei Gruppen standen zuvor untereinander auf einer Seite. Als Reiter
 * unter dem Titel — wie in Statistik und Einstellungen — ist jede Gruppe
 * direkt erreichbar, statt am Ende einer langen Seite zu liegen, und die
 * Adresse benennt, was man gerade sieht.
 */
export function GoalsTab({ status }: { status: TimeStatus }) {
  const { byStatus, onEdit, onDelete } = useGoalsContext();
  const items = byStatus[status];

  if (items.length === 0) {
    return <EmptyState icon={Target} title={EMPTY_TEXT[status]} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((progress) => (
        <GoalCard
          key={progress.goal.id}
          progress={progress}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
