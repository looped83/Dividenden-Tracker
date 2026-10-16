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
 * `variant="tabs"` (seit 1.19.0) ist die leiseste Fassung: Textreiter ohne
 * Spur, der gewaehlte unterstrichen — fuer eine Wahl, die wie eine
 * Ueberschrift im Inhalt steht (Diagrammsicht der Uebersicht). Auch sie ist
 * per Pseudo-Element 44px hoch antippbar.
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
  variant?: "default" | "pill" | "tabs";
  className?: string;
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center",
        variant === "tabs" ? "gap-4" : "gap-0.5 rounded-full bg-muted p-0.5",
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
              "inline-flex items-center justify-center gap-1.5 outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              variant === "tabs"
                ? "relative h-6 rounded-sm text-[0.8125rem] font-semibold after:absolute after:-inset-x-2 after:-inset-y-2.5"
                : "flex-1 rounded-full px-3",
              variant === "pill" &&
                "relative h-8 text-[0.8125rem] font-semibold after:absolute after:inset-x-0 after:-inset-y-1.5",
              variant === "default" &&
                "min-h-9 px-4 text-sm font-semibold pointer-coarse:min-h-11",
              variant !== "tabs" && active && "bg-background shadow-sm dark:bg-accent",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-4" aria-hidden />}
            {optionLabel}
            {variant === "tabs" && active && (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
