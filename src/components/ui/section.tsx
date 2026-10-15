import * as React from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
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
 * daneben ragt per negativem Rand nicht darüber hinaus.
 */
export function Section({
  title,
  description,
  action,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("min-w-0", className)} {...props}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h2
          id={id}
          className="text-[1.1875rem] font-bold leading-tight tracking-[-0.015em]"
        >
          {title}
        </h2>
        {action !== undefined && <div className="-my-2 shrink-0">{action}</div>}
      </div>
      {description !== undefined && (
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{description}</p>
      )}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * Textlink im Kopf eines Abschnitts („Alle", „Kalender") — in Primärblau,
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
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-11 items-center gap-0.5 rounded-sm text-[0.9375rem] font-medium text-primary outline-none",
        "hover:underline focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
      <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}
