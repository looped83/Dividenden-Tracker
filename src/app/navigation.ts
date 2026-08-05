import {
  BarChart3,
  Briefcase,
  CalendarDays,
  LayoutDashboard,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /**
   * Ein Satzteil, der sagt, was der Bereich beantwortet. Sichtbar in der
   * „Mehr"-Uebersicht des iPhones, wo neben dem Namen Platz dafuer ist —
   * Sidebar und Bottom-Navigation zeigen weiterhin nur die Beschriftung.
   */
  description: string;
}

/**
 * Hauptnavigation (PRODUCT_SPEC.md §4). Einzige Quelle der
 * Navigationsstruktur fuer Sidebar und Bottom-Navigation.
 *
 * Depotkonten, Importe und Datensicherung stehen nicht mehr hier, sondern als
 * Unterbereiche der Einstellungen (siehe SETTINGS_TABS) — es sind
 * Verwaltungsaufgaben, keine taeglichen Arbeitsbereiche.
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  {
    to: "/",
    label: "Übersicht",
    icon: LayoutDashboard,
    description: "Kennzahlen des Jahres",
  },
  {
    to: "/eingaenge",
    label: "Dividenden",
    icon: Wallet,
    description: "Erhaltene Zahlungen erfassen und prüfen",
  },
  // Direkt hinter den erfassten Eingaengen: Beide Bereiche beantworten dieselbe
  // Frage entlang der Zeit — was kam an, was ist angekuendigt. Getrennte
  // Datenarten (PRODUCT_SPEC.md Grundsatz 8), benachbarte Wege.
  {
    to: "/kalender",
    label: "Kalender",
    icon: CalendarDays,
    description: "Angekündigte Zahltage",
  },
  // „Depot" statt „Unternehmen": Der Bereich fuehrt laengst nicht nur
  // Aktiengesellschaften, sondern ebenso ETFs, Fonds und Anleihen — alles, was
  // im Depot liegt. Der alte Name benannte einen Sonderfall als Ganzes.
  {
    to: "/depot",
    label: "Depot",
    icon: Briefcase,
    description: "Assets, Bestände und Entwicklung",
  },
  {
    to: "/statistiken",
    label: "Statistiken",
    icon: BarChart3,
    description: "Jahre, Monate, Vergleiche",
  },
  {
    to: "/ziele",
    label: "Ziele",
    icon: Target,
    description: "Zielbeträge und Fortschritt",
  },
  {
    to: "/einstellungen",
    label: "Einstellungen",
    icon: Settings,
    description: "Depotkonten, Import und Datensicherung",
  },
];

function findNavItem(to: string): NavItem {
  const item = PRIMARY_NAV_ITEMS.find((candidate) => candidate.to === to);
  if (!item) {
    throw new Error(`Unbekannter Navigationseintrag: ${to}`);
  }
  return item;
}

/** iPhone Bottom Navigation (UX_AND_DESIGN_SYSTEM.md #4): drei direkte Slots + "Mehr". */
export const BOTTOM_NAV_PRIMARY_ITEMS: readonly NavItem[] = [
  findNavItem("/"),
  findNavItem("/eingaenge"),
  findNavItem("/statistiken"),
];

/** Hinter "Mehr" zusammengefasste Bereiche der Bottom Navigation. */
export const BOTTOM_NAV_MORE_ITEMS: readonly NavItem[] = [
  findNavItem("/kalender"),
  findNavItem("/depot"),
  findNavItem("/ziele"),
  findNavItem("/einstellungen"),
];

/**
 * Unterbereiche des Depots.
 *
 * **Assets** fuehrt die Stammdaten aller gehaltenen und ehemaligen Papiere,
 * **Entwicklung** stellt der erwarteten Jahresausschuettung des heutigen
 * Bestands gegenueber, was tatsaechlich hereinkam. Die Entwicklung stand
 * frueher in der Statistik; sie ist als einziger Unterbereich dort auf den
 * Depotstaenden aufgebaut statt auf den erfassten Zahlungen
 * (docs/PORTFOLIO_IMPORT.md) und gehoert damit hierher. Ihr alter Pfad leitet
 * dauerhaft hierauf um (router.tsx).
 */
export const DEPOT_TABS: readonly { to: string; label: string; end?: boolean }[] = [
  { to: "/depot", label: "Assets", end: true },
  { to: "/depot/entwicklung", label: "Entwicklung" },
];

/** Unterbereiche der Statistik (PRODUCT_SPEC.md §11). */
export const STATISTICS_TABS: readonly { to: string; label: string; end?: boolean }[] = [
  { to: "/statistiken", label: "Übersicht", end: true },
  { to: "/statistiken/jahre", label: "Jahre" },
  { to: "/statistiken/monate", label: "Monate" },
  // Der Breakdown fuehrt beide Zeitachsen in einer Tabelle zusammen und steht
  // deshalb direkt hinter ihnen. Der Vergleich folgt: Er beantwortet dieselbe
  // zeitliche Frage („laufe ich besser als im Vorjahr?") fuer zwei gewaehlte
  // Zeitraeume und gehoert damit zu den Zeitbereichen, nicht zu den
  // Aufschluesselungen danach.
  { to: "/statistiken/breakdown", label: "Breakdown" },
  { to: "/statistiken/vergleich", label: "Vergleich" },
  { to: "/statistiken/unternehmen", label: "Unternehmen" },
  // „Depotkonten" statt „Depots": Gemeint sind die Konten bei den Brokern, nicht
  // der Bestand — den fuehrt seit der Umbenennung der Bereich „Depot".
  { to: "/statistiken/depots", label: "Depotkonten" },
];

/**
 * Unterbereiche der Einstellungen. Die drei Verwaltungsbereiche sind hierher
 * verschoben worden; ihre alten Pfade leiten dauerhaft hierauf um (router.tsx),
 * damit bestehende Links und Lesezeichen weiter funktionieren.
 */
export const SETTINGS_TABS: readonly { to: string; label: string; end?: boolean }[] = [
  { to: "/einstellungen", label: "Allgemein", end: true },
  // „Depotkonten" statt „Depots": Hier stehen die Konten bei den Brokern. Der
  // Bestand selbst liegt im Bereich „Depot" — gleicher Wortstamm, andere Sache;
  // der Zusatz haelt beide auseinander.
  { to: "/einstellungen/depots", label: "Depotkonten" },
  { to: "/einstellungen/importe", label: "Import" },
  { to: "/einstellungen/datensicherung", label: "Sicherung" },
];
