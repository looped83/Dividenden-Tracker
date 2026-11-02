import * as React from "react";
import { Link } from "react-router";
import { Dumbbell, Gift } from "lucide-react";
import { KpiHero, KpiHeroSkeleton, type KpiStat } from "@/components/domain/KpiHero";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/features/progress/ProgressBar";
import {
  CHALLENGE_BONUS,
  activityCounts,
  canEditDay,
  challengeStatus,
  monthKey,
  monthLength,
  monthRef,
  newChallenge,
  nextMonthKey,
  suggestedTarget,
  type Challenge,
  type ChallengeStatus,
} from "@/lib/challenge";
import { useToday } from "@/lib/hooks/useToday";
import { isoDate, monthNameDe, type RefDate } from "@/lib/statistics/dates";
import { barIndex } from "@/lib/utils/barIndex";
import { cn } from "@/lib/utils/cn";
import { getErrorMessage } from "@/lib/utils/errorMessage";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { DayDialog } from "./DayDialog";
import { useChallenge, useSaveChallenge } from "./hooks";
import { courseLabel, courseVariant, formatPerWeek, formatWeekdayDate } from "./format";

const BONUS_TEXT = `${String(CHALLENGE_BONUS)} €`;

function monthTitle(key: string): string {
  const { year, month } = monthRef(key);
  return `${monthNameDe(month)} ${String(year)}`;
}

/**
 * Challenge (seit 2.67.0, Experiment): **Schaffe ich diesen Monat genug
 * Sporttage für den Bonus?** Oben der Stand gegen die Zielzahl, darunter der
 * Monat als Raster zum Eintragen, die Aktivitäten und — ab der Zielzahl — der
 * Bonus mit dem Weg in den Nachkauf (CALCULATION_RULES.md §18).
 */
export function ChallengePage() {
  const today = useToday();
  const query = useChallenge();
  const challenge = query.data ?? null;
  const [starting, setStarting] = React.useState(false);

  let content: React.ReactNode;
  if (query.isLoading) {
    content = (
      <div className="space-y-10" aria-busy="true">
        <span className="sr-only">Challenge wird geladen …</span>
        <KpiHeroSkeleton />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  } else if (query.isError) {
    content = (
      <EmptyState
        icon={Dumbbell}
        title="Challenge konnte nicht geladen werden"
        description={getErrorMessage(
          query.error,
          "Beim Laden ist ein Fehler aufgetreten.",
        )}
      />
    );
  } else if (!challenge || starting) {
    content = (
      <StartForm
        today={today}
        onStarted={() => {
          setStarting(false);
        }}
        onCancel={
          challenge
            ? () => {
                setStarting(false);
              }
            : undefined
        }
      />
    );
  } else {
    content = (
      <ChallengeView
        challenge={challenge}
        today={today}
        onRestart={() => {
          setStarting(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Challenge
            <Badge variant="neutral">Experiment</Badge>
          </span>
        }
      />
      {content}
    </div>
  );
}

function ChallengeView({
  challenge,
  today,
  onRestart,
}: {
  challenge: Challenge;
  today: RefDate;
  onRestart: () => void;
}) {
  const status = React.useMemo(
    () => challengeStatus(challenge, today),
    [challenge, today],
  );
  const activities = React.useMemo(() => activityCounts(challenge), [challenge]);
  const [day, setDay] = React.useState<string | null>(null);
  const [ending, setEnding] = React.useState(false);
  const save = useSaveChallenge();

  return (
    <div className="space-y-10 lg:space-y-12">
      <ChallengeHero challenge={challenge} status={status} />
      {status.reached && <BonusSection challenge={challenge} today={today} />}
      {/* Ab lg zweispaltig: links das Raster zum Eintragen, rechts was daraus
          wurde. Auf dem Telefon untereinander. */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start lg:gap-12">
        <Section
          title="Sporttage"
          description={
            status.phase === "upcoming"
              ? `Eintragen ab dem 1. ${monthNameDe(monthRef(challenge.month).month)}`
              : "Tippe auf einen Tag, um einzutragen, was du gemacht hast."
          }
        >
          <MonthGrid challenge={challenge} today={today} onSelect={setDay} />
        </Section>
        {activities.length > 0 && (
          <Section title="Aktivitäten">
            <ul aria-label="Aktivitäten nach Häufigkeit">
              {activities.map((activity, index) => (
                <li key={activity.id} className="py-3" style={barIndex(index)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{activity.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatCountNoun(activity.count, "Tag", "Tage")}
                    </span>
                  </div>
                  <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-border">
                    <div
                      className="bar-grow h-full rounded-full bg-foreground"
                      style={{
                        width: `${String((activity.count / (activities[0]?.count ?? 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {status.phase === "ended" && (
          <Button onClick={onRestart}>
            <Dumbbell /> Neue Challenge starten
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => {
            setEnding(true);
          }}
        >
          Challenge beenden
        </Button>
      </div>
      <DayDialog
        challenge={challenge}
        day={day}
        onClose={() => {
          setDay(null);
        }}
      />
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="Challenge beenden?"
        description="Alle eingetragenen Sporttage werden gelöscht. Eine neue Challenge kannst du jederzeit starten."
        error={save.error ? getErrorMessage(save.error, "Beenden fehlgeschlagen.") : null}
        isPending={save.isPending}
        confirmLabel="Beenden"
        pendingLabel="Wird beendet …"
        onConfirm={() => {
          save.mutate(null, {
            onSuccess: () => {
              setEnding(false);
            },
          });
        }}
      />
    </div>
  );
}

function ChallengeHero({
  challenge,
  status,
}: {
  challenge: Challenge;
  status: ChallengeStatus;
}) {
  const monthName = monthNameDe(monthRef(challenge.month).month);
  const stats: KpiStat[] = [
    status.reached
      ? { label: "Bonus", value: BONUS_TEXT, caption: "freigeschaltet" }
      : {
          label: "Noch",
          value: formatCountNoun(status.needed, "Tag", "Tage"),
          caption: "bis zum Bonus",
        },
    status.phase === "ended"
      ? { label: "Übrig", value: "–", caption: "Monat vorbei" }
      : {
          label: "Übrig",
          value: formatCountNoun(status.daysLeft, "Tag", "Tage"),
          caption: status.phase === "upcoming" ? `ab 1. ${monthName}` : `im ${monthName}`,
        },
    {
      label: "Pro Woche",
      value: status.perWeek === null ? "–" : formatPerWeek(status.perWeek),
      caption: `Ziel ${formatPerWeek((status.target * 7) / status.monthDays)}`,
    },
  ];

  return (
    <KpiHero
      label={`Sporttage ${monthTitle(challenge.month)}`}
      value={
        <>
          {status.done}
          <span className="text-muted-foreground"> / {status.target}</span>
        </>
      }
      trend={
        status.course && (
          <Badge variant={courseVariant(status.course)}>
            {courseLabel(status.course)}
          </Badge>
        )
      }
      footer={
        <ProgressBar
          percent={(status.done / status.target) * 100}
          label={`${String(status.done)} von ${String(status.target)} Sporttagen`}
        />
      }
      stats={stats}
    />
  );
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

/**
 * Der Monat als Raster Mo–So. Ein gefüllter Kreis ist ein Sporttag, heute
 * trägt einen Ring; Tage in der Zukunft sind gesperrt.
 */
function MonthGrid({
  challenge,
  today,
  onSelect,
}: {
  challenge: Challenge;
  today: RefDate;
  onSelect: (day: string) => void;
}) {
  const { year, month } = monthRef(challenge.month);
  const days = monthLength(challenge.month);
  // Montag = 0: getDay() zählt ab Sonntag.
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const todayIso = isoDate(today.year, today.month, today.day);

  return (
    <div className="max-w-md">
      <div aria-hidden className="grid grid-cols-7 gap-1 pb-1">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="text-center text-xs text-muted-foreground">
            {weekday}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1" aria-label={`Tage im ${monthNameDe(month)}`}>
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const iso = isoDate(year, month, day);
          const activities = Object.hasOwn(challenge.days, iso)
            ? challenge.days[iso]
            : null;
          const done = activities !== null;
          const editable = canEditDay(challenge, iso, today);
          const isToday = iso === todayIso;
          const label = `${formatWeekdayDate(iso)}: ${
            done
              ? `Sporttag, ${String(activities.length)} Aktivität${activities.length === 1 ? "" : "en"}`
              : "offen"
          }${isToday ? ", heute" : ""}`;
          return (
            <li
              key={iso}
              className="flex justify-center"
              style={index === 0 ? { gridColumnStart: offset + 1 } : undefined}
            >
              <button
                type="button"
                disabled={!editable}
                aria-label={label}
                aria-current={isToday ? "date" : undefined}
                onClick={() => {
                  onSelect(iso);
                }}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full text-sm tabular-nums outline-none pointer-coarse:size-11",
                  "transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
                  done
                    ? "bg-primary font-semibold text-primary-foreground"
                    : editable
                      ? "bg-muted hover:bg-accent"
                      : "text-muted-foreground",
                  isToday &&
                    "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                  !editable && "cursor-default",
                )}
              >
                {day}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Ab der Zielzahl: Der Bonus führt in den Nachkauf, vorbelegt mit dem Betrag.
 * Ob gekauft wurde, weiß die App nicht — deshalb ein bewusster Tipp.
 */
function BonusSection({ challenge, today }: { challenge: Challenge; today: RefDate }) {
  const { mutate: save } = useSaveChallenge();
  const invested = challenge.investedAt;

  return (
    <section
      aria-labelledby="challenge-bonus-title"
      className="flex flex-col gap-4 rounded-2xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Gift className="size-5" aria-hidden />
        </span>
        <div>
          <h2 id="challenge-bonus-title" className="font-semibold">
            {invested
              ? `${BONUS_TEXT} Extra-Invest erledigt`
              : `${BONUS_TEXT} Extra-Invest freigeschaltet`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {invested
              ? `Als investiert markiert am ${formatCalendarDate(invested)}.`
              : "Du hast dein Ziel erreicht. Der Nachkauf zeigt, wohin der Bonus am meisten bringt."}
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:flex sm:shrink-0 sm:justify-end">
        {invested ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              save({ ...challenge, investedAt: null });
            }}
          >
            Rückgängig
          </Button>
        ) : (
          <>
            <Button asChild size="sm">
              <Link to={`/planer?betrag=${String(CHALLENGE_BONUS)}`}>
                Bonus investieren
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                save({
                  ...challenge,
                  investedAt: isoDate(today.year, today.month, today.day),
                });
              }}
            >
              Als investiert markieren
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Start: Monat (dieser oder nächster) und Zielzahl, vorbelegt mit fünf
 * Sporttagen je Woche. Nach dem Start ist die Zielzahl gesperrt.
 */
function StartForm({
  today,
  onStarted,
  onCancel,
}: {
  today: RefDate;
  onStarted: () => void;
  onCancel: (() => void) | undefined;
}) {
  const current = monthKey(today.year, today.month);
  const next = nextMonthKey(current);
  const [month, setMonth] = React.useState<string>(current);
  const days = monthLength(month);
  const [target, setTarget] = React.useState(String(suggestedTarget(days)));
  const save = useSaveChallenge();
  const parsed = Number.parseInt(target, 10);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= days;
  const inputId = React.useId();
  const hintId = React.useId();

  return (
    <Section
      title="Neue Challenge"
      description={`Erreichst du die Zielzahl an Sporttagen, schaltest du einmalig ${BONUS_TEXT} zum Extra-Investieren frei.`}
    >
      <form
        className="mt-4 max-w-md space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          save.mutate(newChallenge(month, parsed), { onSuccess: onStarted });
        }}
      >
        <div className="space-y-1.5">
          {/* Sichtbare Beschriftung; den Namen für Sprachausgaben trägt die
              Optionsgruppe selbst. */}
          <span aria-hidden className="block text-sm font-medium">
            Monat
          </span>
          <SegmentedControl
            label="Monat"
            className="flex w-full"
            options={[
              { value: current, label: monthTitle(current) },
              { value: next, label: monthTitle(next) },
            ]}
            value={month}
            onChange={(value) => {
              setMonth(value);
              setTarget(String(suggestedTarget(monthLength(value))));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>Zielzahl Sporttage</Label>
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={1}
            max={days}
            value={target}
            aria-describedby={hintId}
            aria-invalid={!valid}
            onChange={(event) => {
              setTarget(event.target.value);
            }}
          />
          <p
            id={hintId}
            className={cn("text-sm", valid ? "text-muted-foreground" : "text-negative")}
          >
            {valid
              ? `Vorschlag ${String(suggestedTarget(days))}: fünf Tage je Woche, ab einer Stunde Bewegung.`
              : `Zwischen 1 und ${String(days)} Tagen.`}
          </p>
        </div>
        {save.error && (
          <p role="alert" className="text-sm text-negative">
            {getErrorMessage(save.error, "Starten fehlgeschlagen.")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!valid || save.isPending}>
            <Dumbbell /> Challenge starten
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Abbrechen
            </Button>
          )}
        </div>
      </form>
    </Section>
  );
}
