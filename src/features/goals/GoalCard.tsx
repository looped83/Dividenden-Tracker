import { Link } from "react-router";
import { CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GoalProgress } from "@/lib/goals";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalTypeMark } from "./GoalTypeMark";
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
 *
 * **Die ganze Karte fuehrt zur Detailseite**; dort stehen Bearbeiten und
 * Loeschen — wie bei Eingaengen und Assets. Die Schaltflaechenzeile unter
 * jeder Karte kostete eine Zeile und gab der Karte drei Ziele statt eines.
 */
export function GoalCard({ progress }: GoalCardProps) {
  const { goal, status } = progress;
  const tone = statusTone(status);
  const isUpcoming = status === "upcoming";

  return (
    <Card className="relative flex flex-col transition-colors hover:bg-accent/50 active:bg-accent motion-reduce:transition-none">
      <CardContent className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {/* Der Titel nennt Zielart und Zeitraum bereits („Dividendenziel 2026",
            „Monatsziel Juli 2026") — eine Zeile darunter, die dasselbe noch
            einmal sagt, ist keine Auskunft. Dort steht deshalb der
            Zeitfortschritt. Umbrochen wird nur an Wortgrenzen: Abgeschnitten
            oder mitten im Wort gebrochen liest sich beides schlechter als eine
            zweite Zeile. */}
        <div className="flex items-start gap-3">
          <GoalTypeMark goal={goal} />
          <div className="min-w-0 flex-1 space-y-1">
            {/* Die Marke steht in der Ecke und wird umflossen, statt eine
                eigene Spalte zu belegen: Als drittes Flex-Element nahm sie dem
                Titel dauerhaft ihre Breite, sodass „Dividendenziel 2026" auch
                dann umbrach, wenn es nebeneinander gepasst haette. */}
            <Badge
              variant={badgeVariantByTone[tone]}
              className="float-right ml-2 whitespace-nowrap"
            >
              {statusLabel(status)}
            </Badge>
            {/* Der Link dehnt sich per `::after` ueber die ganze Karte. */}
            <Link
              to={`/ziele/${goal.id}`}
              className="block rounded-sm outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              <h3 className="text-base font-semibold tracking-tight">
                {goalDisplayTitle(goal)}
              </h3>
            </Link>
            {!isUpcoming && (
              <p className="text-xs text-muted-foreground">
                {timeProgressText(progress)}
              </p>
            )}
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

        {/* Zwei Spalten schon auf dem Telefon — wie in der Historischen
            Uebersicht. Untereinander brauchten zwei kurze Zahlen vier Zeilen.
            Ein Ziel, das noch nicht begonnen hat, hat nichts erhalten; „0,00 €"
            waere eine Zeile ohne Auskunft. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Zielbetrag</dt>
            <dd className="tabular-nums font-medium">{money(progress.target)}</dd>
          </div>
          {!isUpcoming && (
            <div>
              <dt className="text-xs text-muted-foreground">Erhalten</dt>
              <dd className="tabular-nums font-medium">{money(progress.actual)}</dd>
            </div>
          )}
        </dl>

        {!isUpcoming && <p className="text-sm font-medium">{remainderText(progress)}</p>}
      </CardContent>
    </Card>
  );
}
