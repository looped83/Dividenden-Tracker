import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useUpdateSecurity } from "@/features/securities/hooks";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * „Dividenden reinvestieren" auf der Seite des Assets: ein Schalter, der
 * sofort speichert — wie die Einstellung beim Broker, die er abbildet. Bis die
 * Antwort da ist, zeigt er den gewaehlten Stand; schlaegt das Speichern fehl,
 * springt er zurueck und eine Meldung sagt es.
 */
export function ReinvestSwitch({
  security,
  disabled = false,
}: {
  security: Security;
  disabled?: boolean;
}) {
  const update = useUpdateSecurity();
  const { notify } = useToast();
  const checked = update.isPending
    ? (update.variables.input.reinvest_dividends ?? security.reinvest_dividends)
    : security.reinvest_dividends;

  return (
    <div className="flex items-center justify-between gap-4">
      <span id="reinvest-label" className="text-sm font-medium">
        Dividenden reinvestieren
      </span>
      <Switch
        aria-labelledby="reinvest-label"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => {
          update.mutate(
            { id: security.id, input: { reinvest_dividends: next } },
            {
              onError: () => {
                notify("Reinvestition konnte nicht gespeichert werden.", "negative");
              },
            },
          );
        }}
      />
    </div>
  );
}
