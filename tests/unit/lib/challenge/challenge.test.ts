import { describe, expect, it } from "vitest";
import {
  activityCounts,
  canEditDay,
  challengeStatus,
  newChallenge,
  parseChallenge,
  suggestedTarget,
  investedMonths,
  parseChallengeData,
  replaceCurrent,
  toStoredChallengeData,
  toggleActivity,
  type Challenge,
} from "@/lib/challenge";

const ref = (iso: string) => ({
  year: Number(iso.slice(0, 4)),
  month: Number(iso.slice(5, 7)),
  day: Number(iso.slice(8, 10)),
});

/** Sporttage an den ersten `count` Tagen des Monats. */
function withDays(challenge: Challenge, count: number): Challenge {
  let next = challenge;
  for (let day = 1; day <= count; day++) {
    next = toggleActivity(
      next,
      `${challenge.month}-${String(day).padStart(2, "0")}`,
      "kraft",
    );
  }
  return next;
}

describe("suggestedTarget", () => {
  it("schlägt fünf Tage je Woche vor", () => {
    expect(suggestedTarget(31)).toBe(22);
    expect(suggestedTarget(30)).toBe(21);
    expect(suggestedTarget(28)).toBe(20);
  });
});

describe("parseChallenge", () => {
  it("liest die gespeicherte Form und verwirft Fremdes", () => {
    const parsed = parseChallenge({
      month: "2026-11",
      target: 21,
      days: {
        "2026-11-02": ["kraft", "kraft", "yoga"],
        "2026-11-03": ["unbekannt"],
        "2026-12-01": ["joggen"],
      },
      investedAt: null,
    });
    expect(parsed?.days).toEqual({ "2026-11-02": ["kraft", "yoga"] });
    expect(parseChallenge(null)).toBeNull();
    expect(parseChallenge({ month: "2026-13", target: 5, days: {} })).toBeNull();
  });

  it("übersteht den Rundweg über die Speicherform", () => {
    const current = toggleActivity(newChallenge("2026-11", 21), "2026-11-02", "rad");
    const data = { current, bonuses: ["2026-09"] };
    expect(parseChallengeData(toStoredChallengeData(data))).toEqual(data);
    expect(toStoredChallengeData({ current: null, bonuses: [] })).toBeNull();
    expect(parseChallengeData({ bonuses: ["2026-10", "x", "2026-10"] })).toEqual({
      current: null,
      bonuses: ["2026-10"],
    });
  });
});

describe("toggleActivity", () => {
  it("fügt hinzu und entfernt einen leeren Tag", () => {
    const start = newChallenge("2026-11", 21);
    const on = toggleActivity(start, "2026-11-02", "yoga");
    expect(on.days).toEqual({ "2026-11-02": ["yoga"] });
    expect(toggleActivity(on, "2026-11-02", "yoga").days).toEqual({});
  });
});

describe("canEditDay", () => {
  const challenge = newChallenge("2026-11", 21);

  it("erlaubt vergangene Tage und heute, keine Zukunft", () => {
    expect(canEditDay(challenge, "2026-11-01", ref("2026-11-10"))).toBe(true);
    expect(canEditDay(challenge, "2026-11-10", ref("2026-11-10"))).toBe(true);
    expect(canEditDay(challenge, "2026-11-11", ref("2026-11-10"))).toBe(false);
  });

  it("lässt am 1. des Folgemonats noch nachtragen, danach nicht mehr", () => {
    expect(canEditDay(challenge, "2026-11-30", ref("2026-12-01"))).toBe(true);
    expect(canEditDay(challenge, "2026-11-30", ref("2026-12-02"))).toBe(false);
  });
});

describe("challengeStatus", () => {
  const base = newChallenge("2026-11", 21);

  it("ist vor dem Start ohne Einordnung", () => {
    const status = challengeStatus(base, ref("2026-10-20"));
    expect(status.phase).toBe("upcoming");
    expect(status.course).toBeNull();
    expect(status.daysLeft).toBe(30);
  });

  it("ist morgens am ersten Tag im Plan", () => {
    expect(challengeStatus(base, ref("2026-11-01")).course).toBe("onTrack");
  });

  it("ordnet nach dem Rückstand gegen den gleichmäßigen Verlauf ein", () => {
    // Am 15. sind 14 Tage vorbei: erwartet 9,8 Sporttage.
    const today = ref("2026-11-15");
    expect(challengeStatus(withDays(base, 9), today).course).toBe("onTrack");
    expect(challengeStatus(withDays(base, 7), today).course).toBe("close");
    expect(challengeStatus(withDays(base, 6), today).course).toBe("behind");
  });

  it("meldet „nicht erreicht“, wenn die Zielzahl nicht mehr zu schaffen ist", () => {
    const status = challengeStatus(withDays(base, 5), ref("2026-11-20"));
    expect(status.needed).toBe(16);
    expect(status.daysLeft).toBe(11);
    expect(status.course).toBe("missed");
  });

  it("ist ab der Zielzahl geschafft, auch nach Monatsende", () => {
    const done = withDays(base, 21);
    expect(challengeStatus(done, ref("2026-11-21")).course).toBe("reached");
    const ended = challengeStatus(done, ref("2026-12-05"));
    expect(ended.phase).toBe("ended");
    expect(ended.reached).toBe(true);
    expect(ended.perWeek).toBeCloseTo((21 * 7) / 30);
  });
});

describe("activityCounts", () => {
  it("zählt je Aktivität, häufigste zuerst", () => {
    let challenge = newChallenge("2026-11", 21);
    challenge = toggleActivity(challenge, "2026-11-01", "yoga");
    challenge = toggleActivity(challenge, "2026-11-02", "yoga");
    challenge = toggleActivity(challenge, "2026-11-02", "joggen");
    expect(activityCounts(challenge)).toEqual([
      { id: "yoga", label: "Yoga", count: 2 },
      { id: "joggen", label: "Joggen", count: 1 },
    ]);
  });
});

describe("Bonus-Konto", () => {
  const october = { ...newChallenge("2026-10", 22), investedAt: "2026-10-28" };

  it("übernimmt einen investierten Bonus beim Neustart und beim Beenden", () => {
    const data = { current: october, bonuses: ["2026-08"] };
    const next = replaceCurrent(data, newChallenge("2026-11", 21));
    expect(next.bonuses).toEqual(["2026-08", "2026-10"]);
    expect(next.current?.month).toBe("2026-11");
    expect(replaceCurrent(data, null)).toEqual({
      current: null,
      bonuses: ["2026-08", "2026-10"],
    });
  });

  it("zählt den laufenden Monat erst, wenn er investiert ist", () => {
    const open = { ...october, investedAt: null };
    expect(investedMonths({ current: open, bonuses: ["2026-08"] })).toEqual(["2026-08"]);
    expect(investedMonths({ current: october, bonuses: ["2026-08"] })).toEqual([
      "2026-08",
      "2026-10",
    ]);
    // Rückgängig im selben Monat lässt das Konto unverändert.
    expect(replaceCurrent({ current: october, bonuses: [] }, open).bonuses).toEqual([]);
  });
});
