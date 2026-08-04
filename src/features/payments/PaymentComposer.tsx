/* eslint-disable react-refresh/only-export-components --
   Anbieter und Hook gehoeren zusammen; die Trennung in zwei Dateien braechte
   nur einen Import mehr. Dieselbe Ausnahme nutzt ToastProvider.tsx. */
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// Das Formular haengt an Formular-, Waehrungs- und Datenschicht und wiegt
// entsprechend. Nachgeladen faellt es aus dem Startpaket heraus — geoeffnet
// wird es ohnehin erst auf Klick (ARCHITECTURE.md §6.1).
const PaymentForm = React.lazy(async () => ({
  default: (await import("@/features/payments/PaymentForm")).PaymentForm,
}));

const ComposerContext = React.createContext<(() => void) | null>(null);

/**
 * Öffnet das Erfassungsformular als Overlay über der aktuellen Seite.
 *
 * Auf breiten Schirmen ist „Neue Dividende" ein Zwischenschritt, keine Reise:
 * Wer aus der Liste, der Übersicht oder dem Kalender heraus erfasst, will
 * danach genau dort weitermachen. Als eigene Seite ging der Zusammenhang
 * verloren — die Liste dahinter verschwand, und nach dem Speichern landete man
 * unabhängig vom Ausgangspunkt bei den Dividenden. Das Overlay lässt die Seite
 * stehen; nach dem Speichern schließt es sich, und die Zahlen darunter
 * aktualisieren sich von selbst (React Query invalidiert die Abfragen).
 *
 * Auf dem Telefon bleibt es bei der eigenen Seite ({@link NewPaymentPage}):
 * Dort deckt ein Dialog den Bildschirm ohnehin vollständig ab, und die
 * Bottom-Navigation führt mit einem Fingertipp dorthin.
 */
export function PaymentComposerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const openComposer = React.useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <ComposerContext.Provider value={openComposer}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Neue Dividende</DialogTitle>
          </DialogHeader>
          <React.Suspense
            fallback={
              <div className="space-y-4" aria-busy="true">
                <span className="sr-only">Formular wird geladen …</span>
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-2/3" />
              </div>
            }
          >
            {/* Erst beim Öffnen einhängen: Ein geschlossener Dialog soll weder
                Stammdaten laden noch ein Formular vorhalten. */}
            {open && (
              <PaymentForm
                onDone={() => {
                  setOpen(false);
                }}
                onCancel={() => {
                  setOpen(false);
                }}
              />
            )}
          </React.Suspense>
        </DialogContent>
      </Dialog>
    </ComposerContext.Provider>
  );
}

/**
 * Öffnet das Overlay. Steht nur innerhalb der App-Hülle zur Verfügung — dort,
 * wo es auch etwas zu überlagern gibt.
 */
export function useNewPayment(): () => void {
  const open = React.useContext(ComposerContext);
  if (!open) {
    throw new Error("useNewPayment benötigt den PaymentComposerProvider.");
  }
  return open;
}
