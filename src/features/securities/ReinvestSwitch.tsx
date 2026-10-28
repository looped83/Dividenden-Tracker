import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useUpdateSecurity } from "@/features/securities/hooks";
import { useToday } from "@/lib/hooks/useToday";
import { isoFromRef } from "@/lib/statistics";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import type { Security } from "@/lib/supabase/repositories/securities";

/**
 * „Dividenden reinvestieren" auf der Seite des Assets: ein Schalter, der
 * sofort speichert — wie die Einstellung beim Broker, die er abbildet.
 * Einschalten merkt sich den heutigen Tag (`reinvest_since`): Erst Zahlungen
 * ab dann zaehlen als reinvestiert. Bis die Antwort da ist, zeigt er den
 * gewaehlten Stand; schlaegt das Speichern fehl, springt er zurueck und eine
 * Meldung sagt es.
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
  const today = useToday();
  const since = update.isPending
    ? (update.variables.input.reinvest_since ?? null)
    : security.reinvest_since;

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <span id="reinvest-label" className="block text-sm font-medium">
          Dividenden reinvestieren
        </span>
        {since && (
          <span className="block text-sm text-muted-foreground">
            seit {formatCalendarDate(since)}
          </span>
        )}
      </span>
      <Switch
        aria-labelledby="reinvest-label"
        checked={since !== null}
        disabled={disabled}
        onCheckedChange={(next) => {
          update.mutate(
            {
              id: security.id,
              input: { reinvest_since: next ? isoFromRef(today) : null },
            },
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
