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
 *
 * Beide Fassungen haben seit 1.9.0 dieselbe Form wie auf der Uebersicht:
 * gedaempfte Spur, der gewaehlte Zustand als helle Pille darueber. Im dunklen
 * Schema liegt die Pille auf der Akzentstufe — schwarz auf grauer Spur laese
 * sie sich als Loch statt als Auswahl (UX_AND_DESIGN_SYSTEM.md §8).
 * `variant="pill"` ist die kompakte Fassung fuer Abschnittskoepfe
 * (Diagrammsicht, Assets/Depots): 32px hoch, die Tippflaeche reicht per
 * Pseudo-Element auf 44px. Die gewoehnliche Fassung ist so hoch wie ein Feld.
 *
 * Beschriftungen brechen nie um (seit 1.42.4): „Je Zahlung“ stand auf schmalen
 * Bildschirmen sonst zweizeilig in der Pille.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = "default",
  className,
}: {
  /** Name der Gruppe fuer Screenreader („Erscheinungsbild", „Darstellung"). */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "default" | "pill";
  className?: string;
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5",
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
              "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              variant === "pill"
                ? "relative h-8 text-[0.8125rem] font-semibold after:absolute after:inset-x-0 after:-inset-y-1.5"
                : "min-h-9 px-4 text-sm font-semibold pointer-coarse:min-h-11",
              active
                ? "bg-background text-foreground shadow-sm dark:bg-accent"
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
