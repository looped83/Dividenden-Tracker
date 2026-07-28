import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        // Auf Touchgeraeten groesser, damit die Trefferflaeche WCAG 2.5.8 (24px) erfuellt.
        "peer h-4 w-4 pointer-coarse:h-6 pointer-coarse:w-6 shrink-0 border border-primary ring-offset-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "checked:bg-primary checked:text-primary-foreground",
        "accent-primary",
        className,
      )}
      onChange={(e) => {
        onCheckedChange?.(e.target.checked);
        onChange?.(e);
      }}
      {...props}
    />
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
