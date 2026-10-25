import * as React from "react";
import { AmountInput } from "@/components/ui/amount-input";
import { cn } from "@/lib/utils/cn";
import { parseGermanNumber } from "@/features/securities/forecastSettings";
import { formatDecimal } from "./format";

/**
 * Eingabefelder des Planers: Schneeball-Annahmen und Nachkauf teilen sich
 * Raster, Zelle und Zahlenfeld.
 */

/**
 * Eingaben als dichtes Raster auf gedaempfter Flaeche (Schneeball: mobil drei
 * Spalten, ab md alle sechs in einer Zeile). `className` setzt die Spalten.
 */
export function SettingsList({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "grid gap-x-3 gap-y-3 rounded-2xl bg-muted p-3 md:px-5 md:py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingCell({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={htmlFor}
        className="mb-1 block truncate text-xs text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Zahlenfeld, das erst beim Verlassen (oder Enter) speichert: Jeder
 * Tastendruck wuerde sonst eine Profilzeile schreiben und den Schneeball neu
 * rechnen, waehrend noch getippt wird. Ein leeres Feld mit Platzhalter steht
 * fuer den Wert aus dem Depot. Werte ueber `max` gelten wie Unsinn als
 * ungueltig und stellen den gespeicherten Wert wieder her.
 */
export function NumberField({
  id,
  label,
  fullLabel,
  value,
  max,
  onCommit,
  suffix,
  placeholder,
}: {
  id: string;
  /** Kurz und sichtbar; `fullLabel` ist der Name fuer Screenreader. */
  label: string;
  fullLabel: string;
  value: number | null;
  max: number;
  onCommit: (value: number | null) => void;
  suffix: string;
  placeholder?: string | undefined;
}) {
  const shown = value === null ? "" : formatDecimal(value);
  const [draft, setDraft] = React.useState(shown);
  // Gespeicherter Wert hat sich geaendert (anderes Geraet, verworfene Eingabe):
  // Entwurf nachziehen — waehrend des Renderns, nicht in einem Effekt.
  const [lastShown, setLastShown] = React.useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    setDraft(shown);
  }

  const commit = () => {
    const parsed = parseGermanNumber(draft);
    if (parsed === undefined || (parsed !== null && parsed > max)) {
      setDraft(shown);
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <SettingCell label={label} htmlFor={id}>
      <div className="relative">
        <AmountInput
          id={id}
          aria-label={fullLabel}
          value={draft}
          placeholder={placeholder}
          className="h-9 bg-background pr-7 text-right tabular-nums"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
        >
          {suffix}
        </span>
      </div>
    </SettingCell>
  );
}
