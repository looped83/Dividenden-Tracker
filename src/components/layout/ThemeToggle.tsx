import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/app/theme/ThemeProvider";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented";

const OPTIONS: readonly SegmentOption<Theme>[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Wahl des Erscheinungsbilds. Mit Beschriftung statt nur Symbolen: Ein
 * Bildschirm fuer „System" ist nicht selbsterklaerend, und die Einstellung
 * wird selten genug besucht, dass man es sich nicht merkt.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      label="Erscheinungsbild"
      options={OPTIONS}
      value={theme}
      onChange={setTheme}
    />
  );
}
