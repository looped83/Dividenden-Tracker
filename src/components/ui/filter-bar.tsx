import * as React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatCountNumber } from "@/lib/utils/formatNumber";

/**
 * Gemeinsame Filterleiste (Statistik, Dividendenliste, Unternehmen). Bewusst
 * ein geteiltes Primitive statt mehrerer Kopien, damit alle Bereiche dieselbe
 * Optik behalten, wenn sich eine davon aendert.
 *
 * Auf schmalen Viewports steht die Leiste als eine Zeile da und klappt bei
 * Bedarf auf: Ausgeklappt braucht sie den halben ersten Bildschirm, obwohl sie
 * meist unangetastet bleibt — die Liste ist der Inhalt, der Filter ist das
 * Werkzeug dazu. Wie viele Filter greifen, zeigt die Zeile auch eingeklappt.
 * Ab `sm` ist die Leiste unveraendert dauerhaft sichtbar.
 *
 * @param activeCount Anzahl wirkender Filter (0 = unveraenderte Ansicht).
 */
export function FilterBar({
  children,
  activeCount = 0,
  className,
}: {
  children: React.ReactNode;
  activeCount?: number;
  className?: string;
}) {
  const panelId = React.useId();
  // Wer mit gesetzten Filtern ankommt (Link, Lesezeichen, Zurueck-Navigation),
  // soll sie sehen und nicht erst suchen muessen.
  const [open, setOpen] = React.useState(activeCount > 0);

  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden",
        )}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
          Filter
          {activeCount > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {formatCountNumber(activeCount)} aktiv
            </span>
          )}
        </span>
        <ChevronDown
          className={cn("size-4 text-muted-foreground", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        className={cn(
          "flex-wrap items-center gap-3 p-3 pt-0 sm:flex sm:p-4",
          open ? "flex" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Ein Filterfeld. Die Beschriftung bleibt fuer Screenreader erhalten, ist aber
 * nicht sichtbar: Jedes Feld benennt sich ueber seinen Ausgangswert selbst
 * („Alle Jahre", „Alle Depots" …), eine zusaetzliche Zeile Text darueber
 * verdoppelt nur die Hoehe der Leiste.
 *
 * `min-w-0` ist wesentlich: Ohne das waechst ein `select` auf die Breite seiner
 * laengsten Option (z. B. lange Firmennamen) und sprengt die Zeile. Auf
 * schmalen Viewports steht ein Feld je Zeile — halbe Spalten reichen fuer
 * Werte wie „Alle Unternehmen" nicht aus.
 */
export function FilterField({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 flex-1 basis-full sm:basis-40", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {children}
    </div>
  );
}
