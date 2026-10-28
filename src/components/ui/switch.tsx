import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

interface SwitchProps extends Omit<ComponentProps<"button">, "onClick" | "role"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Ein-/Aus-Schalter für Einstellungen, die sofort gelten (wie in den Apps der
 * Broker). Ein `button` mit `role="switch"`: Sprachausgaben nennen „Ein"/„Aus",
 * Leertaste und Enter schalten. Die Beschriftung kommt von außen
 * (`aria-labelledby` oder `<label htmlFor>`).
 *
 * 44 × 24 px — die Trefferfläche erfüllt WCAG 2.5.8 ohne Aufschlag.
 */
export function Switch({ checked, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        onCheckedChange(!checked);
      }}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
        "outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
