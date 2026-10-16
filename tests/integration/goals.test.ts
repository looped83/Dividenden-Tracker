import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAnon, asUser, closePool, createTestUser, firstRow } from "./support/db";
import { seedDepot, seedPayment, seedSecurity } from "./support/seed";

let userA: string;
let userB: string;

beforeAll(async () => {
  userA = await createTestUser("goals-a@example.test");
  userB = await createTestUser("goals-b@example.test");
});

afterAll(async () => {
  await closePool();
});

interface GoalRow {
  id: string;
  user_id: string;
  goal_type: string;
  year: number;
  month: number | null;
  target_amount: string;
  currency: string;
  title: string | null;
  note: string | null;
}

async function insertGoal(
  client: PoolClient,
  values: {
    goalType?: string;
    year?: number;
    month?: number | null;
    targetAmount?: string;
    title?: string | null;
  } = {},
): Promise<GoalRow> {
  const result = await client.query<GoalRow>(
    `insert into goals (goal_type, year, month, target_amount, title)
     values ($1, $2, $3, $4, $5) returning *`,
    [
      values.goalType ?? "annual",
      values.year ?? 2027,
      values.month ?? null,
      values.targetAmount ?? "12000.00",
      values.title ?? null,
    ],
  );
  return firstRow(result);
}

describe("goals – Anlegen und Validierung", () => {
  it("Nutzer kann ein Jahresziel anlegen; user_id wird erzwungen", async () => {
    const goal = await asUser(userA, (c) => insertGoal(c, { year: 2030 }));
    expect(goal.user_id).toBe(userA);
    expect(goal.goal_type).toBe("annual");
    expect(goal.month).toBeNull();
    expect(goal.target_amount).toBe("12000.00");
  });

  it("Nutzer kann ein Monatsziel anlegen", async () => {
    const goal = await asUser(userA, (c) =>
      insertGoal(c, {
        goalType: "monthly",
        year: 2030,
        month: 3,
        targetAmount: "1000.00",
      }),
    );
    expect(goal.goal_type).toBe("monthly");
    expect(goal.month).toBe(3);
  });

  it("Zielbetrag wird decimal-sicher (numeric) gespeichert", async () => {
    const goal = await asUser(userA, (c) =>
      insertGoal(c, { year: 2031, targetAmount: "1234.56" }),
    );
    expect(goal.target_amount).toBe("1234.56");
  });

  it("lehnt Jahresziel mit Monat ab (goal_month_consistency)", async () => {
    await expect(
      asUser(userA, (c) => insertGoal(c, { goalType: "annual", year: 2032, month: 5 })),
    ).rejects.toThrow();
  });

  it("lehnt Monatsziel ohne Monat ab", async () => {
    await expect(
      asUser(userA, (c) =>
        insertGoal(c, { goalType: "monthly", year: 2032, month: null }),
      ),
    ).rejects.toThrow();
  });

  it("lehnt ungültigen Monat und nicht-positiven Betrag ab", async () => {
    await expect(
      asUser(userA, (c) => insertGoal(c, { goalType: "monthly", year: 2033, month: 13 })),
    ).rejects.toThrow();
    await expect(
      asUser(userA, (c) => insertGoal(c, { year: 2034, targetAmount: "0" })),
    ).rejects.toThrow();
    await expect(
      asUser(userA, (c) => insertGoal(c, { year: 2035, targetAmount: "-1" })),
    ).rejects.toThrow();
  });
});

describe("goals – Eindeutigkeit", () => {
  it("verhindert zwei Jahresziele desselben Jahres", async () => {
    await asUser(userA, (c) => insertGoal(c, { year: 2040 }));
    await expect(asUser(userA, (c) => insertGoal(c, { year: 2040 }))).rejects.toThrow();
  });

  it("verhindert zwei Monatsziele desselben Monats", async () => {
    await asUser(userA, (c) =>
      insertGoal(c, { goalType: "monthly", year: 2041, month: 4 }),
    );
    await expect(
      asUser(userA, (c) => insertGoal(c, { goalType: "monthly", year: 2041, month: 4 })),
    ).rejects.toThrow();
  });

  it("erlaubt Jahresziel und Monatsziel für dasselbe Jahr sowie unterschiedliche Monate", async () => {
    await asUser(userA, (c) => insertGoal(c, { year: 2042 }));
    await asUser(userA, (c) =>
      insertGoal(c, { goalType: "monthly", year: 2042, month: 3 }),
    );
    const april = await asUser(userA, (c) =>
      insertGoal(c, { goalType: "monthly", year: 2042, month: 4 }),
    );
    expect(april.month).toBe(4);
  });

  it("verschiedene Nutzer dürfen dasselbe Jahr belegen", async () => {
    await asUser(userA, (c) => insertGoal(c, { year: 2043 }));
    const b = await asUser(userB, (c) => insertGoal(c, { year: 2043 }));
    expect(b.user_id).toBe(userB);
  });
});

describe("goals – Bearbeiten und Löschen", () => {
  it("Nutzer kann den Zielbetrag bearbeiten (updated_at ändert sich)", async () => {
    const goal = await asUser(userA, (c) => insertGoal(c, { year: 2050 }));
    const updated = await asUser(userA, async (c) => {
      const result = await c.query<GoalRow & { updated_at: string }>(
        "update goals set target_amount = $2 where id = $1 returning *",
        [goal.id, "15000.00"],
      );
      return firstRow(result);
    });
    expect(updated.target_amount).toBe("15000.00");
  });

  it("Löschen eines Ziels verändert keine Dividendeneingänge", async () => {
    const { goalId, paymentId } = await asUser(userA, async (c) => {
      const depot = await seedDepot(c);
      const security = await seedSecurity(c);
      const payment = await seedPayment(c, {
        depotId: depot,
        securityId: security,
        payDate: "2020-06-01",
      });
      const goal = await insertGoal(c, { year: 2051 });
      return { goalId: goal.id, paymentId: payment.id };
    });

    await asUser(userA, (c) => c.query("delete from goals where id = $1", [goalId]));

    const stillThere = await asUser(userA, async (c) => {
      const goals = await c.query("select id from goals where id = $1", [goalId]);
      const payments = await c.query("select id from dividend_payments where id = $1", [
        paymentId,
      ]);
      return { goals: goals.rowCount, payments: payments.rowCount };
    });
    expect(stillThere.goals).toBe(0);
    expect(stillThere.payments).toBe(1);
  });
});

describe("goals – RLS und Nutzerisolation", () => {
  it("Nutzer sieht ausschließlich eigene Ziele", async () => {
    await asUser(userA, (c) => insertGoal(c, { year: 2060 }));
    await asUser(userB, (c) => insertGoal(c, { year: 2061 }));
    const seenByA = await asUser(userA, async (c) => {
      const result = await c.query<{ year: number }>(
        "select year from goals order by year",
      );
      return result.rows.map((r) => r.year);
    });
    expect(seenByA).toContain(2060);
    expect(seenByA).not.toContain(2061);
  });

  it("Nutzer A kann ein Ziel von B nicht über die direkte ID lesen", async () => {
    const goalB = await asUser(userB, (c) => insertGoal(c, { year: 2062 }));
    const rows = await asUser(userA, async (c) => {
      const result = await c.query("select id from goals where id = $1", [goalB.id]);
      return result.rowCount;
    });
    expect(rows).toBe(0);
  });

  it("Nutzer A kann ein Ziel von B nicht über die direkte ID bearbeiten", async () => {
    const goalB = await asUser(userB, (c) =>
      insertGoal(c, { year: 2063, targetAmount: "500.00" }),
    );
    const affected = await asUser(userA, async (c) => {
      const result = await c.query("update goals set target_amount = $2 where id = $1", [
        goalB.id,
        "999.00",
      ]);
      return result.rowCount;
    });
    expect(affected).toBe(0);
    const unchanged = await asUser(userB, async (c) => {
      const result = await c.query<{ target_amount: string }>(
        "select target_amount from goals where id = $1",
        [goalB.id],
      );
      return firstRow(result).target_amount;
    });
    expect(unchanged).toBe("500.00");
  });

  it("Nutzer A kann ein Ziel von B nicht über die direkte ID löschen", async () => {
    const goalB = await asUser(userB, (c) => insertGoal(c, { year: 2064 }));
    const deleted = await asUser(userA, async (c) => {
      const result = await c.query("delete from goals where id = $1", [goalB.id]);
      return result.rowCount;
    });
    expect(deleted).toBe(0);
    const stillThere = await asUser(userB, async (c) => {
      const result = await c.query("select id from goals where id = $1", [goalB.id]);
      return result.rowCount;
    });
    expect(stillThere).toBe(1);
  });

  it("anon hat keinerlei Zugriff auf goals", async () => {
    await expect(asAnon((c) => c.query("select * from goals"))).rejects.toThrow();
  });

  it("user_id kann nicht auf einen fremden Nutzer gesetzt werden", async () => {
    await expect(
      asUser(userA, (c) =>
        c.query(
          "insert into goals (user_id, goal_type, year, target_amount) values ($1, 'annual', 2070, '1.00')",
          [userB],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("goals – Audit", () => {
  it("protokolliert Anlegen, Ändern und Löschen im Audit Log", async () => {
    const goal = await asUser(userA, (c) => insertGoal(c, { year: 2080 }));
    await asUser(userA, (c) =>
      c.query("update goals set target_amount = '20000.00' where id = $1", [goal.id]),
    );
    await asUser(userA, (c) => c.query("delete from goals where id = $1", [goal.id]));

    const actions = await asUser(userA, async (c) => {
      const result = await c.query<{ action: string }>(
        "select action from audit_log where entity_type = 'goal' and entity_id = $1 order by id",
        [goal.id],
      );
      return result.rows.map((r) => r.action);
    });
    expect(actions).toEqual(["insert", "update", "delete"]);
  });
});
