import { cn } from "@/lib/utils/cn";

/**
 * Ladezustand fuer nachgeladene Bereiche.
 *
 * Ein Geruest in der Form des kommenden Inhalts statt einer Textzeile: Die
 * Seite behaelt ihre Hoehe, nichts springt beim Erscheinen des Inhalts, und
 * der Wechsel wirkt kuerzer als er ist. Dieselbe Machart wie die Ladezustaende
 * der Bereiche selbst (Uebersicht, Statistik) — ein Ladezustand soll ueberall
 * gleich aussehen.
 *
 * Die Ansage bleibt hoeflich und kurz; den Namen des Bereichs meldet bereits
 * der RouteAnnouncer.
 */
function Bar({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

export function PageSkeleton({
  className,
  /** Aus, wenn die Kopfzeile schon steht — etwa beim Wechsel eines Reiters. */
  header = true,
}: {
  className?: string;
  header?: boolean;
}) {
  return (
    <div className={cn("space-y-4", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Inhalt wird geladen …</span>
      {/* Hoehe der Kopfzeile (PageHeader): so bleibt der Inhalt an seinem Platz. */}
      {header && (
        <div className="flex min-h-11 items-center">
          <Bar className="h-6 w-40" />
        </div>
      )}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <Bar className="h-4 w-1/3" />
        <Bar className="h-4 w-2/3" />
        <Bar className="h-4 w-1/2" />
      </div>
    </div>
  );
}

/**
 * Gegenstueck fuer die Seiten ausserhalb der App-Huelle (Registrierung,
 * Passwort). Sie stehen mittig auf leerem Grund — das Geruest der App-Seiten
 * saesse dort falsch.
 */
export function AuthPageSkeleton() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-12"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Inhalt wird geladen …</span>
      <div className="w-full max-w-sm space-y-4">
        <p className="text-center text-base font-semibold tracking-tight">
          Dividend Tracker
        </p>
        <div className="space-y-4 rounded-lg border border-border bg-card p-6">
          <Bar className="h-5 w-32" />
          <Bar className="h-10 w-full" />
          <Bar className="h-10 w-full" />
          <Bar className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
