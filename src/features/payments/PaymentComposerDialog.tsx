import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComposerTarget } from "@/features/payments/PaymentComposer";

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
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ComposerTarget;
}) {
  const close = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Schmal (seit 1.17.0): Asset, Datum und Betrag sind kurze Eingaben.
        // Bei 672px war das Suchfeld ueber 600px lang, Datum und Betrag je
        // rund 300px — die Feldlaenge passte zu keiner erwarteten Eingabe.
        className="max-w-md"
        // Radix fokussiert sonst das erste Feld **und markiert dessen Text** —
        // beim Bearbeiten stand der Assetname blau hinterlegt im Suchfeld, und
        // der erste Tastendruck haette ihn ersetzt. Den Fokus setzt das
        // Formular selbst (`autoFocus` beim Erfassen); bis dahin liegt er auf
        // dem Dialog, damit die Fokusfalle greift.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const content = event.currentTarget as HTMLElement | null;
          const search = content?.querySelector<HTMLElement>("#payment-security");
          (target.paymentId ? content : (search ?? content))?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {target.paymentId ? "Dividende bearbeiten" : "Neue Dividende"}
          </DialogTitle>
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
          {/* Der Inhalt eines geschlossenen Dialogs wird ausgehaengt (nach der
              Ausblendung) — ein geschlossener Dialog laedt also weder
              Stammdaten noch haelt er ein Formular vor. Der Schluessel sorgt
              dafuer, dass ein anderes Ziel ein frisches Formular bekommt. */}
          <PaymentForm
            key={target.paymentId ?? `neu-${target.securityId ?? ""}`}
            id={target.paymentId}
            initialSecurityId={target.securityId}
            onDone={close}
            onCancel={close}
          />
        </React.Suspense>
      </DialogContent>
    </Dialog>
  );
}
