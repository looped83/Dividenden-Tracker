import {
  formatMoney,
  formatPercent,
  type Money,
  type DecimalInstance,
} from "@/lib/money";
import { monthNameDe } from "@/lib/statistics";
import type { Goal, GoalProgress, GoalStatus } from "@/lib/goals";

/**
 * Titel eines Ziels, immer automatisch (seit 2.5.1): „Dividendenziel 2027"
 * oder „Dividendenziel März 2027". Eigene Titel und Notizen gibt es nicht
 * mehr — sie wiederholten nur Zeitraum und Zielart; ein gespeicherter Titel
 * aus älteren Fassungen wird nicht mehr gezeigt.
 */
export function goalTitle(goal: Pick<Goal, "goalType" | "year" | "month">): string {
  const year = String(goal.year);
  if (goal.goalType === "monthly" && goal.month !== null) {
    return `Dividendenziel ${monthNameDe(goal.month)} ${year}`;
  }
  return `Dividendenziel ${year}`;
}

/** Zeitraumbeschriftung, z. B. „Jahr 2027" oder „März 2027". */
export function periodLabel(goal: Pick<Goal, "goalType" | "year" | "month">): string {
  const year = String(goal.year);
  if (goal.goalType === "monthly" && goal.month !== null) {
    return `${monthNameDe(goal.month)} ${year}`;
  }
  return `Jahr ${year}`;
}

/** Kurzbezeichnung der Zielart. */
export function goalTypeLabel(goalType: Goal["goalType"]): string {
  return goalType === "monthly" ? "Monatsziel" : "Jahresziel";
}

/**
 * Beginn-Hinweis fuer bevorstehende Ziele (Auftrag §16), z. B. „Beginnt am
 * 01.01.2028" oder „Beginnt am 01.11.2026". Als Datum auch beim Monatsziel:
 * „Beginnt im November 2026" unter „Monatsziel November 2026" wiederholte nur
 * den Titel.
 */
export function startsAtLabel(goal: Pick<Goal, "goalType" | "year" | "month">): string {
  const month = goal.goalType === "monthly" && goal.month !== null ? goal.month : 1;
  return `Beginnt am 01.${String(month).padStart(2, "0")}.${String(goal.year)}`;
}

const STATUS_LABELS: Record<GoalStatus, string> = {
  upcoming: "Bevorstehend",
  active: "Aktiv",
  reached: "Erreicht",
  exceeded: "Übertroffen",
  missed: "Nicht erreicht",
};

export function statusLabel(status: GoalStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Semantische Farbklasse je Status. Farbe ist nie die alleinige Information —
 * es gibt stets ein Text-Label daneben (Accessibility, Auftrag §35).
 */
export function statusTone(status: GoalStatus): "positive" | "neutral" | "negative" {
  switch (status) {
    case "reached":
    case "exceeded":
      return "positive";
    case "missed":
      return "negative";
    default:
      return "neutral";
  }
}

/** Prozenttext der Zielerreichung, auch ueber 100 %. */
export function achievementText(percent: DecimalInstance): string {
  return formatPercent(percent, 1);
}

/**
 * Zugaengliche Beschriftung der Fortschrittsanzeige (Auftrag §19), z. B.
 * „9.000,00 € von 12.000,00 € erreicht, entsprechend 75,0 %". Bei Überschreitung
 * wird der übertroffene Betrag ergänzt.
 */
export function accessibleProgressLabel(progress: GoalProgress): string {
  const base = `${formatMoney(progress.actual)} von ${formatMoney(progress.target)} erreicht, entsprechend ${achievementText(progress.percent)}`;
  if (progress.status === "exceeded") {
    return `${base}; Ziel um ${formatMoney(progress.overshoot)} übertroffen`;
  }
  return base;
}

/** Neutraler Zeitfortschritt-Text (Auftrag §12), rein beschreibend, keine Prognose. */
export function timeProgressText(progress: GoalProgress): string {
  const percentText = formatPercent(progress.time.percent, 0);
  const unit = progress.goal.goalType === "monthly" ? "des Monats" : "des Jahres";
  return `${percentText} ${unit} vergangen`;
}

/**
 * Drill-down zu den Dividendeneingängen des Zielzeitraums (Auftrag §24). Der
 * Zielzeitraum wird über die bereits vorhandenen Jahres-/Monatsfilter der
 * Eingangsliste abgebildet; deren Summe (aktive Eingänge, effektives Datum)
 * stimmt exakt mit dem Ziel-Fortschritt überein.
 */
export function drillDownHref(goal: Pick<Goal, "goalType" | "year" | "month">): string {
  const params = new URLSearchParams({ year: String(goal.year) });
  if (goal.goalType === "monthly" && goal.month !== null) {
    params.set("month", String(goal.month));
  }
  return `/eingaenge?${params.toString()}`;
}

/** Der ungerundete Prozentwert, visuell auf 0..100 begrenzt (Auftrag §10/§19). */
export function cappedBarPercent(percent: DecimalInstance): number {
  const value = percent.toNumber();
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 100 ? 100 : value;
}

/** Formatierter Geldbetrag (fuer Karten/Detailansicht). */
export function money(amount: Money): string {
  return formatMoney(amount);
}
