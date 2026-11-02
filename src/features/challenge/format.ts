import type { ChallengeCourse } from "@/lib/challenge";

const COURSE_LABEL: Record<ChallengeCourse, string> = {
  reached: "Geschafft",
  onTrack: "Im Plan",
  close: "Knapp",
  behind: "Unter Plan",
  missed: "Nicht erreicht",
};

export function courseLabel(course: ChallengeCourse): string {
  return COURSE_LABEL[course];
}

/** Etikettfarbe wie bei den Zielen — immer mit Text daneben. */
export function courseVariant(
  course: ChallengeCourse,
): "positive" | "warning" | "negative" {
  if (course === "reached" || course === "onTrack") return "positive";
  return course === "close" ? "warning" : "negative";
}

const WEEKDAY_DATE = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** „Montag, 2. November" — Kalendertag ohne Zeitzonenbezug. */
export function formatWeekdayDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return WEEKDAY_DATE.format(new Date(year, month - 1, day));
}

/** Eine Nachkommastelle in deutscher Schreibweise: „4,9". */
export function formatPerWeek(value: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
