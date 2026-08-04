import { useLocation, useNavigate, useParams } from "react-router";
import { PaymentForm } from "@/features/payments/PaymentForm";

/**
 * Das Formular als eigene Seite (`/eingaenge/neu`,
 * `/eingaenge/:id/bearbeiten`).
 *
 * Auf dem Telefon ist das der Weg: Ein Formular mit sechs Feldern in einem
 * Dialog ueber einer Seite, die man ohnehin nicht sieht, gewinnt dort nichts.
 * Auf breiten Schirmen oeffnet dieselbe Aktion ein Overlay ueber der aktuellen
 * Seite ({@link PaymentComposerProvider}) — die Liste dahinter bleibt stehen.
 * Beide Wege teilen sich {@link PaymentForm}.
 *
 * **Abbrechen fuehrt dorthin zurueck, wo man herkam.** Zuvor landete man immer
 * bei den Dividenden — auch wenn man aus der Uebersicht oder dem Kalender kam.
 * Ein ausdruecklich mitgegebenes Ziel (`state.from`, etwa aus der Zeile einer
 * Liste) hat Vorrang; sonst geht es einen Schritt in der Chronik zurueck. Nur
 * wenn diese Seite der Einstieg war (Direktlink, `location.key === "default"`),
 * bleibt die Liste als Ziel — ein Schritt zurueck fuehrte sonst aus der App.
 */
export function NewPaymentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const leave = () => {
    if (from) void navigate(from);
    else if (location.key !== "default") void navigate(-1);
    else void navigate("/eingaenge");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {id ? "Dividende bearbeiten" : "Neue Dividende"}
      </h1>
      <PaymentForm
        id={id}
        onDone={() => {
          void navigate(from ?? "/eingaenge");
        }}
        onCancel={leave}
      />
    </div>
  );
}
