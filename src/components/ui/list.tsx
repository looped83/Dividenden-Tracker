import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils/cn";
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
 * Gruppe einer Liste (Monat, „Diese Woche") mit Kennzahl rechts — etwa der
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
 * Inhalt einer Zeile: Titel oben mit der ganzen Breite, darunter die
 * Zusatzangaben links und der Wert rechts. Der Name braucht die Breite — neben
 * dem Betrag brach er auf dem Telefon nach wenigen Zeichen ab; der Betrag
 * steht dafür in einer Spalte mit den Beträgen der Nachbarzeilen.
 *
 * Der Titel bricht höchstens auf zwei Zeilen um. Abgeschnitten nach einer
 * Zeile verlor „… UCITS ETF" genau den Teil, der ihn unterscheidet; ganz
 * ungebremst verlängerte ein einzelner Fondsname die Liste um drei Zeilen.
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
        <span className="line-clamp-2 font-medium [overflow-wrap:anywhere]">{title}</span>
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
