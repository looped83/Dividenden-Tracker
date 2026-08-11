import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, inputMode, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      // Wie beim Input: ohne ausdruecklichen `inputmode` behaelt iOS die
      // Tastatur des zuvor fokussierten Feldes bei (z. B. den Zahlenblock des
      // Betragsfeldes) — siehe input.tsx.
      inputMode={inputMode ?? "text"}
      className={cn(
        // 16 px auf schmalen Geraeten — sonst zoomt iOS Safari beim Fokussieren.
        "flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2",
        "text-base sm:text-sm",
        "placeholder:text-muted-foreground outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
