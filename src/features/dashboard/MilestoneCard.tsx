import * as React from "react";
import { Link } from "react-router";
import { Trophy, X } from "lucide-react";
import { milestoneOverview, type Milestone } from "@/lib/progress";
import { isoDate, type AnalyticsPayment, type RefDate } from "@/lib/statistics";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { reachedText } from "@/features/progress/format";
import { useCelebration } from "@/lib/hooks/useCelebration";
import { cn } from "@/lib/utils/cn";

/**
 * Welcher Meilenstein zuletzt weggeklickt wurde. Eine Ansichtsvorliebe dieses
 * Geräts wie beim Monatsabschluss: Kommt ein neuer hinzu, erscheint die Karte
 * wieder.
 */
const DISMISS_KEY = "dividend-tracker:milestone-dismissed";

/** So lange gilt ein Meilenstein als neu. */
const NEW_DAYS = 30;

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function storeDismissed(key: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, key);
  } catch {
    // Ohne Speicher bleibt die Karte bis zum Neuladen ausgeblendet.
  }
}

function keyOf(milestone: Milestone): string {
  return `${milestone.kind}-${String(milestone.threshold)}-${milestone.reachedOn}`;
}

/** Erster Tag, an dem ein Meilenstein noch als neu gilt. */
function newSince(today: RefDate): string {
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day - NEW_DAYS));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Neuer Meilenstein (seit 2.34.0, CALCULATION_RULES.md §15.2): Was in den
 * letzten 30 Tagen erreicht wurde, steht als gedämpfte Zeile über dem Kopf der
 * Übersicht und führt in den Fortschritt — sonst fiel ein Erfolg nur auf, wer
 * dort nachsah. Mehrere neue nennen den jüngsten und die Anzahl der übrigen.
 */
export function MilestoneCard({
  payments,
  today,
}: {
  payments: AnalyticsPayment[];
  today: RefDate;
}) {
  const [dismissed, setDismissed] = React.useState(readDismissed);
  const fresh = React.useMemo(() => {
    const since = newSince(today);
    return milestoneOverview(payments, today).reached.filter(
      (milestone) => milestone.reachedOn >= since,
    );
  }, [payments, today]);

  const latest = fresh.at(0);
  const celebrate = useCelebration(latest ? `milestone-${keyOf(latest)}` : null);
  if (!latest || dismissed === keyOf(latest)) return null;
  const others = fresh.length - 1;
  const text = reachedText(latest);

  return (
    <section
      aria-label="Neuer Meilenstein"
      className="flex items-center gap-1 rounded-2xl bg-muted p-1.5"
    >
      <Link
        to="/fortschritt"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:px-3.5"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary",
            celebrate && "celebrate-pop",
          )}
        >
          <Trophy className="size-[1.125rem]" />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.9375rem] font-semibold">{text}</span>
          <span className="block truncate text-[0.8125rem] text-muted-foreground">
            Neuer Meilenstein · {formatCalendarDate(latest.reachedOn)}
            {others > 0 && ` · ${formatCountNoun(others, "weiterer", "weitere")}`}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => {
          const key = keyOf(latest);
          setDismissed(key);
          storeDismissed(key);
        }}
        aria-label={`Meilenstein „${text}" ausblenden`}
        className="inline-flex size-9 shrink-0 pointer-coarse:size-11 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <X className="size-4" aria-hidden />
      </button>
    </section>
  );
}
