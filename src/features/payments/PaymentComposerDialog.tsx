import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// Das Formular haengt an Formular-, Waehrungs- und Datenschicht und wiegt
// entsprechend; es laedt erst, wenn der Dialog offen ist.
const PaymentForm = React.lazy(async () => ({
  default: (await import("@/features/payments/PaymentForm")).PaymentForm,
}));

/**
 * Das Erfassungs-Overlay selbst. Eigenes Modul, damit der Dialog (Radix samt
 * Fokusfalle und Scroll-Sperre) nicht im Startpaket liegt — geoeffnet wird er
 * erst auf Klick (siehe `PaymentComposer.tsx`).
 */
export function PaymentComposerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          {open && <PaymentForm onDone={close} onCancel={close} />}
        </React.Suspense>
      </DialogContent>
    </Dialog>
  );
}
