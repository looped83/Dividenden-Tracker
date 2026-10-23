import * as React from "react";
import { Button } from "@/components/ui/button";
import { formatCountNumber } from "@/lib/utils/formatNumber";

interface LoadMoreProps {
  /** Bereits gezeigte Einträge — je Schritt beobachtet der Knopf neu. */
  shown: number;
  /** Alle Einträge; ohne Angabe entfällt der Zähler unter dem Knopf. */
  total?: number;
  onLoad: () => void;
  children: React.ReactNode;
}

/**
 * Lange Listen wachsen beim Scrollen (seit 2.3.0, seitenweit statt Blättern):
 * Kommt das Ende in Sicht, hängt die Liste den nächsten Schritt an. Gezeichnet
 * wird nur, was man ansieht — die Daten sind ohnehin geladen, es kostet also
 * keine Abfrage. Der Knopf bleibt als Rückfall stehen (Tastatur, Browser ohne
 * `IntersectionObserver`) und ist zugleich das beobachtete Ziel.
 */
export function LoadMore({ shown, total, onLoad, children }: LoadMoreProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const load = React.useEffectEvent(onLoad);

  // Je Schritt neu angelegt: Bleibt der Knopf nach dem Anhängen in Sicht
  // (kurze Zeilen, hoher Schirm), meldet ein neuer Beobachter ihn sofort
  // wieder — ein bestehender meldete nur einen Wechsel der Sichtbarkeit.
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [shown]);

  return (
    <div className="space-y-2 text-center">
      <Button
        ref={ref}
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        onClick={onLoad}
      >
        {children}
      </Button>
      {total !== undefined && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {formatCountNumber(shown)} von {formatCountNumber(total)} angezeigt
        </p>
      )}
    </div>
  );
}
