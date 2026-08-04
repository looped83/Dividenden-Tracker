/* eslint-disable react-refresh/only-export-components --
   Anbieter und Hook gehoeren zusammen; die Trennung in zwei Dateien braechte
   nur einen Import mehr. Dieselbe Ausnahme nutzt ThemeProvider.tsx. */
import * as React from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastTone = "positive" | "negative";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  /** Kurze Bestaetigung einer abgeschlossenen Aktion. */
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 4000;

/**
 * Kurze Rueckmeldungen nach abgeschlossenen Aktionen (UX_AND_DESIGN_SYSTEM.md
 * #2 „Toast"). Bewusst ohne zusaetzliche Abhaengigkeit: Ein paar Zeilen
 * Zustand, ein `role="status"`-Bereich und eine Zeitschaltung genuegen.
 *
 * Regeln, die daraus folgen:
 * - Nur Bestaetigungen und beilaeufige Fehler. Alles, wofuer der Nutzer eine
 *   Entscheidung treffen muss, gehoert weiterhin in einen Dialog oder neben
 *   das Feld — ein Hinweis, der von selbst verschwindet, darf nichts
 *   Wichtiges allein tragen.
 * - Der Bereich meldet sich hoeflich (`aria-live="polite"`), unterbricht also
 *   keine Vorlesung.
 * - Ueber der Bottom-Navigation und innerhalb der sicheren Flaeche des
 *   iPhones.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = React.useCallback(
    (message: string, tone: ToastTone = "positive") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => {
        dismiss(id);
      }, VISIBLE_MS);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4",
          "bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-6",
        )}
      >
        {toasts.map((toast) => {
          const positive = toast.tone === "positive";
          const Icon = positive ? CheckCircle2 : CircleAlert;
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg py-2.5 pl-3 pr-2",
                // Farbiger Streifen an der Kante, getoenter Grund, kraeftiger
                // Schatten: Die frueheren Toasts unterschieden sich nur durch
                // einen duennen Rahmen vom Hintergrund und gingen zwischen
                // Karten unter — eine Rueckmeldung, die niemand bemerkt, ist
                // keine.
                "border border-l-4 shadow-lg",
                "text-sm text-foreground",
                // Im dunklen Thema traegt derselbe Tint weniger: Der Grund ist
                // dort ohnehin dunkel, 10 % Farbe darauf sind kaum zu sehen.
                positive
                  ? "border-positive/30 border-l-positive bg-positive/10 dark:bg-positive/15"
                  : "border-negative/30 border-l-negative bg-negative/10 dark:bg-negative/15",
                // Kurz eingeblendet statt uebergangslos gesetzt — die Bewegung
                // ist es, die den Blick holt. `prefers-reduced-motion` schaltet
                // sie ab (tw-animate-css).
                "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200",
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  positive ? "text-positive" : "text-negative",
                )}
                aria-hidden
              />
              {/* Alles mittig in einer Zeile: Zuvor stand der Text oben
                  (`items-start`), waehrend die 32px hohe Schliessen-Schaltflaeche
                  die Kachel hoeher machte — darunter blieb sichtbar Luft. */}
              <span className="min-w-0 flex-1 font-medium">{toast.message}</span>
              <button
                type="button"
                aria-label="Hinweis schließen"
                onClick={() => {
                  dismiss(toast.id);
                }}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  "text-muted-foreground outline-none transition-colors",
                  "hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Meldet kurze Bestaetigungen; ausserhalb des Anbieters ein No-Op-Fehler. */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast muss innerhalb von <ToastProvider> verwendet werden.");
  }
  return context;
}
