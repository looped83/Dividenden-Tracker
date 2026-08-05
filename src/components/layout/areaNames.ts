/** Bereichsnamen zu den Pfaden der Hauptnavigation (PRODUCT_SPEC.md §4). */
const AREA_NAMES: readonly { prefix: string; name: string; exact?: boolean }[] = [
  { prefix: "/", name: "Übersicht", exact: true },
  { prefix: "/eingaenge/neu", name: "Neue Dividende" },
  { prefix: "/eingaenge/datenqualitaet", name: "Datenqualität" },
  { prefix: "/eingaenge", name: "Dividenden" },
  { prefix: "/depot/entwicklung", name: "Depot, Entwicklung" },
  { prefix: "/depot", name: "Depot" },
  { prefix: "/statistiken/jahre", name: "Statistik, Jahre" },
  { prefix: "/statistiken/monate", name: "Statistik, Monate" },
  { prefix: "/statistiken/breakdown", name: "Statistik, Breakdown" },
  { prefix: "/statistiken/vergleich", name: "Statistik, Vergleich" },
  { prefix: "/statistiken/unternehmen", name: "Statistik, Unternehmen" },
  { prefix: "/statistiken/depots", name: "Statistik, Depotkonten" },
  { prefix: "/statistiken", name: "Statistik" },
  { prefix: "/ziele/bevorstehend", name: "Ziele, bevorstehend" },
  { prefix: "/ziele/beendet", name: "Ziele, beendet" },
  { prefix: "/ziele", name: "Ziele" },
  { prefix: "/einstellungen/depots", name: "Einstellungen, Depotkonten" },
  { prefix: "/einstellungen/importe", name: "Einstellungen, Import" },
  { prefix: "/einstellungen/datensicherung", name: "Einstellungen, Sicherung" },
  { prefix: "/einstellungen", name: "Einstellungen" },
  { prefix: "/mehr", name: "Mehr" },
];

/** Name des Bereichs zu einem Pfad; unbekannte Pfade bleiben ohne Ansage. */
export function areaNameFor(pathname: string): string | null {
  for (const area of AREA_NAMES) {
    if (area.exact ? pathname === area.prefix : pathname.startsWith(area.prefix)) {
      return area.name;
    }
  }
  return null;
}
