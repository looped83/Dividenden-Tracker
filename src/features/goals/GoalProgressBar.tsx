import type { GoalProgress } from "@/lib/goals";
import { cn } from "@/lib/utils/cn";
import {
  accessibleProgressLabel,
  achievementText,
  cappedBarPercent,
  statusTone,
} from "./format";

interface GoalProgressBarProps {
  progress: GoalProgress;
  className?: string;
}

const trackToneClass: Record<"positive" | "neutral" | "negative", string> = {
  positive: "bg-positive",
  neutral: "bg-primary",
  negative: "bg-negative",
};

/**
 * Zugaengliche Fortschrittsanzeige (Auftrag §19): role="progressbar" mit
 * aktuellem Wert und aussagekraeftigem aria-valuetext (Betrag + Prozent, bei
 * Überschreitung inkl. übertroffenem Betrag). Der Balken ist visuell bei 100 %
 * begrenzt; der tatsaechliche Prozentwert steht zusaetzlich als Text daneben.
 * Die Information funktioniert nicht ausschliesslich ueber Farbe.
 */
export function GoalProgressBar({ progress, className }: GoalProgressBarProps) {
  const barValue = cappedBarPercent(progress.percent);
  const tone = statusTone(progress.status);
  const label = accessibleProgressLabel(progress);

  return (
    <div className={cn("space-y-1", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(barValue)}
        aria-valuetext={label}
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] motion-reduce:transition-none",
            trackToneClass[tone],
          )}
          style={{ width: `${String(barValue)}%` }}
        />
      </div>
      {/* Nur der erreichte Anteil: „Ziel 100 %" am rechten Ende stand unter
          jedem Balken und sagte immer dasselbe. */}
      <p className="text-xs tabular-nums text-muted-foreground">
        {achievementText(progress.percent)}
      </p>
    </div>
  );
}
