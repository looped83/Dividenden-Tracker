import * as React from "react";
import { ArrowDown, ArrowUp, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

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
 * **Alle Felder einer Leiste sind gleich breit.** Sie wachsen gemeinsam aus
 * derselben Grundbreite (`basis-40`), sodass die Abstaende zwischen ihnen
 * ueberall dieselben sind — und hoechstens bis 18rem: Ohne diese Grenze zog
 * ein einzelnes Feld, das in eine zweite Zeile gerutscht war, sich auf die
 * ganze Breite und war doppelt so breit wie seine Nachbarn darueber. Was dann
 * an Platz uebrig bleibt, sammelt sich vor dem rechts stehenden Zuruecksetzen
 * ({@link FilterReset}) und trennt so die Filter von der Aktion.
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
    <div className={cn("min-w-0 flex-1 basis-full sm:max-w-72 sm:basis-40", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {children}
    </div>
  );
}

export interface FilterSortOption {
  value: string;
  /** Benennt die Sortierung selbst („Nach Datum") — die Beschriftung ist unsichtbar. */
  label: string;
}

export type FilterSortDirection = "asc" | "desc";

/**
 * Sortierfeld der Filterleisten: Auswahl plus Richtungsschalter, in jeder
 * Leiste dasselbe Feld an derselben Stelle (rechts, vor dem Zuruecksetzen).
 *
 * **Grundbreite und Grenze sind die eines gewoehnlichen Filterfeldes plus
 * Schalter** (jeweils + 2,75rem Schalter + 0,5rem Abstand: `basis-53`,
 * `max-w-85`). Da alle Felder derselben Zeile gleich viel wachsen, ist die
 * Auswahl darin am Ende genauso breit wie ihre Nachbarn — und die Zeile endet
 * buendig. Zuvor stand hier ein `select` in Inhaltsbreite: Rechts blieb ein
 * Rest von rund 30px offen, und die Leiste sah aus, als endete sie zu frueh.
 */
export function FilterSort({
  id,
  value,
  direction,
  options,
  onValueChange,
  onDirectionChange,
  label = "Sortierung",
}: {
  id: string;
  value: string;
  direction: FilterSortDirection;
  options: readonly FilterSortOption[];
  onValueChange: (value: string) => void;
  onDirectionChange: (direction: FilterSortDirection) => void;
  label?: string;
}) {
  return (
    <FilterField id={id} label={label} className="sm:max-w-85 sm:basis-53">
      {/* Engerer Abstand als zwischen den Feldern (0,5rem gegen 0,75rem):
          Auswahl und Richtung sind ein Bedienelement, keine zwei Filter. */}
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Select
            id={id}
            value={value}
            onChange={(event) => {
              onValueChange(event.target.value);
            }}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={
            direction === "asc"
              ? "Aufsteigend sortiert — zu absteigend wechseln"
              : "Absteigend sortiert — zu aufsteigend wechseln"
          }
          onClick={() => {
            onDirectionChange(direction === "asc" ? "desc" : "asc");
          }}
        >
          {direction === "asc" ? <ArrowUp /> : <ArrowDown />}
        </Button>
      </div>
    </FilterField>
  );
}

/**
 * Zuruecksetzen — in jeder Leiste dasselbe Element an derselben Stelle: als
 * letztes, an der rechten Kante.
 *
 * `ml-auto` wirkt nur, wenn die Felder die Zeile nicht ausfuellen — also genau
 * dann, wenn die Schaltflaeche in eine zweite Zeile rutscht (Dividendenliste ab
 * fuenf Feldern). Dort stand sie sonst allein links unter einer vollen Zeile;
 * an der rechten Kante wirkt sie gesetzt statt uebriggeblieben. Auf dem Telefon
 * ist sie so breit wie die Felder darueber.
 */
export function FilterReset({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="w-full sm:ml-auto sm:w-auto"
    >
      <X /> Filter zurücksetzen
    </Button>
  );
}
