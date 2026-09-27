import { Link } from "react-router";
import { CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GoalProgress } from "@/lib/goals";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalTypeMark } from "./GoalTypeMark";
import {
  achievementText,
  goalDisplayTitle,
  money,
  startsAtLabel,
  statusLabel,
  statusTone,
} from "./format";

interface GoalCardProps {
  progress: GoalProgress;
}

const badgeVariantByTone = {
  positive: "positive",
  neutral: "primary",
  negative: "negative",
} as const;

const amountClass = "whitespace-nowrap text-lg font-semibold tabular-amount";

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
 * **Sie beantwortet nur zwei Fragen: Wie hoch ist das Ziel, und wo stehe
 * ich?** — „2.487,35 € von 3.600,00 €" in einer Zeile, der Prozentwert daneben,
 * darunter der Balken. Zuvor standen dort zusaetzlich Zeitfortschritt,
 * Zielbetrag und Erhaltenes als eigene Felder und der Restbetragssatz; die
 * Karte war fast doppelt so hoch, und die zwei Zahlen, auf die es ankommt,
 * gingen darin unter. Restbetrag und Zeitfortschritt stehen auf der
 * Detailseite.
 *
 * **Die ganze Karte fuehrt zur Detailseite**; dort stehen Bearbeiten und
 * Loeschen — wie bei Eingaengen und Assets. Die Schaltflaechenzeile unter
 * jeder Karte kostete eine Zeile und gab der Karte drei Ziele statt eines.
 */
export function GoalCard({ progress }: GoalCardProps) {
  const { goal, status } = progress;
  const tone = statusTone(status);

  return (
    <Card className="relative flex flex-col transition-colors hover:bg-accent/50 active:bg-accent motion-reduce:transition-none">
      <CardContent className="flex flex-1 flex-col gap-3 p-4 sm:p-6">
        {/* Der Titel nennt Zielart und Zeitraum bereits („Dividendenziel 2026",
            „Monatsziel Juli 2026"). Umbrochen wird nur an Wortgrenzen:
            Abgeschnitten oder mitten im Wort gebrochen liest sich beides
            schlechter als eine zweite Zeile. */}
        <div className="flex items-center gap-3">
          <GoalTypeMark goal={goal} />
          <div className="min-w-0 flex-1">
            {/* Die Marke steht in der Ecke und wird umflossen, statt eine
                eigene Spalte zu belegen: Als drittes Flex-Element nahm sie dem
                Titel dauerhaft ihre Breite, auch in der zweiten Zeile. */}
            <Badge
              variant={badgeVariantByTone[tone]}
              className="float-right mt-0.5 ml-2 whitespace-nowrap"
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
          </div>
        </div>

        {/* `mt-auto`: Stehen zwei Karten nebeneinander und bricht nur ein Titel
            um, liegen Betragszeile und Balken trotzdem auf einer Linie. */}
        {status === "upcoming" ? (
          // Ein Ziel, das noch nicht begonnen hat, hat nichts erhalten;
          // „0,00 € von …" waere eine Zahl ohne Auskunft.
          <div className="mt-auto space-y-1">
            <p>
              <span className={amountClass}>{money(progress.target)}</span>{" "}
              <span className="text-sm text-muted-foreground">Ziel</span>
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden />
              <span>{startsAtLabel(goal)}</span>
            </p>
          </div>
        ) : (
          <div className="mt-auto space-y-2">
            {/* Wird es zu eng (zwei Karten nebeneinander), rutscht zuerst der
                Prozentwert in die naechste Zeile, bei sehr langen Betraegen auch
                „von …" — nie mitten in einen Betrag. `ml-auto` haelt den
                Prozentwert dann rechts ueber dem Balkenende. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p>
                <span className={amountClass}>{money(progress.actual)}</span>{" "}
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  von {money(progress.target)}
                </span>
              </p>
              <span className="ml-auto text-sm font-medium tabular-nums">
                {achievementText(progress.percent)}
              </span>
            </div>
            <GoalProgressBar progress={progress} showPercent={false} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
