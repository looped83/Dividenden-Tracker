import * as React from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackFrom } from "@/lib/hooks/useBackState";

/**
 * Rueckweg einer Detailseite. Er steht in **jedem** Zustand oben — auch
 * waehrend des Ladens und wenn der Datensatz nicht existiert. Ein Zurueck, das
 * erst nach dem Laden erscheint, ist genau dann nicht da, wenn man es braucht.
 *
 * Kam man aus einer Liste, die ihre Adresse als `from` mitgab (`useBackState`),
 * geht der Weg im Verlauf einen Schritt zurueck: Filter, aufgeklappte
 * Abschnitte und Bildlaufposition sind wieder da (seit 2.17.1). Ein neuer
 * Aufruf von `to` begann oben und mit allem eingeklappt. Ohne Herkunft (direkt
 * geoeffnet, neu geladen ohne Verlauf) fuehrt der Link nach `to`.
 * `labels` benennt den Weg je Herkunft (Pfadanfang → Beschriftung, der erste
 * Treffer gilt), etwa „Zu den Fixkosten".
 */
export function DetailBackLink({
  to,
  label,
  labels,
}: {
  to: string;
  label: string;
  labels?: Readonly<Record<string, string>>;
}) {
  const from = useBackFrom();
  const navigate = useNavigate();
  const fromPath = from?.split("?")[0];
  const shown =
    (fromPath !== undefined
      ? Object.entries(labels ?? {}).find(
          ([prefix]) => fromPath === prefix || fromPath.startsWith(`${prefix}/`),
        )?.[1]
      : undefined) ?? label;
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
      <Link
        to={from ?? to}
        onClick={(event) => {
          if (from === undefined || event.metaKey || event.ctrlKey || event.shiftKey)
            return;
          event.preventDefault();
          void navigate(-1);
        }}
      >
        <ArrowLeft aria-hidden /> {shown}
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
 * Titel samt Zustand und eine Zeile Zusatzangaben. Die Kennzahl des Datensatzes
 * steht darunter als `KpiHero` (seit 1.43.0). Die Aktionen stehen oben: Unter
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
        </div>
      </div>
    </div>
  );
}
