import { Link } from "react-router";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GoalProgress } from "@/lib/goals";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalTypeLabel, GoalTypeMark } from "./GoalTypeMark";
import {
  goalDisplayTitle,
  money,
  remainderText,
  startsAtLabel,
  statusLabel,
  statusTone,
  timeProgressText,
} from "./format";

interface GoalCardProps {
  progress: GoalProgress;
  /**
   * Bearbeiten und Loeschen. Beides fehlt auf der Uebersicht — dort gibt es die
   * Dialoge nicht. Ohne die beiden entfaellt die Schaltflaechenzeile; alles
   * darueber bleibt Zeile fuer Zeile dieselbe Karte.
   */
  onEdit?: (goalId: string) => void;
  onDelete?: (goalId: string) => void;
}

const badgeVariantByTone = {
  positive: "positive",
  neutral: "primary",
  negative: "negative",
} as const;

/**
 * Die Zielkarte — **eine** fuer Zielseite und Uebersicht.
 *
 * Die Uebersicht hatte zuvor eine eigene, kuerzere Karte. Dieselbe Sache sah
 * damit an zwei Stellen unterschiedlich aus, und jede Aenderung musste zweimal
 * gemacht werden (oder blieb einmal liegen). Stellt alle fachlichen Zustaende
 * dar (bevorstehend, aktiv, erreicht, uebertroffen, beendet und nicht
 * erreicht); Lade-, Fehler- und Leerzustaende gehoeren auf die Seite. Alle
 * Werte stammen aus der Ziel-Domaenenschicht — hier wird nichts gerechnet.
 */
export function GoalCard({ progress, onEdit, onDelete }: GoalCardProps) {
  const { goal, status } = progress;
  const tone = statusTone(status);
  const isUpcoming = status === "upcoming";
  const hasActions = Boolean(onEdit ?? onDelete);

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        {/* Titel ueber die volle Breite, darunter Zielart und Status.
            Stand die Statusmarke rechts neben dem Titel, blieben in einer
            dreispaltigen Kachel rund 110 px fuer die Ueberschrift — „Dividenden-
            ziel 2028" brach dann mitten im Wort um. */}
        <div className="flex items-start gap-3">
          <GoalTypeMark goal={goal} />
          <div className="min-w-0 flex-1 space-y-1">
            <Link
              to={`/ziele/${goal.id}`}
              className="block rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <h3 className="text-base font-semibold tracking-tight">
                {goalDisplayTitle(goal)}
              </h3>
            </Link>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <GoalTypeLabel goal={goal} />
              <Badge variant={badgeVariantByTone[tone]} className="whitespace-nowrap">
                {statusLabel(status)}
              </Badge>
            </div>
          </div>
        </div>

        {isUpcoming ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            <span>{startsAtLabel(goal)}</span>
          </div>
        ) : (
          <GoalProgressBar progress={progress} />
        )}

        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Zielbetrag</dt>
            <dd className="tabular-nums font-medium">{money(progress.target)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Erhalten</dt>
            <dd className="tabular-nums font-medium">{money(progress.actual)}</dd>
          </div>
        </dl>

        {!isUpcoming && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{remainderText(progress)}</p>
            <p className="text-xs text-muted-foreground">{timeProgressText(progress)}</p>
          </div>
        )}

        {/* „Öffnen" gab es hier zusaetzlich; der Titel fuehrt bereits dorthin,
            und drei Schaltflaechen brachen die Zeile um. */}
        {hasActions && (
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onEdit(goal.id);
                }}
              >
                <Pencil aria-hidden /> Bearbeiten
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-negative hover:text-negative"
                onClick={() => {
                  onDelete(goal.id);
                }}
              >
                <Trash2 aria-hidden /> Löschen
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
