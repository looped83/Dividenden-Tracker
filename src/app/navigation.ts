import {
  BarChart3,
  Briefcase,
  CalendarDays,
  Compass,
  LayoutDashboard,
  Settings,
  Target,
  Trophy,
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
  /**
   * Beginnt eine neue Gruppe der Seitenleiste (seit 2.20.0): Zahlungen
   * (Dividenden, Kalender, Statistiken), Depot (Bestand, Planer), Motivation
   * (Ziele, Fortschritt). Seit 2.27.0 trennt eine feine Linie die Gruppen —
   * ein bloßer Abstand wirkte wie ein Fehler.
   */
  groupStart?: boolean;
  /** Steht unten am Fuß der Seitenleiste statt in der Liste (Einstellungen). */
  footer?: boolean;
}

/**
 * Hauptnavigation (PRODUCT_SPEC.md §4). Einzige Quelle der
 * Navigationsstruktur fuer Sidebar und Bottom-Navigation.
 *
 * Geordnet nach Themen (seit 2.20.0): erst alles zu den Zahlungen
 * (erhalten, angekuendigt, ausgewertet), dann das Depot (was ist, was waere
 * wenn), dann die Motivation (Ziele, Fortschritt), zuletzt die Verwaltung.
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
    description: "Erhaltene Dividenden erfassen und prüfen",
    groupStart: true,
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
  {
    to: "/statistiken",
    label: "Statistiken",
    icon: BarChart3,
    description: "Jahre, Monate, Vergleiche",
  },
  // „Depot" statt „Unternehmen": Der Bereich fuehrt laengst nicht nur
  // Aktiengesellschaften, sondern ebenso ETFs, Fonds und Anleihen — alles, was
  // im Depot liegt. Der alte Name benannte einen Sonderfall als Ganzes.
  {
    to: "/depot",
    label: "Bestand",
    icon: Briefcase,
    description: "Assets, Bestände und Entwicklung",
    groupStart: true,
  },
  // Direkt hinter dem Bestand: Der zeigt, was ist und was voraussichtlich
  // kommt; der Planer rechnet durch, was ein Kauf oder Sparplan daran aendert.
  {
    to: "/planer",
    label: "Planer",
    icon: Compass,
    description: "Was dein nächster Kauf bringt",
  },
  {
    to: "/ziele",
    label: "Ziele",
    icon: Target,
    description: "Zielbeträge und Zielbilanz",
    groupStart: true,
  },
  // Direkt hinter den Zielen: Beide beantworten, ob es vorangeht — die Ziele
  // gegen selbst gesetzte Beträge, der Fortschritt gegen Fixkosten und
  // Meilensteine.
  {
    to: "/fortschritt",
    label: "Fortschritt",
    icon: Trophy,
    description: "Was deine Dividenden bezahlen",
  },
  {
    to: "/einstellungen",
    label: "Einstellungen",
    icon: Settings,
    description: "Depots, Import und Datensicherung",
    footer: true,
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
  findNavItem("/planer"),
  findNavItem("/ziele"),
  findNavItem("/fortschritt"),
  findNavItem("/einstellungen"),
];

/**
 * Unterbereiche des Depots.
 *
 * **Assets** fuehrt die Stammdaten aller gehaltenen und ehemaligen Papiere,
 * **Entwicklung** stellt der erwarteten Jahresausschuettung des heutigen
 * Bestands gegenueber, was tatsaechlich hereinkam, **Analyse** schluesselt den
 * juengsten Depotstand nach Gattung, Waehrung, Rhythmus, Branche und Region auf, **Prognose**
 * schaetzt die naechsten zwoelf Monate (Monatsluecken und Schneeball seit 2.20.0 im Planer). Die Entwicklung stand
 * frueher in der Statistik; sie ist als einziger Unterbereich dort auf den
 * Depotstaenden aufgebaut statt auf den erfassten Zahlungen
 * (docs/PORTFOLIO_IMPORT.md) und gehoert damit hierher. Ihr alter Pfad leitet
 * dauerhaft hierauf um (router.tsx).
 */
export const DEPOT_TABS: readonly { to: string; label: string; end?: boolean }[] = [
  { to: "/depot", label: "Assets", end: true },
  { to: "/depot/entwicklung", label: "Entwicklung" },
  { to: "/depot/analyse", label: "Analyse" },
  { to: "/depot/prognose", label: "Prognose" },
];

/**
 * Unterbereiche des Planers (seit 2.20.0): **Nachkauf** verteilt einen Betrag
 * auf den Bestand, **Sparplaene** (seit 2.21.0) zeigt die eigenen Sparplaene
 * und was sie bringen, **Optimierungen** (bis 2.26 „Monatslücken") zeigt die schwachen Monate,
 * **Schneeball** rechnet hoch, ab wann Dividenden das Ziel tragen.
 */
export const PLANNER_TABS: readonly { to: string; label: string; end?: boolean }[] = [
  { to: "/planer", label: "Nachkauf", end: true },
  { to: "/planer/sparplaene", label: "Sparpläne" },
  { to: "/planer/luecken", label: "Optimierungen" },
  { to: "/planer/schneeball", label: "Schneeball" },
];

/**
 * Unterbereiche der Statistik (PRODUCT_SPEC.md §11).
 *
 * Vier statt sieben: „Jahre" und „Monate" sind der Reiter „Verlauf" mit einem
 * Umschalter, der „Breakdown" ist als Matrix in die Uebersicht gezogen (dort
 * lag die Heatmap derselben Zahlen), „Unternehmen" und „Depotkonten" sind der
 * Reiter „Aufteilung". Mehr als vier Reiter liefen auf dem Telefon aus dem
 * Bild. Der Vergleich folgt dem Verlauf: Er beantwortet dieselbe zeitliche
 * Frage fuer zwei gewaehlte Zeitraeume.
 */
export const STATISTICS_TABS: readonly {
  to: string;
  label: string;
  end?: boolean;
  also?: readonly string[];
}[] = [
  { to: "/statistiken", label: "Übersicht", end: true },
  { to: "/statistiken/verlauf", label: "Verlauf" },
  { to: "/statistiken/vergleich", label: "Vergleich" },
  // Unternehmen und Depotkonten als **ein** Reiter „Aufteilung" (Umschalter
  // auf der Seite, `BreakdownSwitch`): Beide beantworten dieselbe Frage —
  // woher kommen die Dividenden? Fuenf Reiter passten auf dem Telefon nicht
  // nebeneinander; „Depotkonten" lag unsichtbar rechts ausserhalb.
  { to: "/statistiken/unternehmen", label: "Aufteilung", also: ["/statistiken/depots"] },
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
  { to: "/einstellungen/depots", label: "Depots" },
  { to: "/einstellungen/importe", label: "Import" },
  { to: "/einstellungen/datensicherung", label: "Sicherung" },
];
