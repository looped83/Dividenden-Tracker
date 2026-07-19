import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/app/theme/ThemeProvider";
import { cn } from "@/lib/utils/cn";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Erscheinungsbild"
      className="inline-flex items-center rounded-md border border-border bg-muted p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={() => {
              setTheme(value);
            }}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-sm outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
