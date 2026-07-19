import {
  BarChart3,
  Building2,
  FileUp,
  Landmark,
  LayoutDashboard,
  Settings,
  ShieldCheck,
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
 * Hauptnavigation (PRODUCT_SPEC.md §4) — neun Bereiche, kein Kalenderbereich.
 * Einzige Quelle der Navigationsstruktur fuer Sidebar und Bottom-Navigation.
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard },
  { to: "/eingaenge", label: "Dividendeneingänge", icon: Wallet },
  { to: "/unternehmen", label: "Unternehmen", icon: Building2 },
  { to: "/depots", label: "Depots", icon: Landmark },
  { to: "/statistiken", label: "Statistiken", icon: BarChart3 },
  { to: "/importe", label: "Importe", icon: FileUp },
  { to: "/ziele", label: "Ziele", icon: Target },
  { to: "/datensicherung", label: "Datensicherung", icon: ShieldCheck },
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
  findNavItem("/unternehmen"),
  findNavItem("/depots"),
  findNavItem("/importe"),
  findNavItem("/ziele"),
  findNavItem("/datensicherung"),
  findNavItem("/einstellungen"),
];
