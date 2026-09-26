/* eslint-disable react-refresh/only-export-components --
   Anbieter und Hook gehoeren zusammen; die Trennung in zwei Dateien braechte
   nur einen Import mehr. Dieselbe Ausnahme nutzt ToastProvider.tsx. */
import * as React from "react";

// Dialog und Formular haengen an Radix, Formular-, Waehrungs- und Datenschicht
// und wiegen entsprechend. Nachgeladen fallen sie aus dem Startpaket heraus —
// geoeffnet wird das Overlay ohnehin erst auf Klick (ARCHITECTURE.md §6.1).
function loadDialog() {
  return import("@/features/payments/PaymentComposerDialog");
}

const PaymentComposerDialog = React.lazy(async () => ({
  default: (await loadDialog()).PaymentComposerDialog,
}));

/**
 * Holt Dialog und Formular, sobald sich die Absicht zeigt (Zeigen,
 * Fokussieren) — bis zum Klick sind beide dann meist schon da, und das
 * Overlay erscheint ohne Wartezeit. Fehler bleiben still: Der Klick laedt
 * regulaer nach.
 */
function prefetchComposer(): void {
  void loadDialog().catch(() => undefined);
  void import("@/features/payments/PaymentForm").catch(() => undefined);
}

/** Eigenschaften einer Schaltflaeche, die das Overlay oeffnet. */
interface NewPaymentTrigger {
  onClick: () => void;
  onPointerEnter: () => void;
  onFocus: () => void;
}

const ComposerContext = React.createContext<NewPaymentTrigger | null>(null);

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
  // Einmal geoeffnet, bleibt der Dialog eingehaengt: So laeuft beim Schliessen
  // die Ausblendung, und ein zweites Oeffnen braucht kein Nachladen.
  const [requested, setRequested] = React.useState(false);

  const trigger = React.useMemo<NewPaymentTrigger>(
    () => ({
      onClick: () => {
        setRequested(true);
        setOpen(true);
      },
      onPointerEnter: prefetchComposer,
      onFocus: prefetchComposer,
    }),
    [],
  );

  return (
    <ComposerContext.Provider value={trigger}>
      {children}
      {requested && (
        // Ohne Platzhalter: Bis der Dialog geladen ist, vergehen nach dem
        // Vorausladen praktisch null Millisekunden; ein eigener Rahmen davor
        // bliebe hoechstens als Flackern sichtbar.
        <React.Suspense fallback={null}>
          <PaymentComposerDialog open={open} onOpenChange={setOpen} />
        </React.Suspense>
      )}
    </ComposerContext.Provider>
  );
}

/**
 * Eigenschaften fuer die Schaltflaeche „Neue Dividende": oeffnet das Overlay
 * und laedt es beim Zeigen oder Fokussieren vorab. Steht nur innerhalb der
 * App-Hülle zur Verfügung — dort, wo es auch etwas zu überlagern gibt.
 */
export function useNewPaymentTrigger(): NewPaymentTrigger {
  const trigger = React.useContext(ComposerContext);
  if (!trigger) {
    throw new Error("useNewPaymentTrigger benötigt den PaymentComposerProvider.");
  }
  return trigger;
}
