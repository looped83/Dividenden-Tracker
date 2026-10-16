import * as React from "react";
import { Link } from "react-router";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Abschnitt ohne Kartenrahmen (UX_AND_DESIGN_SYSTEM.md §2 `Section`, seit 1.7.0):
 * Überschrift 19px, rechts daneben höchstens eine Aktion, darunter optional
 * eine Zeile Beschreibung, dann der Inhalt.
 *
 * Abschnitte trennen sich durch Abstand und Überschrift, nicht durch Rahmen —
 * Rahmen um jeden Block flachen die Rangfolge ab. Den Abstand zwischen
 * Abschnitten setzt die Seite (40px, ab `lg` 48px), nicht der Abschnitt.
 *
 * Die Kopfzeile ist so hoch wie die Überschrift (28px); ein Bedienelement
 * daneben ragt per negativem Rand nicht darüber hinaus. Mit Beschreibung steht
 * es mittig zu Überschrift und Beschreibung.
 */
export function Section({
  title,
  description,
  action,
  actionClassName = "-my-2 shrink-0",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /**
   * Platz der Aktion. Voreinstellung: rechts, so hoch wie die Überschrift.
   * Ein Suchfeld setzt etwa `w-full sm:w-64 sm:-my-3` — auf dem Telefon bricht
   * es dann in eine eigene Zeile unter die Überschrift.
   */
  actionClassName?: string;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("min-w-0", className)} {...props}>
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* Die Beschreibung steht mit der Überschrift in einer Spalte: Eine
            Aktion daneben sitzt so mittig zu beiden Zeilen. Neben der
            Überschrift allein wirkte sie über einer Beschreibung zu hoch. */}
        <div className="min-w-0 flex-1">
          <h2
            id={id}
            className="text-[1.1875rem] font-bold leading-tight tracking-[-0.015em]"
          >
            {title}
          </h2>
          {description !== undefined && (
            <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{description}</p>
          )}
        </div>
        {action !== undefined && (
          // Felder im Kopf (Auswahl, Suche) als Pillen — wie der Umschalter
          // daneben und die Jahresauswahl der Übersicht (seit 1.9.0).
          <div
            className={cn(
              "[&_input]:rounded-full [&_select]:rounded-full [&_select]:pl-4",
              actionClassName,
            )}
          >
            {action}
          </div>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const sectionActionClass = cn(
  "inline-flex min-h-11 items-center gap-0.5 rounded-sm text-[0.9375rem] font-medium text-primary outline-none",
  "hover:underline focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-50",
);

/**
 * Textlink im Kopf eines Abschnitts („Alle", „Kalender") — in der Akzentfarbe,
 * weil er eine Aktion ist. 44px hohe Tippfläche bei 20px Schrift.
 */
export function SectionLink({
  to,
  children,
  className,
}: {
  to: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={cn(sectionActionClass, className)}>
      {children}
      <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}

/**
 * Aktion im Kopf eines Abschnitts, die etwas anlegt oder startet („Neues
 * Depot", „Neuer Import") — dieselbe Form wie {@link SectionLink}, mit dem
 * Symbol vorn statt dem Pfeil hinten. Eine gefüllte Schaltfläche im Kopf jedes
 * Abschnitts war lauter als die Überschrift daneben (seit 1.9.0).
 */
export function SectionButton({
  icon: Icon,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { icon?: LucideIcon }) {
  return (
    <button
      type="button"
      className={cn(sectionActionClass, "gap-1", className)}
      {...props}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </button>
  );
}
