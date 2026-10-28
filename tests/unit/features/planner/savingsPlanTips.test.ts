import { describe, expect, it } from "vitest";
import { EUR, Money } from "@/lib/money";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import type { SavingsPlan } from "@/features/planner/savingsPlans";
import { savingsPlanTips } from "@/features/planner/savingsPlanTips";

function plan(securityId: string, partial: Partial<SavingsPlan> = {}): SavingsPlan {
  return {
    id: `plan-${securityId}`,
    securityId,
    depotId: null,
    amount: Money.fromString("100", EUR),
    interval: "monthly",
    nextDate: null,
    paused: false,
    ...partial,
  };
}

function snapshot(securityId: string, marketValue: string): SecuritySnapshot {
  return {
    id: `snap-${securityId}`,
    user_id: "user-1",
    security_id: securityId,
    run_id: "run-1",
    as_of: "2026-10-20",
    quantity: "10.000000",
    buyin_per_share: null,
    buyin_total: null,
    price: null,
    market_value: marketValue,
    gain_absolute: null,
    gain_relative: null,
    allocation: null,
    dividend_yield: null,
    dividend_yield_on_buyin: null,
    annual_dividend_total: null,
    dividend_per_share: null,
    dividend_frequency: null,
    dividend_cagr: null,
    dividend_cagr_period: null,
    next_ex_date: null,
    next_pay_date: null,
    asset_type: "equity",
    currency: "EUR",
    created_at: "2026-10-20T10:00:00Z",
  };
}

// Depot 10.000 €: Alpha 1.000, Beta 1.000, Gamma 7.500, Delta 500.
const SNAPSHOTS = [
  snapshot("sec-a", "1000.00"),
  snapshot("sec-b", "1000.00"),
  snapshot("sec-c", "7500.00"),
  snapshot("sec-d", "500.00"),
];
const NAMES = new Map([
  ["sec-a", "Alpha"],
  ["sec-b", "Beta"],
  ["sec-c", "Gamma"],
  ["sec-d", "Delta"],
]);
const NONE: ReadonlySet<string> = new Set();

function tips(
  plans: SavingsPlan[],
  caps: [string, number][],
  excluded: ReadonlySet<string> = NONE,
) {
  return savingsPlanTips({
    plans,
    snapshots: SNAPSHOTS,
    caps: new Map(caps),
    excluded,
    names: NAMES,
  });
}

describe("savingsPlanTips", () => {
  it("meldet, wann ein Plan seine Gewichtung erreicht, mit wachsendem Depot", () => {
    // Fehlt 1.100 − 1.000 = 100 €; je Monat 100 − 11 % × 200 = 78 € näher → 2 Monate.
    const result = tips(
      [plan("sec-a"), plan("sec-b")],
      [
        ["sec-a", 11],
        ["sec-b", 50],
      ],
    );
    expect(result).toContainEqual({
      kind: "reaching",
      securityId: "sec-a",
      name: "Alpha",
      months: 2,
      cap: 11,
    });
  });

  it("schweigt, wenn die Gewichtung erst nach 24 Monaten erreicht wird", () => {
    // Fehlt 1.000 €; je Monat 100 − 20 % × 100 = 80 € → 13 Monate; bei 30 % 2.000/70 → 29.
    expect(tips([plan("sec-a")], [["sec-a", 20]]).map((tip) => tip.kind)).toEqual([
      "reaching",
    ]);
    expect(tips([plan("sec-a")], [["sec-a", 30]])).toEqual([]);
  });

  it("nennt Pläne über der Gewichtung zuerst, dann Pläne ohne Gewichtung", () => {
    const result = tips([plan("sec-b"), plan("sec-a")], [["sec-a", 5]]);
    expect(result.map((tip) => [tip.kind, tip.name])).toEqual([
      ["over", "Alpha"],
      ["unweighted", "Beta"],
    ]);
    const over = result[0];
    expect(over.kind === "over" && over.percent.toNumber()).toBe(10);
  });

  it("nennt einen Plan auf einer bewussten 0 % als über der Gewichtung", () => {
    const result = tips([plan("sec-a")], [["sec-a", 0]]);
    expect(result.map((tip) => [tip.kind, tip.name])).toEqual([["over", "Alpha"]]);
  });

  it("schlägt Assets mit Platz ohne Plan vor, nicht ausgeschlossene, ab 300 €", () => {
    // Delta: 10 % × 10.000 − 500 = 500 € frei; Beta: 12 % → 200 € (zu wenig).
    const caps: [string, number][] = [
      ["sec-d", 10],
      ["sec-b", 12],
    ];
    const result = tips([], caps);
    expect(result).toHaveLength(1);
    const room = result[0];
    expect(room.kind === "room" && [room.name, room.room.toNumber()]).toEqual([
      "Delta",
      500,
    ]);
    expect(tips([], caps, new Set(["sec-d"]))).toEqual([]);
    expect(tips([plan("sec-d", { paused: true })], caps)).toEqual([]);
  });

  it("nennt höchstens drei Assets mit Platz, das mit dem meisten zuerst", () => {
    const result = tips(
      [],
      [
        ["sec-a", 20],
        ["sec-b", 30],
        ["sec-c", 90],
        ["sec-d", 15],
      ],
    );
    // Frei: Beta 2.000, Gamma 1.500, Alpha und Delta je 1.000 (dann nach Name).
    expect(result.map((tip) => tip.name)).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("gibt ohne Depotstand keine Tipps", () => {
    expect(
      savingsPlanTips({
        plans: [plan("sec-a")],
        snapshots: [],
        caps: new Map(),
        excluded: NONE,
        names: NAMES,
      }),
    ).toEqual([]);
  });
});

describe("savingsPlanTips — Reinvestition", () => {
  // Depot 10.000 €; alle zahlen Dividende.
  const paying = SNAPSHOTS.map((row) => ({ ...row, annual_dividend_total: "30.00" }));
  const run = (
    reinvested: string[],
    caps: [string, number][],
    plans: SavingsPlan[] = [],
  ) =>
    savingsPlanTips({
      plans,
      snapshots: paying,
      caps: new Map(caps),
      excluded: NONE,
      names: NAMES,
      reinvested: new Set(reinvested),
    });

  it("rät, die Reinvestition über der Gewichtung auszuschalten", () => {
    // Gamma: 75 % bei 10 % Gewichtung.
    expect(run(["sec-c"], [["sec-c", 10]])).toMatchObject([
      { kind: "reinvestOver", securityId: "sec-c", cap: 10 },
    ]);
  });

  it("rät, sie unter der Gewichtung einzuschalten", () => {
    // Delta: 500 € bei 20 % = 2.000 € → 1.500 € frei. Der pausierte Plan
    // hält es aus „Platz ohne Sparplan“ heraus.
    const tip = run([], [["sec-d", 20]], [plan("sec-d", { paused: true })]).find(
      (t) => t.kind === "reinvestRoom",
    );
    expect(tip).toMatchObject({ kind: "reinvestRoom", securityId: "sec-d" });
    expect(tip && "room" in tip ? tip.room.toString() : null).toBe("1500");
  });

  it("überlässt Assets mit Sparplan dem Tipp zum Plan", () => {
    const result = run(["sec-c"], [["sec-c", 10]], [plan("sec-c")]);
    expect(result).toMatchObject([
      { kind: "over", securityId: "sec-c", reinvested: true },
    ]);
  });

  it("schweigt ohne Dividende oder ohne Platz", () => {
    expect(run([], [["sec-a", 10]])).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ kind: "reinvestRoom" })]),
    );
  });
});

describe("savingsPlanTips — eine Zeile je Asset", () => {
  it("nennt die ausgeschaltete Reinvestition im Platz-Tipp statt doppelt", () => {
    const paying = SNAPSHOTS.map((row) => ({ ...row, annual_dividend_total: "30.00" }));
    const result = savingsPlanTips({
      plans: [],
      snapshots: paying,
      caps: new Map([["sec-d", 20]]),
      excluded: NONE,
      names: NAMES,
      reinvested: NONE,
    });
    expect(result).toMatchObject([
      { kind: "room", securityId: "sec-d", reinvestOff: true },
    ]);
  });
});
