import * as React from "react";
import {
  buildCompanyNameResolver,
  resolveCompanyNames,
} from "@/lib/calendar/companyNames";
import { useSecurities, useSecurityAliases } from "@/features/securities/hooks";
import { useCalendarEvents } from "./hooks";

/**
 * Die Termine mit angeglichenen Unternehmensnamen (lib/calendar/companyNames.ts)
 * — dieselbe Fassung fuer Kalender und Uebersicht. Gewartet wird auf den
 * Bestand **nicht**: Fehlt er noch oder laesst er sich nicht laden, stehen die
 * Termine mit dem Namen der Quelle da. Eine abweichende Schreibweise ist
 * besser als eine leere Liste.
 */
export function useResolvedCalendarEvents() {
  const eventsQuery = useCalendarEvents();
  const securitiesQuery = useSecurities();
  const aliasesQuery = useSecurityAliases();

  const resolveCompanyName = React.useMemo(
    () =>
      buildCompanyNameResolver(
        (securitiesQuery.data ?? []).map((security) => ({
          id: security.id,
          name: security.name,
          archived: security.archived_at !== null,
        })),
        aliasesQuery.data ?? [],
      ),
    [securitiesQuery.data, aliasesQuery.data],
  );

  const events = React.useMemo(
    () => resolveCompanyNames(eventsQuery.data ?? [], resolveCompanyName),
    [eventsQuery.data, resolveCompanyName],
  );

  return { eventsQuery, events };
}
