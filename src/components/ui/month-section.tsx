import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Einklappbare Monate untereinander, durch Linien getrennt — die Form der
 * Dividendenliste auf dem Telefon und der Kalenderliste.
 */
export function MonthSections({ children }: { children: React.ReactNode }) {
  return (
    <div className="[&>section+section]:border-t [&>section+section]:border-border">
      {children}
    </div>
  );
}

/**
 * Ein Monat: Kopfzeile mit Summe und Pfeil, darunter seine Eintraege, solange
 * er offen ist. Die ganze Zeile ist die Schaltflaeche.
 */
export function CollapsibleMonth({
  id,
  title,
  aside,
  open,
  onToggle,
  children,
}: {
  /** Id der aufgeklappten Eintraege, fuer `aria-controls`. */
  id: string;
  title: React.ReactNode;
  aside?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(open && "pb-4")}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={onToggle}
          className="-mx-3 flex min-h-12 w-[calc(100%+1.5rem)] items-center gap-3 rounded-xl px-3 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
        >
          <span className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">
            {title}
          </span>
          {aside !== undefined && (
            <span className="shrink-0 text-[0.9375rem] font-medium text-muted-foreground tabular-amount">
              {aside}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      {open && <div id={id}>{children}</div>}
    </section>
  );
}
