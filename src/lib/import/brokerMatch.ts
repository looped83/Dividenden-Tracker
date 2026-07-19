import { normalizeBrokerName } from "./normalizeName";

/**
 * Broker-/Depot-Abgleich (IMPORT_SPEC.md §9, Task §9). Einfacher als der
 * Unternehmensabgleich: exakte normalisierte Namensuebereinstimmung wird
 * automatisch vorgeschlagen, ein bestehendes Depot bevorzugt. Es werden keine
 * doppelten Depots fuer reine Schreibvarianten erzeugt.
 */

export interface ExistingDepot {
  id: string;
  name: string;
  broker: string | null;
  archived: boolean;
}

export type BrokerMatchReason = "exact_name" | "exact_broker" | "none";

export interface BrokerMatch {
  reason: BrokerMatchReason;
  autoAssignable: boolean;
  depotId: string | null;
  depotName: string | null;
}

export function matchBroker(
  sourceBroker: string,
  existing: ExistingDepot[],
): BrokerMatch {
  const normalized = normalizeBrokerName(sourceBroker);

  const byName = existing.filter((d) => normalizeBrokerName(d.name) === normalized);
  const activeByName = byName.find((d) => !d.archived) ?? byName.at(0);
  if (activeByName) {
    return {
      reason: "exact_name",
      autoAssignable: true,
      depotId: activeByName.id,
      depotName: activeByName.name,
    };
  }

  const byBroker = existing.filter(
    (d) => d.broker && normalizeBrokerName(d.broker) === normalized,
  );
  const activeByBroker = byBroker.find((d) => !d.archived) ?? byBroker.at(0);
  if (activeByBroker) {
    return {
      reason: "exact_broker",
      autoAssignable: true,
      depotId: activeByBroker.id,
      depotName: activeByBroker.name,
    };
  }

  return { reason: "none", autoAssignable: false, depotId: null, depotName: null };
}
