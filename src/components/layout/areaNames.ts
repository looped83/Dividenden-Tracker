/** Bereichsnamen zu den Pfaden der Hauptnavigation (PRODUCT_SPEC.md §4). */
const AREA_NAMES: readonly { prefix: string; name: string; exact?: boolean }[] = [
  { prefix: "/", name: "Übersicht", exact: true },
  { prefix: "/eingaenge/datenqualitaet", name: "Datenqualität" },
  { prefix: "/eingaenge", name: "Dividenden" },
  { prefix: "/depot/entwicklung", name: "Bestand, Entwicklung" },
  { prefix: "/depot", name: "Bestand" },
  { prefix: "/statistiken/verlauf", name: "Statistiken, Verlauf" },
  { prefix: "/statistiken/vergleich", name: "Statistiken, Vergleich" },
  {
    prefix: "/statistiken/unternehmen",
    name: "Statistiken, Aufteilung nach Assets",
  },
  { prefix: "/statistiken/depots", name: "Statistiken, Aufteilung nach Depots" },
  { prefix: "/statistiken", name: "Statistiken" },
  { prefix: "/ziele/bevorstehend", name: "Ziele, bevorstehend" },
  { prefix: "/ziele/beendet", name: "Ziele, beendet" },
  { prefix: "/ziele", name: "Ziele" },
  { prefix: "/fortschritt", name: "Fortschritt" },
  { prefix: "/einstellungen/depots", name: "Einstellungen, Depots" },
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
