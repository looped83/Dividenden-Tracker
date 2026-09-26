import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils/cn";

/**
 * Listen (UX_AND_DESIGN_SYSTEM.md §2 `ListGroup`/`ListRow`).
 *
 * **Eine Fläche mit Trennlinien statt einzelner Karten.** Zahlungen, Termine
 * und Tabellenzeilen standen zuvor an vier Stellen in vier Formen: als
 * einzelne Karten mit 12px Abstand, als geteilte Liste, mit dem Datum als
 * Titel. Einzelne Karten kosten je Eintrag zwei Rahmen und eine Lücke — auf
 * dem Telefon passten so sechs Eingänge auf den Bildschirm.
 *
 * Zwei Fassungen, eine Regel: Eine Liste auf der Seite **ist** die Karte
 * (`framed`); eine Liste in einer Karte trägt keinen zweiten Rahmen, sondern
 * rückt um den Innenabstand ihrer Zeilen nach außen, damit Text und Beträge
 * auf der Linie der Kartenüberschrift stehen.
 */
export function ListGroup({
  inset = false,
  className,
  ...props
}: React.ComponentProps<"ul"> & { inset?: boolean }) {
  return (
    <ul
      className={cn(
        "divide-y divide-border",
        inset ? "-mx-3" : "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Überschrift einer gruppierten Liste (Monat, „Diese Woche") samt optionaler
 * Kennzahl rechts — etwa der Monatssumme. Klein und gedämpft: Sie ordnet, sie
 * konkurriert nicht mit den Einträgen.
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
  return (
    <section className={cn("space-y-2", className)}>
      <h2 className="flex items-baseline justify-between gap-3 px-1 text-sm font-semibold text-muted-foreground">
        <span>{title}</span>
        {aside !== undefined && (
          <span className="shrink-0 font-medium tabular-amount">{aside}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

const rowClassName = "flex w-full min-h-11 items-center gap-3 px-3 py-2.5 text-left";

const interactiveRowClassName = cn(
  rowClassName,
  "cursor-pointer outline-none transition-colors hover:bg-accent/50 active:bg-accent",
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
