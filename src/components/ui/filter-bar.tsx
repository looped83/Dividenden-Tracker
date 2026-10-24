/* eslint-disable react-refresh/only-export-components --
   Die Leiste exportiert neben ihren Bausteinen den Hook, der Schalter und
   Felder verbindet. Beide gehoeren zusammen; dieselbe Ausnahme nutzen
   button.tsx und ThemeProvider.tsx. */
import * as React from "react";
import { ArrowDown, ArrowUp, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

/**
 * Gemeinsame Filterleiste (Statistik, Dividendenliste, Depot). Bewusst ein
 * geteiltes Primitive statt mehrerer Kopien, damit alle Bereiche dieselbe
 * Optik behalten, wenn sich eine davon aendert.
 *
 * **Zwei Teile, ein Zustand** ({@link useFilterDisclosure}): der Schalter
 * ({@link FilterToggle}) und die Felder ({@link FilterBar}). Auf dem Telefon
 * ist die Leiste eingeklappt — ausgeklappt braucht sie den halben ersten
 * Bildschirm, obwohl sie meist unangetastet bleibt. Ihr Schalter steht dann
 * **rechts im Kopf dessen, was er filtert** (Seitenkopf, Abschnittskopf) —
 * dort, wo auf der Uebersicht die Jahresauswahl steht. Die Felder klappen
 * darunter auf. Ab `sm` sind die Felder dauerhaft sichtbar und der Schalter
 * entfaellt. Sie startet immer eingeklappt, auch mit gesetzten Filtern.
 *
 * **Ohne Rahmen, Felder als Pillen** (seit 1.9.0): in der Form der
 * Jahresauswahl. Die Leiste ist ein Werkzeug ueber dem Inhalt, kein eigener
 * Abschnitt. Die Pillenform setzt die Leiste selbst, damit jede Seite dieselbe
 * bekommt, ohne dass die Felder sie einzeln tragen muessen.
 */
export interface FilterDisclosure {
  open: boolean;
  toggle: () => void;
  panelId: string;
  /** Anzahl wirkender Filter (0 = unveraenderte Ansicht). */
  activeCount: number;
}

export function useFilterDisclosure(activeCount: number): FilterDisclosure {
  const panelId = React.useId();
  // Immer eingeklappt, auch wer mit gesetzten Filtern ankommt (Link aus einer
  // Kachel, Lesezeichen, Zurueck-Navigation): Er will das Ergebnis sehen, nicht
  // die Felder. Dass Filter greifen, zeigt die Zahl am Schalter.
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => {
    setOpen((value) => !value);
  }, []);
  return { open, toggle, panelId, activeCount };
}

/**
 * Schalter der Filterleiste — nur auf dem Telefon, als Pille in der Hoehe
 * der Jahresauswahl. Wie viele Filter greifen, steht auch eingeklappt daran.
 */
export function FilterToggle({ disclosure }: { disclosure: FilterDisclosure }) {
  const { open, toggle, panelId, activeCount } = disclosure;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={toggle}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border border-input bg-background pl-4 pr-3 text-sm font-semibold",
        "outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:hidden",
      )}
    >
      <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
      Filter
      {activeCount > 0 && (
        <span className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background">
          {formatCountNumber(activeCount)}
          <span className="sr-only"> aktiv</span>
        </span>
      )}
      <ChevronDown
        className={cn("size-4 text-muted-foreground", open && "rotate-180")}
        aria-hidden
      />
    </button>
  );
}

/**
 * Die Felder der Leiste. Ohne `disclosure` stehen sie immer da — fuer eine
 * Leiste mit einem einzigen Feld (Entwicklung), bei der ein Schalter nur einen
 * Fingertipp mehr kostete.
 */
export function FilterBar({
  disclosure,
  children,
  className,
}: {
  disclosure?: FilterDisclosure;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      id={disclosure?.panelId}
      className={cn(
        "flex-wrap items-center gap-3 sm:flex",
        // Auswahlfelder als Pillen wie die Jahresauswahl der Uebersicht.
        // Rechts knapper als im Formular: Der Pfeil braucht 28px, und paarweise
        // Felder (`half`) fassen so auch „Alle Währungen" bei 390px.
        "[&_select]:rounded-full [&_select]:pl-4 [&_select]:pr-8",
        (disclosure?.open ?? true) ? "flex" : "hidden",
        className,
      )}
    >
      {children}
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
 * Werte wie „Alle Assets" nicht aus; nur kurze Paare stehen nebeneinander
 * (`half`).
 */
export function FilterField({
  id,
  label,
  half = false,
  className,
  children,
}: {
  id: string;
  label: string;
  /**
   * Auf dem Telefon ab 360px halbe Breite, fuer kurze Werte, die paarweise
   * zusammengehoeren (Jahr | Monat, Branche | Waehrung) — wie Jahr und
   * Vergleichsjahr im Vergleich. Spart je Paar eine Zeile der aufgeklappten
   * Leiste; lange Namen (Asset, Depot) bleiben voll breit. Darunter reicht
   * die halbe Breite nicht fuer „Alle Währungen".
   */
  half?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 sm:max-w-72 sm:basis-40",
        half ? "basis-full min-[360px]:basis-[calc(50%-0.375rem)]" : "basis-full",
        className,
      )}
    >
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
  compact = false,
}: {
  id: string;
  value: string;
  direction?: FilterSortDirection;
  options: readonly FilterSortOption[];
  onValueChange: (value: string) => void;
  /**
   * Ohne Handler kein Richtungsschalter: Dann bringt jedes Kriterium seine
   * Richtung selbst mit (Statistiklisten auf dem Telefon, seit 1.24.0).
   */
  onDirectionChange?: (direction: FilterSortDirection) => void;
  label?: string;
  /**
   * In Inhaltsbreite statt in Feldbreite — fuer die Sortierung ueber einer
   * Liste auf dem Telefon, die rechts steht wie die Umschalter der Abschnitte.
   */
  compact?: boolean;
}) {
  return (
    <FilterField
      id={id}
      label={label}
      className={compact ? "flex-none basis-auto" : "sm:max-w-85 sm:basis-53"}
    >
      {/* Engerer Abstand als zwischen den Feldern (0,5rem gegen 0,75rem):
          Auswahl und Richtung sind ein Bedienelement, keine zwei Filter. */}
      <div className="flex gap-2">
        <div className={compact ? "min-w-0" : "min-w-0 flex-1"}>
          <Select
            id={id}
            className={cn("rounded-full pl-4", compact && "w-auto")}
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
        {onDirectionChange && (
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
        )}
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
 *
 * Ab `sm` nur das Symbol (Name fuer Hilfsmittel und als Tooltip): Der Text
 * kostete rund 140px und schob die Dividendenleiste in eine zweite Zeile.
 */
export function FilterReset({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      title="Filter zurücksetzen"
      className="w-full sm:ml-auto sm:w-11 sm:shrink-0 sm:px-0"
    >
      <X aria-hidden />
      <span className="sm:sr-only">Filter zurücksetzen</span>
    </Button>
  );
}
