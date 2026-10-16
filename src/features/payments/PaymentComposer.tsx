/* eslint-disable react-refresh/only-export-components --
   Anbieter und Hook gehoeren zusammen; die Trennung in zwei Dateien braechte
   nur einen Import mehr. Dieselbe Ausnahme nutzt ToastProvider.tsx. */
import * as React from "react";
import { Navigate, useParams } from "react-router";

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

/** Was das Overlay zeigt: einen bestehenden Eingang oder einen neuen. */
export interface ComposerTarget {
  /** Gesetzt: diesen Eingang bearbeiten. */
  paymentId?: string | undefined;
  /** Neu erfassen mit vorgewähltem Asset. */
  securityId?: string | undefined;
}

/** Eigenschaften einer Schaltflaeche, die das Overlay oeffnet. */
interface ComposerTrigger {
  onClick: () => void;
  onPointerEnter: () => void;
  onFocus: () => void;
}

const ComposerContext = React.createContext<((target: ComposerTarget) => void) | null>(
  null,
);

/**
 * Erfassen und Bearbeiten als Overlay über der aktuellen Seite.
 *
 * Ein Eingang ist ein Zwischenschritt, keine Reise: Wer aus der Liste, der
 * Übersicht oder dem Kalender heraus erfasst oder korrigiert, will danach
 * genau dort weitermachen. Als eigene Seite ging der Zusammenhang verloren —
 * die Liste dahinter verschwand, und nach dem Speichern landete man
 * unabhängig vom Ausgangspunkt bei den Dividenden. Das Overlay lässt die Seite
 * stehen; nach dem Speichern schließt es sich, und die Zahlen darunter
 * aktualisieren sich von selbst (React Query invalidiert die Abfragen).
 *
 * Auf allen Breiten ein mittiger Dialog über Seite und Bottom-Navigation
 * (`DialogContent`, seit 1.14.0). Die alten Adressen
 * (`/eingaenge/neu`, `/eingaenge/:id/bearbeiten`) öffnen es ebenfalls
 * ({@link PaymentComposerRoute}).
 */
export function PaymentComposerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<ComposerTarget>({});
  // Einmal geoeffnet, bleibt der Dialog eingehaengt: So laeuft beim Schliessen
  // die Ausblendung, und ein zweites Oeffnen braucht kein Nachladen.
  const [requested, setRequested] = React.useState(false);

  const openComposer = React.useCallback((next: ComposerTarget) => {
    setTarget(next);
    setRequested(true);
    setOpen(true);
  }, []);

  return (
    <ComposerContext.Provider value={openComposer}>
      {children}
      {requested && (
        // Ohne Platzhalter: Bis der Dialog geladen ist, vergehen nach dem
        // Vorausladen praktisch null Millisekunden; ein eigener Rahmen davor
        // bliebe hoechstens als Flackern sichtbar.
        <React.Suspense fallback={null}>
          <PaymentComposerDialog open={open} onOpenChange={setOpen} target={target} />
        </React.Suspense>
      )}
    </ComposerContext.Provider>
  );
}

function useOpenComposer(): (target: ComposerTarget) => void {
  const openComposer = React.useContext(ComposerContext);
  if (!openComposer) {
    throw new Error("usePaymentComposer benötigt den PaymentComposerProvider.");
  }
  return openComposer;
}

/**
 * Eigenschaften fuer eine Schaltflaeche, die das Overlay oeffnet — ohne Ziel
 * fuer „Neue Dividende", mit `paymentId` zum Bearbeiten. Laedt beim Zeigen
 * oder Fokussieren vorab. Steht nur innerhalb der App-Hülle zur Verfügung —
 * dort, wo es auch etwas zu überlagern gibt.
 */
export function usePaymentComposer(target: ComposerTarget = {}): ComposerTrigger {
  const openComposer = useOpenComposer();
  const { paymentId, securityId } = target;
  return React.useMemo(
    () => ({
      onClick: () => {
        openComposer({ paymentId, securityId });
      },
      onPointerEnter: prefetchComposer,
      onFocus: prefetchComposer,
    }),
    [openComposer, paymentId, securityId],
  );
}

/**
 * Die alten Adressen des Formulars (`/eingaenge/neu`,
 * `/eingaenge/:id/bearbeiten`) — Lesezeichen, Verlauf, geteilte Links. Sie
 * oeffnen das Overlay über der passenden Seite: der Liste beim Erfassen, dem
 * Eingang beim Bearbeiten.
 */
export function PaymentComposerRoute() {
  const { id } = useParams();
  const openComposer = useOpenComposer();

  React.useEffect(() => {
    openComposer(id ? { paymentId: id } : {});
  }, [openComposer, id]);

  return <Navigate to={id ? `/eingaenge/${id}` : "/eingaenge"} replace />;
}
