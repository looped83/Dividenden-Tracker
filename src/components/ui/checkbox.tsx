import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
  /** Layoutklassen des Kaestchens (z. B. `mt-0.5`); die Optik ist fest. */
  className?: string;
}

/**
 * Kontrollkaestchen in den Farben des Design-Systems.
 *
 * Bewusst `appearance-none` mit eigenem Haken statt der nativen Darstellung:
 * Das native Kaestchen folgt dem Farbschema des Systems, nicht dem der App —
 * bei „hell" auf einem dunklen System (und umgekehrt) stand es als
 * Fremdkoerper in der Oberflaeche. Der Haken kommt als Symbol darueber, weil
 * ein Hintergrundbild seine Farbe nicht mit dem Theme wechseln koennte.
 *
 * Die Trefferflaeche waechst auf Zeigegeraeten ohne feine Steuerung auf 24px
 * (WCAG 2.5.8).
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <input
        type="checkbox"
        ref={ref}
        className={cn(
          "peer size-4 shrink-0 appearance-none rounded-sm border border-input bg-background",
          "pointer-coarse:size-6 pointer-coarse:rounded-md",
          "outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "checked:border-primary checked:bg-primary",
          "indeterminate:border-primary indeterminate:bg-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        onChange={(event) => {
          onCheckedChange?.(event.target.checked);
          onChange?.(event);
        }}
        {...props}
      />
      <Check
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2",
          "text-primary-foreground opacity-0 pointer-coarse:size-4",
          "peer-checked:opacity-100 peer-indeterminate:opacity-0",
        )}
        strokeWidth={3}
        aria-hidden
      />
      <Minus
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2",
          "text-primary-foreground opacity-0 pointer-coarse:size-4",
          "peer-indeterminate:opacity-100",
        )}
        strokeWidth={3}
        aria-hidden
      />
    </span>
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
