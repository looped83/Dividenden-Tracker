import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Weist auf eine bereitstehende neue Fassung hin, statt sie stillschweigend
 * zu uebernehmen.
 *
 * Der Service Worker laedt eine neue Fassung im Hintergrund; die offene Seite
 * laeuft solange mit dem alten Stand weiter. Ein stiller Wechsel mitten in
 * einer Erfassung waere bei einer Finanzanwendung die falsche Entscheidung —
 * deshalb entscheidet der Nutzer, wann neu geladen wird.
 *
 * Ohne Service Worker (Entwicklung, aeltere Browser) rendert die Komponente
 * nichts.
 */
export function UpdatePrompt() {
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    const beobachte = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // `installed` bei vorhandenem Controller heisst: Es gab schon eine
          // Fassung, diese hier wartet also auf den Wechsel.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(installing);
          }
        });
      });
    };

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (!cancelled && registration) beobachte(registration);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 flex justify-center px-4 md:bottom-6"
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
        <span className="min-w-0 flex-1">Eine neue Fassung steht bereit.</span>
        <Button
          size="sm"
          onClick={() => {
            // Erst den wartenden Service Worker uebernehmen lassen, dann neu
            // laden — sonst liefe die frische Seite wieder mit der alten
            // Fassung.
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => {
                window.location.reload();
              },
              { once: true },
            );
            waiting.postMessage("SKIP_WAITING");
          }}
        >
          <RefreshCw aria-hidden /> Neu laden
        </Button>
      </div>
    </div>
  );
}
