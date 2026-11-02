import { isoDate, lastDayOfMonth, type RefDate } from "@/lib/statistics/dates";

/**
 * Sport-Challenge (CALCULATION_RULES.md §18): ein Kalendermonat, eine
 * Zielzahl Sporttage. Wer sie erreicht, schaltet einmalig einen festen Betrag
 * zum Extra-Investieren frei. Gespeichert ist nur die Challenge selbst
 * (`profiles.sport_challenge`, Migration 0049); gerechnet wird beim Anzeigen.
 */

/** Fester Bonus in Euro (Lutz, 2026-11-02: „erst mal 100 € fest“). */
export const CHALLENGE_BONUS = 100;

/** Sporttage pro Woche, aus denen die vorgeschlagene Zielzahl folgt. */
const DAYS_PER_WEEK = 5;

export const ACTIVITIES = [
  { id: "spinning", label: "Spinning" },
  { id: "joggen", label: "Joggen" },
  { id: "kraft", label: "Krafttraining" },
  { id: "jumping", label: "Jumping-Fitness" },
  { id: "cardio", label: "Cardio" },
  { id: "crosstrainer", label: "Crosstrainer" },
  { id: "yoga", label: "Yoga" },
  { id: "rad", label: "Radfahren" },
] as const;

export type ActivityId = (typeof ACTIVITIES)[number]["id"];

const ACTIVITY_IDS: ReadonlySet<string> = new Set(
  ACTIVITIES.map((activity) => activity.id),
);

function isActivityId(value: unknown): value is ActivityId {
  return typeof value === "string" && ACTIVITY_IDS.has(value);
}

export interface Challenge {
  /** Kalendermonat als `JJJJ-MM`. */
  month: string;
  /** Zielzahl Sporttage, beim Start festgelegt und danach gesperrt. */
  target: number;
  /** Aktivitäten je Tag (ISO-Datum); ein Tag mit Eintrag ist ein Sporttag. */
  days: Readonly<Record<string, readonly ActivityId[]>>;
  /** Wann der Bonus als investiert markiert wurde (ISO-Datum). */
  investedAt: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Liest die gespeicherte Challenge. Unbekannte Aktivitäten (ältere Fassung,
 * Handeingriff) fallen weg, Tage außerhalb des Monats ebenso.
 *
 * Von Hand statt mit zod: Der Schnell-Tipp der Übersicht liest die Challenge,
 * und die Übersicht gehört zum Start-Bundle — zod läge sonst mit rund 30 kB
 * im ersten Aufruf.
 */
export function parseChallenge(raw: unknown): Challenge | null {
  if (!isRecord(raw)) return null;
  const { month, target, days: rawDays, investedAt } = raw;
  if (typeof month !== "string" || !MONTH.test(month)) return null;
  if (typeof target !== "number" || !Number.isInteger(target) || target < 1) return null;
  const days: Record<string, ActivityId[]> = {};
  if (isRecord(rawDays)) {
    for (const [day, activities] of Object.entries(rawDays)) {
      if (!ISO_DAY.test(day) || !day.startsWith(`${month}-`)) continue;
      if (!Array.isArray(activities)) continue;
      const unique = [...new Set(activities.filter(isActivityId))];
      if (unique.length > 0) days[day] = unique;
    }
  }
  return {
    month,
    target: Math.min(target, monthLength(month)),
    days,
    investedAt:
      typeof investedAt === "string" && ISO_DAY.test(investedAt) ? investedAt : null,
  };
}

/** Speicherform; `null` beendet die Challenge. */
export function toStoredChallenge(challenge: Challenge | null) {
  if (!challenge) return null;
  return {
    month: challenge.month,
    target: challenge.target,
    days: Object.fromEntries(
      Object.entries(challenge.days).map(([day, activities]) => [day, [...activities]]),
    ),
    investedAt: challenge.investedAt,
  };
}

export function monthKey(year: number, month: number): string {
  return `${String(year)}-${String(month).padStart(2, "0")}`;
}

export function monthRef(key: string): { year: number; month: number } {
  return {
    year: Number.parseInt(key.slice(0, 4), 10),
    month: Number.parseInt(key.slice(5, 7), 10),
  };
}

export function monthLength(key: string): number {
  const { year, month } = monthRef(key);
  return lastDayOfMonth(year, month);
}

/** Folgemonat als `JJJJ-MM`. */
export function nextMonthKey(key: string): string {
  const { year, month } = monthRef(key);
  return month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
}

/** Vorschlag: fünf Sporttage je Woche, auf ganze Tage gerundet (31 → 22). */
export function suggestedTarget(days: number): number {
  return Math.round((days * DAYS_PER_WEEK) / 7);
}

/** Neue Challenge für einen Monat. */
export function newChallenge(month: string, target: number): Challenge {
  return { month, target, days: {}, investedAt: null };
}

/**
 * Bis wann sich Tage nachtragen lassen: alle vergangenen Tage des Monats und
 * heute, nach Monatsende noch am 1. des Folgemonats — wer am 31. abends
 * vergessen hat einzutragen, verliert den Tag nicht.
 */
export function canEditDay(challenge: Challenge, day: string, today: RefDate): boolean {
  if (!day.startsWith(`${challenge.month}-`)) return false;
  const todayIso = isoDate(today.year, today.month, today.day);
  if (day > todayIso) return false;
  const current = monthKey(today.year, today.month);
  if (current === challenge.month) return true;
  return current === nextMonthKey(challenge.month) && today.day === 1;
}

/** Schaltet eine Aktivität an einem Tag um; ein leerer Tag fällt weg. */
export function toggleActivity(
  challenge: Challenge,
  day: string,
  activity: ActivityId,
): Challenge {
  const current = challenge.days[day] ?? [];
  const next = current.includes(activity)
    ? current.filter((id) => id !== activity)
    : [...current, activity];
  const others = Object.entries(challenge.days).filter(([key]) => key !== day);
  const days = Object.fromEntries(next.length > 0 ? [...others, [day, next]] : others);
  return { ...challenge, days };
}

export type ChallengePhase = "upcoming" | "active" | "ended";

/**
 * Einordnung wie bei den Zielen (§13): „Im Plan", „Knapp", „Unter Plan" —
 * dazu „Geschafft" ab der Zielzahl und „Nicht erreicht", wenn die Zielzahl
 * nicht mehr zu schaffen ist oder der Monat ohne sie endete.
 */
export type ChallengeCourse = "reached" | "onTrack" | "close" | "behind" | "missed";

export interface ChallengeStatus {
  phase: ChallengePhase;
  /** Tage im Monat. */
  monthDays: number;
  /** Bisherige Sporttage. */
  done: number;
  target: number;
  /** Fehlende Sporttage bis zum Ziel (0, wenn erreicht). */
  needed: number;
  /** Ab heute noch verfügbare Tage im Monat, heute eingeschlossen. */
  daysLeft: number;
  reached: boolean;
  /** `null` vor dem Start. */
  course: ChallengeCourse | null;
  /** Sporttage je Woche bisher; `null` vor dem Start. */
  perWeek: number | null;
}

export function challengeStatus(challenge: Challenge, today: RefDate): ChallengeStatus {
  const monthDays = monthLength(challenge.month);
  const done = Object.keys(challenge.days).length;
  const target = challenge.target;
  const needed = Math.max(0, target - done);
  const reached = done >= target;
  const current = monthKey(today.year, today.month);

  const phase: ChallengePhase =
    current < challenge.month
      ? "upcoming"
      : current > challenge.month
        ? "ended"
        : "active";

  if (phase === "upcoming") {
    return {
      phase,
      monthDays,
      done,
      target,
      needed,
      daysLeft: monthDays,
      reached,
      course: null,
      perWeek: null,
    };
  }

  const elapsed = phase === "ended" ? monthDays : today.day;
  const daysLeft = phase === "ended" ? 0 : monthDays - today.day + 1;
  // Heute zählt erst als vergangen, wenn er eingetragen ist: Morgens um acht
  // ist noch niemand hinter dem Plan.
  const todayDone =
    phase === "active" && isoDate(today.year, today.month, today.day) in challenge.days;
  const open = phase === "ended" ? 0 : daysLeft - (todayDone ? 1 : 0);

  let course: ChallengeCourse;
  if (reached) course = "reached";
  else if (needed > open) course = "missed";
  else {
    const past = todayDone ? elapsed : elapsed - 1;
    const expected = (target * past) / monthDays;
    const behindBy = expected - done;
    course = behindBy < 1 ? "onTrack" : behindBy < 3 ? "close" : "behind";
  }

  return {
    phase,
    monthDays,
    done,
    target,
    needed,
    daysLeft,
    reached,
    course,
    perWeek: (done * 7) / Math.max(1, elapsed),
  };
}

export interface ActivityCount {
  id: ActivityId;
  label: string;
  count: number;
}

/** Wie oft jede Aktivität vorkam, häufigste zuerst; ungenutzte fehlen. */
export function activityCounts(challenge: Challenge): ActivityCount[] {
  const counts = new Map<ActivityId, number>();
  for (const activities of Object.values(challenge.days)) {
    for (const id of activities) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return ACTIVITIES.flatMap(({ id, label }) => {
    const count = counts.get(id) ?? 0;
    return count > 0 ? [{ id, label, count }] : [];
  }).sort((a, b) => b.count - a.count);
}
