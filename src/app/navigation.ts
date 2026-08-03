import {
  BarChart3,
  Building2,
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
}

/**
 * Hauptnavigation (PRODUCT_SPEC.md §4). Einzige Quelle der
 * Navigationsstruktur fuer Sidebar und Bottom-Navigation.
 *
 * Depots, Importe und Datensicherung stehen nicht mehr hier, sondern als
 * Unterbereiche der Einstellungen (siehe SETTINGS_TABS) — es sind
 * Verwaltungsaufgaben, keine taeglichen Arbeitsbereiche.
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard },
  { to: "/eingaenge", label: "Dividenden", icon: Wallet },
  // Direkt hinter den erfassten Eingaengen: Beide Bereiche beantworten dieselbe
  // Frage entlang der Zeit — was kam an, was ist angekuendigt. Getrennte
  // Datenarten (PRODUCT_SPEC.md Grundsatz 8), benachbarte Wege.
  { to: "/kalender", label: "Kalender", icon: CalendarDays },
  { to: "/unternehmen", label: "Unternehmen", icon: Building2 },
  { to: "/statistiken", label: "Statistiken", icon: BarChart3 },
  { to: "/ziele", label: "Ziele", icon: Target },
  { to: "/einstellungen", label: "Einstellungen", icon: Settings },
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
  findNavItem("/unternehmen"),
  findNavItem("/ziele"),
  findNavItem("/einstellungen"),
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
  { to: "/statistiken/depots", label: "Depots" },
];

/**
 * Unterbereiche der Einstellungen. Die drei Verwaltungsbereiche sind hierher
 * verschoben worden; ihre alten Pfade leiten dauerhaft hierauf um (router.tsx),
 * damit bestehende Links und Lesezeichen weiter funktionieren.
 */
export const SETTINGS_TABS: readonly { to: string; label: string; end?: boolean }[] = [
  { to: "/einstellungen", label: "Allgemein", end: true },
  { to: "/einstellungen/depots", label: "Depots" },
  { to: "/einstellungen/importe", label: "Import" },
  { to: "/einstellungen/datensicherung", label: "Sicherung" },
];
