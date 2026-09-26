import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildIdOf } from "@/lib/config/serviceWorkerBuild";

/**
 * Hoechstens so oft beim Zurueckkehren in die App nach einer neuen Fassung
 * fragen. Eine installierte App bleibt auf dem iPhone oft tagelang im
 * Speicher, ohne neu zu laden — ohne diese Nachfrage bemerkte sie einen Deploy
 * nie. Eine Nachfrage kostet nur das Laden von `sw.js` (wenige Kilobyte).
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Fassung dieser Seite — dieselbe Herleitung wie beim Bauen von `sw.js`. */
function pageBuildId(): string | null {
  const src = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]',
  )?.src;
  return src ? buildIdOf(new URL(src).pathname) : null;
}

/**
 * Fragt einen wartenden Service Worker nach seiner Fassung. `null`, wenn er
 * nicht antwortet — Fassungen vor dieser Aenderung kennen die Frage nicht.
 */
function askBuildId(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      resolve(null);
    }, 3000);
    channel.port1.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timer);
      resolve(typeof event.data === "string" ? event.data : null);
    };
    worker.postMessage("BUILD_ID", [channel.port2]);
  });
}

/**
 * Weist auf eine bereitstehende neue Fassung hin, statt sie stillschweigend
 * zu uebernehmen.
 *
 * Der Service Worker laedt eine neue Fassung im Hintergrund; die offene Seite
 * laeuft solange mit dem alten Stand weiter. Ein stiller Wechsel mitten in
 * einer Erfassung waere bei einer Finanzanwendung die falsche Entscheidung —
 * deshalb entscheidet der Nutzer, wann neu geladen wird.
 *
 * Mit einer Ausnahme: Die Navigation holt immer zuerst das Netz. Wer die App
 * nach einem Deploy frisch oeffnet, hat die neue Fassung also schon vor sich,
 * waehrend der zugehoerige Service Worker noch installiert. Dann gibt es
 * nichts neu zu laden, und der Wechsel geschieht still — ein Hinweis waere
 * hier nur verwirrend.
 *
 * Ohne Service Worker (Entwicklung, aeltere Browser) rendert die Komponente
 * nichts.
 */
export function UpdatePrompt() {
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const abort = new AbortController();
    const { signal } = abort;
    let lastCheck = Date.now();

    const handleWaiting = async (worker: ServiceWorker) => {
      const waitingId = await askBuildId(worker);
      if (signal.aborted) return;
      if (waitingId !== null && waitingId === pageBuildId()) {
        worker.postMessage("SKIP_WAITING");
      } else {
        setWaiting(worker);
      }
    };

    const watchInstalling = (worker: ServiceWorker | null) => {
      worker?.addEventListener(
        "statechange",
        () => {
          // `installed` bei vorhandenem Controller heisst: Es gab schon eine
          // Fassung, diese hier wartet also auf den Wechsel.
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            void handleWaiting(worker);
          }
        },
        { signal },
      );
    };

    // `ready` statt `getRegistration()`: Beim allerersten Besuch registriert
    // main.tsx den Service Worker erst nach dem Laden der Seite.
    void navigator.serviceWorker.ready.then((registration) => {
      if (signal.aborted) return;
      if (registration.waiting && navigator.serviceWorker.controller) {
        void handleWaiting(registration.waiting);
      }
      watchInstalling(registration.installing);
      registration.addEventListener(
        "updatefound",
        () => {
          watchInstalling(registration.installing);
        },
        { signal },
      );
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.visibilityState !== "visible") return;
          if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
          lastCheck = Date.now();
          void registration.update().catch(() => undefined);
        },
        { signal },
      );
    });

    return () => {
      abort.abort();
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
