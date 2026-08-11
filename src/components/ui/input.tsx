import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Feldarten ohne eigene Tastatur: Alle anderen (`email`, `date`, `number`,
 * `password` …) bringen ihre Tastatur ueber den `type` mit und bleiben
 * unberuehrt.
 */
const PLAIN_TEXT_TYPES = new Set(["text", "search"]);

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, inputMode, ...props }, ref) => {
    return (
      <input
        type={type}
        // iOS behaelt die Tastatur des zuvor fokussierten Feldes bei, wenn das
        // neu fokussierte Feld keinen eigenen `inputmode` nennt: Nach dem
        // Betragsfeld (`inputMode="decimal"`) blieb im Suchfeld daneben der
        // Zahlenblock stehen. Textfelder sagen deshalb ausdruecklich „text“.
        inputMode={
          inputMode ?? (PLAIN_TEXT_TYPES.has(type ?? "text") ? "text" : undefined)
        }
        ref={ref}
        className={cn(
          // 16 px auf schmalen Geraeten: iOS Safari zoomt beim Fokussieren jedes
          // Feldes, dessen Schrift kleiner ist — und nach dem Zoom laesst sich die
          // Seite seitlich verschieben (UX_AND_DESIGN_SYSTEM.md #1, Skala).
          "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2",
          "text-base sm:text-sm",
          "placeholder:text-muted-foreground outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
