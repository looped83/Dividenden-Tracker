import * as React from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rueckweg einer Detailseite. Er steht in **jedem** Zustand oben — auch
 * waehrend des Ladens und wenn der Datensatz nicht existiert. Ein Zurueck, das
 * erst nach dem Laden erscheint, ist genau dann nicht da, wenn man es braucht.
 */
export function DetailBackLink({
  to,
  label,
  state,
}: {
  to: string;
  label: string;
  state?: unknown;
}) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
      <Link to={to} state={state}>
        <ArrowLeft aria-hidden /> {label}
      </Link>
    </Button>
  );
}

/**
 * Kopf einer Detailseite (Zahlung, Asset, Ziel) — **einer** fuer alle drei.
 * Zuvor hatte jede Seite ihre eigene Anordnung: Aktionen neben dem Rueckweg,
 * unter dem Titel oder als Schaltflaeche neben der Ueberschrift.
 *
 * Aufbau: Rueckweg links und Symbolaktionen rechts in einer Zeile, darunter
 * Titel samt Zustand, eine Zeile Zusatzangaben und — wo es eine gibt — die
 * Kennzahl des Datensatzes in Kennzahlgroesse. Die Aktionen stehen oben: Unter
 * dem Titel rutschten sie auf dem Telefon in eine eigene Zeile, und der Titel
 * musste sich den Platz mit ihnen teilen.
 */
export function DetailHeader({
  back,
  actions,
  leading,
  title,
  badge,
  subtitle,
  figure,
}: {
  back: React.ReactNode;
  /** Symbolschaltflaechen (`size="icon"`, mit `aria-label`). */
  actions?: React.ReactNode;
  /** Zeichen vor dem Titel, etwa die Zielart. */
  leading?: React.ReactNode;
  title: React.ReactNode;
  /** Zustand neben dem Titel — nur der Sonderfall (storniert, archiviert). */
  badge?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Die Kernaussage des Datensatzes, etwa der Betrag einer Zahlung. */
  figure?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex min-h-11 items-center justify-between gap-2">
        {back}
        {actions !== undefined && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      <div className="flex items-start gap-3">
        {leading}
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-semibold tracking-tight break-words">
            {title}
            {badge}
          </h1>
          {subtitle !== undefined && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {subtitle}
            </div>
          )}
          {figure !== undefined && (
            <div className="mt-2 text-2xl font-semibold tabular-amount">{figure}</div>
          )}
        </div>
      </div>
    </div>
  );
}
