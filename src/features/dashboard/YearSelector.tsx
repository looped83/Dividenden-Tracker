import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { YearSelection } from "@/lib/statistics";

interface YearSelectorProps {
  selection: YearSelection;
  onSelect: (next: YearSelection) => void;
  /** Vorhandene Jahre der Datenbasis, absteigend (§3). */
  availableYears: number[];
}

/**
 * Kompakte Zeitraumsteuerung (§3): aktuelles Jahr, Vorjahr und „Alle Jahre" als
 * Segment-Buttons, weitere vorhandene Jahre ueber eine Auswahl. Touch-freundlich
 * (44 px Zielgroesse) und mit `aria-pressed` fuer Screenreader.
 */
export function YearSelector({ selection, onSelect, availableYears }: YearSelectorProps) {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const quickYears = [currentYear, previousYear];
  const otherYears = availableYears.filter((year) => !quickYears.includes(year));

  const isActive = (value: YearSelection) => selection === value;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Zeitraum auswählen"
    >
      {quickYears.map((year) => (
        <Button
          key={year}
          type="button"
          size="sm"
          variant={isActive(year) ? "default" : "outline"}
          aria-pressed={isActive(year)}
          onClick={() => {
            onSelect(year);
          }}
        >
          {year}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant={isActive("all") ? "default" : "outline"}
        aria-pressed={isActive("all")}
        onClick={() => {
          onSelect("all");
        }}
      >
        Alle Jahre
      </Button>

      {otherYears.length > 0 && (
        <Select
          aria-label="Weiteres Jahr"
          className="h-9 w-auto"
          value={
            typeof selection === "number" && otherYears.includes(selection)
              ? String(selection)
              : ""
          }
          onChange={(event) => {
            const value = event.target.value;
            if (value) onSelect(Number.parseInt(value, 10));
          }}
        >
          <option value="">Weiteres Jahr …</option>
          {otherYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
