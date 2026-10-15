import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils/cn";
import { dateTile } from "@/lib/calendar/format";
import { Section } from "@/components/ui/section";

/**
 * Listen (UX_AND_DESIGN_SYSTEM.md §2 `ListGroup`/`ListRow`).
 *
 * **Eine Fläche mit Trennlinien statt einzelner Karten.** Zahlungen, Termine
 * und Tabellenzeilen standen zuvor an vier Stellen in vier Formen: als
 * einzelne Karten mit 12px Abstand, als geteilte Liste, mit dem Datum als
 * Titel. Einzelne Karten kosten je Eintrag zwei Rahmen und eine Lücke — auf
 * dem Telefon passten so sechs Eingänge auf den Bildschirm.
 *
 * **Ohne Rahmen** (seit 1.9.0, wie die Übersicht): Die Liste rückt um den
 * Innenabstand ihrer Zeilen nach außen, damit Namen und Beträge auf der Linie
 * der Überschrift stehen — auf der Seite wie in einer Karte. Die Trennlinien
 * laufen auf der Linie des Textes, nicht über den Innenabstand hinaus. Früher
 * trug eine Liste auf der Seite einen eigenen Kartenrahmen; zusammen mit den
 * Abschnitten der Übersicht standen damit zwei Formen derselben Sache
 * nebeneinander.
 */
export function ListGroup({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "-mx-3 [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:inset-x-3 [&>li+li]:before:top-0 [&>li+li]:before:h-px [&>li+li]:before:bg-border",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Gruppe einer Liste (Monat) mit Kennzahl rechts — etwa der
 * Monatssumme. Seit 1.9.0 ein gewöhnlicher Abschnitt (`Section`): Überschrift
 * in der Größe der Abschnitte der Übersicht, die Summe gedämpft an der Stelle,
 * an der dort die Aktion steht. Eine eigene, kleinere Stufe ließ die
 * Monatslisten wie eine andere App aussehen. Den Abstand zwischen Gruppen
 * setzt die Seite (40px), wie zwischen Abschnitten.
 */
export function ListSection({
  title,
  aside,
  children,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  // Die Summe steht in der Überschrift: Vorgelesen wird „September 2026
  // erwartet 64,00 €", nicht eine Überschrift und eine lose Zahl daneben.
  return (
    <Section
      className={className}
      title={
        aside === undefined ? (
          title
        ) : (
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">{title}</span>
            <span className="shrink-0 text-[0.9375rem] font-medium tracking-normal text-muted-foreground tabular-amount">
              {aside}
            </span>
          </span>
        )
      }
    >
      {children}
    </Section>
  );
}

const rowClassName = "flex w-full min-h-11 items-center gap-3 px-3 py-2.5 text-left";

const interactiveRowClassName = cn(
  rowClassName,
  "cursor-pointer rounded-xl outline-none transition-colors hover:bg-accent/60 active:bg-accent",
  "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
  "motion-reduce:transition-none",
);

/**
 * Eine Zeile. Mit `asChild` wird das Kind (Link, Schaltfläche) zur ganzen
 * Tippfläche — ein Eintrag ist **eine** Fläche, keine Sammlung kleiner Ziele.
 * `interactive` gibt einer Zeile ohne eigenes Element (Tabellenzeile mit
 * Drill-down) dieselbe Rückmeldung beim Antippen.
 */
export function ListRow({
  asChild = false,
  interactive = asChild,
  className,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean; interactive?: boolean }) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      className={cn(interactive ? interactiveRowClassName : rowClassName, className)}
      {...props}
    />
  );
}

/**
 * Datumsfeld am Anfang einer Zeile: Tag groß, Monat klein darunter — dieselbe
 * Kachel für Termine (Kalender, „Demnächst") und Eingänge (seit 1.11.0). Ein
 * Datum soll überall gleich aussehen.
 *
 * Rein dekorativ (`aria-hidden`): Die Zeile nennt das Datum vollständig in
 * ihrer Bezeichnung oder als Text für Sprachausgaben. Grau wie die übrigen
 * Flächen: Orange markiert Aktionen, nicht Daten.
 */
export function ListDateTile({ iso, muted = false }: { iso: string; muted?: boolean }) {
  const { day, month } = dateTile(iso);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-muted",
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      <span className="text-base font-semibold leading-none tabular-amount">{day}</span>
      <span className="mt-0.5 text-[0.625rem] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
        {month}
      </span>
    </span>
  );
}

/**
 * Inhalt einer Zeile: Titel oben mit der ganzen Breite, darunter die
 * Zusatzangaben links und der Wert rechts. Der Name braucht die Breite — neben
 * dem Betrag brach er auf dem Telefon nach wenigen Zeichen ab; der Betrag
 * steht dafür in einer Spalte mit den Beträgen der Nachbarzeilen.
 *
 * Der Titel bleibt **eine Zeile** und läuft am Ende aus (`truncate-fade`,
 * seit 1.11.0). Zwei Zeilen ließen einzelne Fondsnamen doppelt so hoch
 * stehen wie ihre Nachbarn; die Liste las sich unruhig. Abzeichen
 * („Storniert", „Archiviert") gehören deshalb in die zweite Zeile — im Titel
 * liefen sie mit aus.
 *
 * **Datenlisten tragen keinen Pfeil am Rand** (Eingänge, Termine, Assets,
 * Statistik): Er stand in jeder Zeile, sagte nichts, was die Hover- und
 * Tippfläche nicht schon sagt, und kostete die Breite, in der sonst der Name
 * des Depots stand. `chevron` bleibt einzelnen Navigationszeilen vorbehalten
 * („Gesamt seit März 2019"), die ohne ihn wie bloßer Text aussähen.
 */
export function ListItemBody({
  leading,
  title,
  meta,
  trailing,
  chevron = false,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
}) {
  return (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate-fade font-medium">{title}</span>
        {(meta !== undefined || trailing !== undefined) && (
          <span className="mt-0.5 flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              {meta}
            </span>
            {trailing !== undefined && (
              <span className="shrink-0 font-semibold tabular-amount">{trailing}</span>
            )}
          </span>
        )}
      </span>
      {chevron && (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </>
  );
}
