import * as React from "react";
import { Select } from "@/components/ui/select";

/** Ein wählbarer Eintrag — Unternehmen oder Depot. */
export interface EntityOption {
  id: string;
  name: string;
  archived: boolean;
}

interface EntitySelectProps {
  id: string;
  /** Beliebige Reihenfolge; sortiert und gruppiert wird hier. */
  options: readonly EntityOption[];
  /** Leerer String heißt „keine Einschränkung". */
  value: string;
  onChange: (value: string) => void;
  /** Beschriftung der neutralen Auswahl, z. B. „Alle Unternehmen". */
  allLabel: string;
}

/**
 * Auswahlfeld für Unternehmen und Depots.
 *
 * **Warum geteilt:** Dieselbe Liste stand an vier Stellen — Dividendenliste,
 * Unternehmensliste und Statistikfilter — in drei verschiedenen Ausprägungen.
 * Zwei gruppierten nach „Aktiv"/„Archiviert", eine hängte stattdessen
 * „(archiviert)" an den Namen. Der Unterschied war niemandem nützlich; er war
 * nur entstanden. Ein Bedienelement, das an jeder Stelle etwas anders aussieht,
 * kostet bei jeder Begegnung eine Zehntelsekunde Orientierung.
 *
 * **Archivierte bleiben wählbar**, aber gesondert gruppiert: Sie tragen
 * weiterhin Historie, gehören aber nicht zwischen die aktiven Einträge.
 * Existiert keine der beiden Gruppen, entfällt die jeweilige Überschrift —
 * eine Gruppe „Archiviert" ohne Inhalt wäre nur Rauschen.
 *
 * Sortiert wird nach deutschem Alphabet (`localeCompare`), damit Umlaute dort
 * stehen, wo sie erwartet werden.
 */
export function EntitySelect({
  id,
  options,
  value,
  onChange,
  allLabel,
}: EntitySelectProps) {
  const groups = React.useMemo(() => {
    const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name, "de"));
    return {
      active: sorted.filter((option) => !option.archived),
      archived: sorted.filter((option) => option.archived),
    };
  }, [options]);

  return (
    <Select
      id={id}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">{allLabel}</option>
      {groups.active.length > 0 && (
        <optgroup label="Aktiv">
          {groups.active.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </optgroup>
      )}
      {groups.archived.length > 0 && (
        <optgroup label="Archiviert">
          {groups.archived.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}
