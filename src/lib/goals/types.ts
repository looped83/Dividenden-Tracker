import type { Money, DecimalInstance } from "@/lib/money";

/**
 * Zielarten (Phase 7). Bewusst als geschlossene Union modelliert; die Architektur
 * (DB-Enum, Domain-Schicht, UI) erlaubt spaeter weitere Werte, ohne dass sie jetzt
 * umgesetzt werden.
 */
export type GoalType = "annual" | "monthly";

/**
 * Zieldefinition, wie sie der Nutzer festlegt. Enthaelt ausschliesslich den
 * Vergleichswert — niemals Ist-/Fortschrittsdaten (strikte Trennung Ist/Ziel,
 * Grundsatz 8). Betraege liegen als {@link Money} vor: der Rohstring aus Postgres
 * (`numeric`) wird an der Datengrenze einmal geparst.
 */
export interface Goal {
  id: string;
  goalType: GoalType;
  /** Kalenderjahr des Zielzeitraums. */
  year: number;
  /** Kalendermonat 1..12 bei Monatszielen; null bei Jahreszielen. */
  month: number | null;
  targetAmount: Money;
  currency: string;
  title: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Inklusiver Zielzeitraum als ISO-Kalenderdaten ("YYYY-MM-DD"). */
export interface GoalPeriod {
  start: string;
  end: string;
}

/**
 * Zeitstatus des Zielzeitraums relativ zum Referenztag (rein kalendarisch,
 * unabhaengig vom Fortschritt).
 */
export type TimeStatus = "upcoming" | "current" | "ended";

/**
 * Fachlicher Zielstatus (Auftrag §6). Wird ausschliesslich aus Zeitraum und
 * tatsaechlichem Fortschritt abgeleitet — nie gespeichert.
 * - `upcoming`: Zeitraum hat noch nicht begonnen.
 * - `active`: Zeitraum laeuft, Zielbetrag noch nicht erreicht.
 * - `reached`: tatsaechliche Summe entspricht exakt dem Zielbetrag.
 * - `exceeded`: tatsaechliche Summe uebersteigt den Zielbetrag.
 * - `missed`: Zeitraum vollstaendig vergangen und Zielbetrag nicht erreicht.
 */
export type GoalStatus = "upcoming" | "active" | "reached" | "exceeded" | "missed";

/** Anteiliger Zeitfortschritt des Zielzeitraums (rein beschreibend, keine Prognose). */
export interface TimeProgress {
  status: TimeStatus;
  /** Bereits vergangene Kalendertage (inkl. aktuellem Tag im laufenden Zeitraum). */
  elapsedDays: number;
  /** Gesamtzahl der Kalendertage des Zielzeitraums (Schaltjahr beruecksichtigt). */
  totalDays: number;
  /** Vergangener Zeitanteil in Prozentpunkten (0..100), ungerundet. */
  percent: DecimalInstance;
}

/**
 * Vollstaendig abgeleiteter Zielfortschritt. Einzige Quelle aller in der UI
 * dargestellten Fortschrittswerte — es findet keine Berechnung in Komponenten,
 * Karten, Diagrammen oder Tooltips statt (Auftrag §9).
 */
export interface GoalProgress {
  goal: Goal;
  period: GoalPeriod;
  status: GoalStatus;
  time: TimeProgress;
  target: Money;
  /** Tatsaechlich erhaltene Nettodividenden im Zielzeitraum (gueltige Eingaenge). */
  actual: Money;
  /** Zielerreichung in Prozentpunkten (actual / target × 100), ungerundet. */
  percent: DecimalInstance;
  /** Noch fehlender Betrag (>= 0). Null-Betrag, wenn Ziel erreicht/uebertroffen. */
  remaining: Money;
  /** Ueber den Zielbetrag hinaus erhaltener Betrag (>= 0). Null-Betrag sonst. */
  overshoot: Money;
}
