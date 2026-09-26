import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/**
 * Umschalter zwischen wenigen, sich ausschliessenden Zustaenden (Hell/Dunkel/
 * System, Liste/Monat) — **einer** fuer alle. Zuvor gab es zwei Fassungen:
 * eine nur mit Symbolen, deren Bedeutung man erraten musste, eine mit Text.
 *
 * Jedes Segment traegt Symbol und Beschriftung und ist auf Touchgeraeten 44px
 * hoch. Ausgezeichnet als Optionsgruppe (`radiogroup`/`radio`): Es ist genau
 * ein Zustand gewaehlt, und Sprachausgaben nennen, welcher.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Name der Gruppe fuer Screenreader („Erscheinungsbild", „Darstellung"). */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
        className,
      )}
    >
      {options.map(({ value: option, label: optionLabel, icon: Icon }) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              onChange(option);
            }}
            className={cn(
              "inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-sm px-3 text-sm font-medium outline-none",
              "pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden />}
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}
