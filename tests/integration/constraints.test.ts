import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, closePool, createTestUser, firstRow } from "./support/db";
import { seedDepot, seedPayment, seedSecurity } from "./support/seed";

let userId: string;

beforeAll(async () => {
  userId = await createTestUser("constraints-user@example.test");
});

afterAll(async () => {
  await closePool();
});

describe("CHECK-Constraints (TEST_STRATEGY.md §5)", () => {
  it("lehnt eine ungueltige ISIN ab", async () => {
    await expect(
      asUser(userId, (client) => seedSecurity(client, { isin: "invalid" })),
    ).rejects.toThrow(/securities_isin_check/);
  });

  it("lehnt eine ungueltige Waehrung ab", async () => {
    await expect(
      asUser(userId, async (client) => {
        const depotId = await seedDepot(client, "Depot CHECK 1");
        const securityId = await seedSecurity(client, { name: "Check AG 1" });
        return seedPayment(client, { securityId, depotId, originalCurrency: "eu" });
      }),
    ).rejects.toThrow(/dividend_payments_original_currency_check/);
  });

  it("lehnt ein Zahlungsdatum in der Zukunft ab", async () => {
    await expect(
      asUser(userId, async (client) => {
        const depotId = await seedDepot(client, "Depot CHECK 2");
        const securityId = await seedSecurity(client, { name: "Check AG 2" });
        return seedPayment(client, { securityId, depotId, payDate: "2999-01-01" });
      }),
    ).rejects.toThrow(/dividend_payments_pay_date_check/);
  });

  it("erzwingt die Betragsinvariante (Toleranz 0,02) — CALCULATION_RULES.md §4", async () => {
    await expect(
      asUser(userId, async (client) => {
        const depotId = await seedDepot(client, "Depot Invariance 1");
        const securityId = await seedSecurity(client, { name: "Invariance AG 1" });
        // Brutto 100, Netto 50, Quellensteuer 0 -> Differenz 50, weit ausserhalb der Toleranz.
        return client.query(
          `insert into dividend_payments
             (security_id, depot_id, pay_date, gross_amount, net_amount, original_currency, source)
           values ($1, $2, '2025-01-01', 100.00, 50.00, 'EUR', 'manual')`,
          [securityId, depotId],
        );
      }),
    ).rejects.toThrow(/net_amount_invariance/);
  });

  it("akzeptiert die Betragsinvariante innerhalb der Toleranz", async () => {
    const row = await asUser(userId, async (client) => {
      const depotId = await seedDepot(client, "Depot Invariance 2");
      const securityId = await seedSecurity(client, { name: "Invariance AG 2" });
      const result = await client.query(
        `insert into dividend_payments
           (security_id, depot_id, pay_date, gross_amount, net_amount, withholding_tax, original_currency, source)
         values ($1, $2, '2025-01-01', 100.00, 85.01, 15.00, 'EUR', 'manual')
         returning id`,
        [securityId, depotId],
      );
      return result.rows[0] as { id: string };
    });
    expect(row.id).toBeDefined();
  });

  it("verbietet negative Betraege fuer reguläre Zahlungen, erlaubt sie fuer Korrekturen", async () => {
    await expect(
      asUser(userId, async (client) => {
        const depotId = await seedDepot(client, "Depot Sign 1");
        const securityId = await seedSecurity(client, { name: "Sign AG 1" });
        return client.query(
          `insert into dividend_payments
             (security_id, depot_id, pay_date, gross_amount, net_amount, original_currency, source, payment_type)
           values ($1, $2, '2025-01-01', -10.00, -10.00, 'EUR', 'manual', 'regular')`,
          [securityId, depotId],
        );
      }),
    ).rejects.toThrow(/sign_consistency/);

    const row = await asUser(userId, async (client) => {
      const depotId = await seedDepot(client, "Depot Sign 2");
      const securityId = await seedSecurity(client, { name: "Sign AG 2" });
      const result = await client.query(
        `insert into dividend_payments
           (security_id, depot_id, pay_date, gross_amount, net_amount, original_currency, source, payment_type)
         values ($1, $2, '2025-01-01', -10.00, -10.00, 'EUR', 'manual', 'correction')
         returning id`,
        [securityId, depotId],
      );
      return result.rows[0] as { id: string };
    });
    expect(row.id).toBeDefined();
  });

  it("erzwingt import_fields_consistency: Import-Herkunft ohne Import-Metadaten wird abgelehnt", async () => {
    await expect(
      asUser(userId, async (client) => {
        const depotId = await seedDepot(client, "Depot Import 1");
        const securityId = await seedSecurity(client, { name: "Import AG 1" });
        return seedPayment(client, { securityId, depotId, source: "csv_import" });
      }),
    ).rejects.toThrow(/import_fields_consistency/);
  });
});

describe("Foreign Keys", () => {
  it("lehnt einen Dividendeneingang mit unbekanntem Wertpapier ab", async () => {
    // Wird bereits vom BEFORE-Trigger recompute_business_fingerprint()
    // abgefangen (eigene Existenzpruefung fuer die Fingerprint-Berechnung),
    // bevor die FK-Constraint ueberhaupt ausgewertet wird — mit einer
    // klareren Fehlermeldung als der reine FK-Verstoss.
    await expect(
      asUser(userId, async (client) => {
        const depotId = await seedDepot(client, "Depot FK 1");
        return seedPayment(client, {
          securityId: "00000000-0000-0000-0000-000000000000",
          depotId,
        });
      }),
    ).rejects.toThrow(/security_id .* nicht gefunden/);
  });

  it("lehnt einen Dividendeneingang mit unbekanntem Depot ab", async () => {
    await expect(
      asUser(userId, async (client) => {
        const securityId = await seedSecurity(client, { name: "FK AG 2" });
        return seedPayment(client, {
          securityId,
          depotId: "00000000-0000-0000-0000-000000000000",
        });
      }),
    ).rejects.toThrow(/violates foreign key constraint/);
  });

  it("lehnt ein unbekanntes Standard-Depot am Unternehmen ab (0014)", async () => {
    await expect(
      asUser(userId, (client) =>
        client.query("insert into securities (name, default_depot_id) values ($1, $2)", [
          "FK AG 3",
          "00000000-0000-0000-0000-000000000000",
        ]),
      ),
    ).rejects.toThrow(/violates foreign key constraint/);
  });

  it("erlaubt ein Unternehmen mit gueltigem Standard-Depot (0014)", async () => {
    const { depotId, security } = await asUser(userId, async (client) => {
      const depotId = await seedDepot(client, "Depot Standard 1");
      const result = await client.query<{ default_depot_id: string | null }>(
        "insert into securities (name, default_depot_id) values ($1, $2) returning default_depot_id",
        ["Standard-Depot AG", depotId],
      );
      return { depotId, security: firstRow(result) };
    });
    expect(security.default_depot_id).toBe(depotId);
  });
});

describe("Unique Constraints", () => {
  it("lehnt doppelte ISIN je Nutzer ab", async () => {
    await asUser(userId, (client) =>
      seedSecurity(client, { name: "Unique AG 1", isin: "DE0007164600" }),
    );
    await expect(
      asUser(userId, (client) =>
        seedSecurity(client, { name: "Unique AG 1 Anders", isin: "DE0007164600" }),
      ),
    ).rejects.toThrow(/securities_user_isin_key/);
  });

  it("lehnt doppelten Namen (case-insensitive) je Nutzer ab", async () => {
    await asUser(userId, (client) => seedSecurity(client, { name: "Eindeutig AG" }));
    await expect(
      asUser(userId, (client) => seedSecurity(client, { name: "eindeutig ag" })),
    ).rejects.toThrow(/securities_user_name_key/);
  });

  it("lehnt doppelte (import_id, source_row_number) ab", async () => {
    const importId = await asUser(userId, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into imports (file_name, file_hash, file_size_bytes, file_type)
         values ('a.csv', repeat('a', 64), 100, 'csv') returning id`,
      );
      const row = result.rows[0];
      if (!row) throw new Error("kein Import angelegt");
      return row.id;
    });

    await asUser(userId, async (client) => {
      const depotId = await seedDepot(client, "Depot Dup Row 1");
      const securityId = await seedSecurity(client, { name: "Dup Row AG 1" });
      return seedPayment(client, {
        securityId,
        depotId,
        source: "csv_import",
        importId,
        sourceRowNumber: 1,
        rowFingerprint: "fp-1",
      });
    });

    await expect(
      asUser(userId, async (client) => {
        const depotId = await seedDepot(client, "Depot Dup Row 2");
        const securityId = await seedSecurity(client, { name: "Dup Row AG 2" });
        return seedPayment(client, {
          securityId,
          depotId,
          source: "csv_import",
          importId,
          sourceRowNumber: 1,
          rowFingerprint: "fp-2",
        });
      }),
    ).rejects.toThrow(/dp_import_row_key/);
  });

  it("erlaubt keinen zweiten aktiven net_year-Ziel fuer dasselbe Jahr", async () => {
    await asUser(userId, (client) =>
      client.query(
        "insert into goals (goal_type, year, target_amount) values ('net_year', 2025, 1000.00)",
      ),
    );
    await expect(
      asUser(userId, (client) =>
        client.query(
          "insert into goals (goal_type, year, target_amount) values ('net_year', 2025, 2000.00)",
        ),
      ),
    ).rejects.toThrow(/goals_unique_active/);
  });
});

describe("Soft Delete (kein Hard Delete, Grundsatz 3)", () => {
  it("verbietet DELETE auf eine aktive (nicht archivierte) dividend_payments-Zeile", async () => {
    const payment = await asUser(userId, async (client) => {
      const depotId = await seedDepot(client, "Depot Delete 1");
      const securityId = await seedSecurity(client, { name: "Delete AG 1" });
      return seedPayment(client, { securityId, depotId });
    });

    // DELETE ist ab 0013 grundsaetzlich gegrantet, aber die RLS-Policy laesst
    // nur bereits archivierte eigene Zeilen zu (0 betroffene Zeilen statt
    // Fehler, da der Grant existiert und nur die Policy filtert).
    const result = await asUser(userId, (client) =>
      client.query("delete from dividend_payments where id = $1", [payment.id]),
    );
    expect(result.rowCount).toBe(0);

    const stillThere = await asUser(userId, (client) =>
      client.query("select id from dividend_payments where id = $1", [payment.id]),
    );
    expect(stillThere.rowCount).toBe(1);
  });

  it("verbietet DELETE auf securities, depots, portfolios, goals", async () => {
    const securityId = await asUser(userId, (client) =>
      seedSecurity(client, { name: "Delete AG 2" }),
    );
    const depotId = await asUser(userId, (client) => seedDepot(client, "Depot Delete 2"));

    await expect(
      asUser(userId, (client) =>
        client.query("delete from securities where id = $1", [securityId]),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      asUser(userId, (client) =>
        client.query("delete from depots where id = $1", [depotId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("erlaubt DELETE auf imports nur im Entwurfsstatus", async () => {
    const draftId = await asUser(userId, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into imports (file_name, file_hash, file_size_bytes, file_type, status)
         values ('draft.csv', repeat('b', 64), 100, 'csv', 'analyzing') returning id`,
      );
      const row = result.rows[0];
      if (!row) throw new Error("kein Import angelegt");
      return row.id;
    });

    const committedId = await asUser(userId, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into imports (file_name, file_hash, file_size_bytes, file_type, status)
         values ('committed.csv', repeat('c', 64), 100, 'csv', 'committed') returning id`,
      );
      const row = result.rows[0];
      if (!row) throw new Error("kein Import angelegt");
      return row.id;
    });

    const deleteDraft = await asUser(userId, (client) =>
      client.query("delete from imports where id = $1", [draftId]),
    );
    expect(deleteDraft.rowCount).toBe(1);

    const deleteCommitted = await asUser(userId, (client) =>
      client.query("delete from imports where id = $1", [committedId]),
    );
    expect(deleteCommitted.rowCount).toBe(0);
  });
});

describe("Transaktionen", () => {
  it("rollt eine fehlgeschlagene Mehrfach-Operation vollstaendig zurueck", async () => {
    const depotId = await asUser(userId, (client) => seedDepot(client, "Depot TX 1"));
    const securityId = await asUser(userId, (client) =>
      seedSecurity(client, { name: "TX AG 1" }),
    );

    await expect(
      asUser(userId, async (client) => {
        await seedPayment(client, {
          securityId,
          depotId,
          netAmount: "10.00",
          grossAmount: "10.00",
        });
        // Zweite Zeile verletzt eine CHECK-Constraint -> gesamte Transaktion muss zurueckrollen.
        await seedPayment(client, {
          securityId,
          depotId,
          payDate: "2999-01-01",
        });
      }),
    ).rejects.toThrow();

    const count = await asUser(userId, (client) =>
      client.query<{ count: string }>(
        "select count(*) from dividend_payments where depot_id = $1",
        [depotId],
      ),
    );
    expect(firstRow(count).count).toBe("0");
  });
});
