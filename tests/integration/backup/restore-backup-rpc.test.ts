import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, closePool, createTestUser, firstRow } from "../support/db";
import { seedDepot, seedPayment, seedSecurity } from "../support/seed";

/**
 * Wiederherstellung aus einer Sicherung (RPC `restore_backup`, Migration
 * 0022/0023) gegen eine echte PostgreSQL-Instanz.
 *
 * Diese Datei ersetzt zwei fruehere Testdateien, die zusammen 63 Assertions der
 * Form `expect(true).toBe(true)` enthielten und mit dem Vermerk „Skip until
 * database deployment" versehen waren. Sie liefen im CI und waren gruen,
 * waehrend die Sicherung nachweislich nicht funktionierte — ein gruener Test,
 * der nichts prueft, ist schlechter als kein Test.
 *
 * Geprueft wird ausschliesslich das, was die RPC zusagt: Authentifizierung,
 * Modusvalidierung, Fremdschluesselintegritaet, Atomaritaet und
 * Nutzertrennung.
 */

/** Minimale, gueltige Sicherungsnutzlast. */
function backupPayload(
  userId: string,
  data: Partial<{
    portfolios: unknown[];
    depots: unknown[];
    securities: unknown[];
    dividend_payments: unknown[];
    goals: unknown[];
    imports: unknown[];
  }> = {},
): Record<string, unknown> {
  return {
    format: "dividend-tracker-backup",
    format_version: 1,
    schema_version: "0023",
    app_version: "0.1.0",
    exported_at: new Date().toISOString(),
    base_currency: "EUR",
    data: {
      profile: { id: userId, base_currency: "EUR" },
      portfolios: data.portfolios ?? [],
      depots: data.depots ?? [],
      securities: data.securities ?? [],
      dividend_payments: data.dividend_payments ?? [],
      goals: data.goals ?? [],
      imports: data.imports ?? [],
    },
    integrity: { record_counts: {} },
  };
}

let userA: string;
let userB: string;

beforeAll(async () => {
  userA = await createTestUser("restore-user-a@example.test");
  userB = await createTestUser("restore-user-b@example.test");
});

afterAll(async () => {
  await closePool();
});

async function countPayments(userId: string): Promise<number> {
  return asUser(userId, async (client) => {
    const result = await client.query<{ count: string }>(
      "select count(*)::text as count from dividend_payments",
    );
    return Number(firstRow(result).count);
  });
}

describe("restore_backup — Vorbedingungen", () => {
  it("weist einen unbekannten Modus ab", async () => {
    await expect(
      asUser(userA, (client) =>
        client.query("select restore_backup($1::jsonb, $2)", [
          JSON.stringify(backupPayload(userA)),
          "ueberschreiben",
        ]),
      ),
    ).rejects.toThrow(/invalid_restore_mode|restore_failed/);
  });

  it("weist eine unbekannte Formatversion ab", async () => {
    const payload = { ...backupPayload(userA), format_version: 99 };
    await expect(
      asUser(userA, (client) =>
        client.query("select restore_backup($1::jsonb, $2)", [
          JSON.stringify(payload),
          "merge",
        ]),
      ),
    ).rejects.toThrow(/unsupported_format_version|restore_failed/);
  });

  it("laeuft mit gueltiger, leerer Nutzlast durch", async () => {
    const result = await asUser(userA, (client) =>
      client.query<{ restore_backup: { success: boolean } }>(
        "select restore_backup($1::jsonb, $2)",
        [JSON.stringify(backupPayload(userA)), "merge"],
      ),
    );
    expect(firstRow(result).restore_backup.success).toBe(true);
  });
});

describe("restore_backup — Atomaritaet", () => {
  it("laesst den Bestand unveraendert, wenn eine Zahlung auf ein unbekanntes Unternehmen verweist", async () => {
    const { depotId, securityId } = await asUser(userA, async (client) => {
      const depot = await seedDepot(client, "Atomaritaet");
      const security = await seedSecurity(client, { name: "Atom AG" });
      await seedPayment(client, { securityId: security, depotId: depot });
      return { depotId: depot, securityId: security };
    });

    const before = await countPayments(userA);
    expect(before).toBeGreaterThan(0);

    // Eine gueltige und eine ungueltige Zahlung in derselben Nutzlast: Die
    // ungueltige verweist auf ein Unternehmen, das es nicht gibt. Faellt die
    // Transaktion korrekt zurueck, darf **auch die gueltige** nicht ankommen.
    const payload = backupPayload(userA, {
      securities: [{ id: securityId, name: "Atom AG" }],
      depots: [{ id: depotId, name: "Atomaritaet", base_currency: "EUR" }],
      dividend_payments: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          security_id: securityId,
          depot_id: depotId,
          pay_date: "2024-03-01",
          gross_amount: "50.00",
          net_amount: "50.00",
          payment_type: "regular",
          source: "restore",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          security_id: "33333333-3333-4333-8333-333333333333",
          depot_id: depotId,
          pay_date: "2024-04-01",
          gross_amount: "60.00",
          net_amount: "60.00",
          payment_type: "regular",
          source: "restore",
        },
      ],
    });

    await expect(
      asUser(userA, (client) =>
        client.query("select restore_backup($1::jsonb, $2)", [
          JSON.stringify(payload),
          "merge",
        ]),
      ),
    ).rejects.toThrow();

    expect(await countPayments(userA)).toBe(before);
  });
});

describe("restore_backup — Nutzertrennung", () => {
  it("schreibt nichts in den Bestand eines anderen Nutzers", async () => {
    const beforeB = await countPayments(userB);

    const { depotId, securityId } = await asUser(userA, async (client) => {
      const depot = await seedDepot(client, "Trennung");
      const security = await seedSecurity(client, { name: "Trenn AG" });
      return { depotId: depot, securityId: security };
    });

    // Die Nutzlast behauptet, sie gehoere Nutzer B. Die RPC laeuft als
    // `security invoker` und leitet die Zugehoerigkeit ausschliesslich aus
    // `auth.uid()` ab — die Angabe in der Datei darf keine Rolle spielen.
    const payload = backupPayload(userB, {
      securities: [{ id: securityId, user_id: userB, name: "Trenn AG" }],
      depots: [{ id: depotId, user_id: userB, name: "Trennung", base_currency: "EUR" }],
    });

    await asUser(userA, (client) =>
      client.query("select restore_backup($1::jsonb, $2)", [
        JSON.stringify(payload),
        "merge",
      ]),
    ).catch(() => undefined);

    expect(await countPayments(userB)).toBe(beforeB);
  });
});

/** Ruft die RPC auf und liefert das Ergebnisobjekt. */
async function restore(
  userId: string,
  payload: Record<string, unknown>,
  mode: "merge" | "replace",
): Promise<{ success: boolean; records_restored: Record<string, number> }> {
  const result = await asUser(userId, (client) =>
    client.query<{
      restore_backup: { success: boolean; records_restored: Record<string, number> };
    }>("select restore_backup($1::jsonb, $2)", [JSON.stringify(payload), mode]),
  );
  return firstRow(result).restore_backup;
}

/** Liest eine Zahlung unabhaengig von ihrem Stornostatus. */
async function readPayment(
  userId: string,
  id: string,
): Promise<{ net_amount: string; archived_at: string | null } | null> {
  return asUser(userId, async (client) => {
    const result = await client.query<{ net_amount: string; archived_at: string | null }>(
      "select net_amount, archived_at from dividend_payments where id = $1",
      [id],
    );
    return result.rows[0] ?? null;
  });
}

describe("restore_backup — Modus „merge“", () => {
  it("ergänzt fehlende Zahlungen und lässt bestehende unverändert", async () => {
    const user = await createTestUser("restore-merge@example.test");
    const { depotId, securityId, existingId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Merge");
      const security = await seedSecurity(client, { name: "Merge AG" });
      const payment = await seedPayment(client, {
        securityId: security,
        depotId: depot,
        netAmount: "10.00",
        grossAmount: "10.00",
      });
      return { depotId: depot, securityId: security, existingId: payment.id };
    });

    const newId = "44444444-4444-4444-8444-444444444444";
    const payload = backupPayload(user, {
      securities: [{ id: securityId, name: "Merge AG" }],
      depots: [{ id: depotId, name: "Merge", base_currency: "EUR" }],
      dividend_payments: [
        // Bereits vorhanden, in der Datei mit abweichendem Betrag: „merge"
        // darf den Bestand nicht anfassen.
        {
          id: existingId,
          security_id: securityId,
          depot_id: depotId,
          pay_date: "2025-06-15",
          gross_amount: "999.00",
          net_amount: "999.00",
        },
        {
          id: newId,
          security_id: securityId,
          depot_id: depotId,
          pay_date: "2025-07-15",
          gross_amount: "20.00",
          net_amount: "20.00",
        },
      ],
    });

    const result = await restore(user, payload, "merge");
    expect(result.success).toBe(true);

    expect((await readPayment(user, existingId))?.net_amount).toBe("10.00");
    expect((await readPayment(user, newId))?.net_amount).toBe("20.00");
  });
});

describe("restore_backup — Modus „replace“", () => {
  it("stellt den eigenen Bestand vollständig wieder her (Regression: Totalverlust)", async () => {
    // Der gefaehrlichste Fehler der Fassung aus 0022: Alles wurde storniert
    // und anschliessend nichts eingefuegt, weil die IDs bereits existierten.
    // Wer seine eigene Sicherung einspielte, stand vor einem leeren Bestand.
    const user = await createTestUser("restore-replace-self@example.test");
    const { depotId, securityId, ids } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Replace");
      const security = await seedSecurity(client, { name: "Replace AG" });
      const a = await seedPayment(client, {
        securityId: security,
        depotId: depot,
        payDate: "2025-01-15",
      });
      const b = await seedPayment(client, {
        securityId: security,
        depotId: depot,
        payDate: "2025-02-15",
      });
      return { depotId: depot, securityId: security, ids: [a.id, b.id] };
    });

    const payload = backupPayload(user, {
      securities: [{ id: securityId, name: "Replace AG" }],
      depots: [{ id: depotId, name: "Replace", base_currency: "EUR" }],
      // Brutto, Netto und Steuern muessen zueinander passen — die
      // Betragsinvariante (0009) gilt auch fuer eingespielte Zeilen.
      dividend_payments: ids.map((id, index) => ({
        id,
        security_id: securityId,
        depot_id: depotId,
        pay_date: index === 0 ? "2025-01-15" : "2025-02-15",
        gross_amount: "100.00",
        net_amount: "85.00",
        withholding_tax: "15.00",
      })),
    });

    expect((await restore(user, payload, "replace")).success).toBe(true);

    for (const id of ids) {
      const row = await readPayment(user, id);
      expect(row?.archived_at).toBeNull();
      expect(row?.net_amount).toBe("85.00");
    }
  });

  it("storniert, was die Sicherung nicht enthält — und löscht nichts", async () => {
    const user = await createTestUser("restore-replace-extra@example.test");
    const { depotId, securityId, keptId, droppedId } = await asUser(
      user,
      async (client) => {
        const depot = await seedDepot(client, "Teilmenge");
        const security = await seedSecurity(client, { name: "Teil AG" });
        const kept = await seedPayment(client, {
          securityId: security,
          depotId: depot,
          payDate: "2025-03-15",
        });
        const dropped = await seedPayment(client, {
          securityId: security,
          depotId: depot,
          payDate: "2025-04-15",
        });
        return {
          depotId: depot,
          securityId: security,
          keptId: kept.id,
          droppedId: dropped.id,
        };
      },
    );

    const payload = backupPayload(user, {
      securities: [{ id: securityId, name: "Teil AG" }],
      depots: [{ id: depotId, name: "Teilmenge", base_currency: "EUR" }],
      dividend_payments: [
        {
          id: keptId,
          security_id: securityId,
          depot_id: depotId,
          pay_date: "2025-03-15",
          gross_amount: "100.00",
          net_amount: "85.00",
          withholding_tax: "15.00",
        },
      ],
    });

    expect((await restore(user, payload, "replace")).success).toBe(true);

    expect((await readPayment(user, keptId))?.archived_at).toBeNull();

    // Storniert, nicht geloescht: Die Zeile ist weiterhin da (Grundsatz 6).
    const dropped = await readPayment(user, droppedId);
    expect(dropped).not.toBeNull();
    expect(dropped?.archived_at).not.toBeNull();
  });
});

describe("restore_backup — Ergebnis und Nebenwirkungen", () => {
  it("meldet die tatsächlich geschriebenen Mengen", async () => {
    const user = await createTestUser("restore-counts@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Mengen");
      const security = await seedSecurity(client, { name: "Mengen AG" });
      return { depotId: depot, securityId: security };
    });

    const payload = backupPayload(user, {
      securities: [{ id: securityId, name: "Mengen AG" }],
      depots: [{ id: depotId, name: "Mengen", base_currency: "EUR" }],
      dividend_payments: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          security_id: securityId,
          depot_id: depotId,
          pay_date: "2025-05-15",
          gross_amount: "30.00",
          net_amount: "30.00",
        },
      ],
    });

    const result = await restore(user, payload, "merge");
    // Die Zahl stammt aus dem, was geschrieben wurde — nicht aus der
    // Ankuendigung im Integritaetsblock der Datei (der hier leer ist).
    expect(result.records_restored.dividend_payments).toBe(1);
  });

  it("setzt last_backup_at nicht — eine Wiederherstellung ist keine Sicherung", async () => {
    const user = await createTestUser("restore-no-backup-mark@example.test");
    await restore(user, backupPayload(user), "merge");

    const value = await asUser(user, async (client) => {
      const result = await client.query<{ last_backup_at: string | null }>(
        "select last_backup_at from profiles where id = $1",
        [user],
      );
      return result.rows[0]?.last_backup_at ?? null;
    });
    expect(value).toBeNull();
  });

  it("protokolliert die Wiederherstellung mit der Herkunft „restore“", async () => {
    const user = await createTestUser("restore-audit@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Protokoll");
      const security = await seedSecurity(client, { name: "Protokoll AG" });
      return { depotId: depot, securityId: security };
    });

    await restore(
      user,
      backupPayload(user, {
        securities: [{ id: securityId, name: "Protokoll AG" }],
        depots: [{ id: depotId, name: "Protokoll", base_currency: "EUR" }],
        dividend_payments: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            security_id: securityId,
            depot_id: depotId,
            pay_date: "2025-08-15",
            gross_amount: "40.00",
            net_amount: "40.00",
          },
        ],
      }),
      "merge",
    );

    const count = await asUser(user, async (client) => {
      const result = await client.query<{ count: string }>(
        `select count(*)::text as count from audit_log
          where entity_type = 'dividend_payment' and origin = 'restore'`,
      );
      return Number(firstRow(result).count);
    });
    expect(count).toBeGreaterThan(0);
  });
});

describe("restore_backup — Zahlungen mit Importherkunft", () => {
  /**
   * Der Fall, an dem die erste echte Wiederherstellung scheiterte:
   * `validate_backup_references` las die ID der **Zahlung** statt ihrer
   * `import_id` und lehnte damit jede Sicherung ab, die auch nur eine
   * importierte Zahlung enthielt — also praktisch jede Sicherung dieses
   * Projekts (Migration 0024).
   *
   * Alle bisherigen Testnutzlasten kamen ohne `import_id` aus. Ein Feld, das
   * kein Test setzt, kann kein Test schuetzen.
   */
  async function seedImport(userId: string, fileName: string): Promise<string> {
    return asUser(userId, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into imports (file_name, file_hash, file_size_bytes, file_type, status)
         values ($1, $2, $3, 'xlsx', 'committed') returning id`,
        [fileName, "d".repeat(64), 4096],
      );
      return firstRow(result).id;
    });
  }

  it("spielt eine Zahlung mit Importherkunft ein", async () => {
    const user = await createTestUser("restore-import-ok@example.test");
    const importId = await seedImport(user, "Historie.xlsx");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Importdepot");
      const security = await seedSecurity(client, { name: "Import AG" });
      return { depotId: depot, securityId: security };
    });

    const paymentId = "77777777-7777-4777-8777-777777777777";
    const payload = backupPayload(user, {
      securities: [{ id: securityId, name: "Import AG" }],
      depots: [{ id: depotId, name: "Importdepot", base_currency: "EUR" }],
      imports: [
        {
          id: importId,
          file_name: "Historie.xlsx",
          file_hash: "d".repeat(64),
          file_size_bytes: 4096,
          file_type: "xlsx",
          status: "committed",
          // Spaltenzuordnung enthaelt Zahlen, nicht Text — genau die Stelle,
          // an der das Sicherungsformat zuvor danebenlag.
          column_mapping: { pay_date: 0, security: 1, net_amount: 2 },
        },
      ],
      dividend_payments: [
        {
          id: paymentId,
          security_id: securityId,
          depot_id: depotId,
          import_id: importId,
          pay_date: "2025-09-15",
          gross_amount: "70.00",
          net_amount: "70.00",
          source: "excel_import",
          // **Alle drei** Importfelder. `import_fields_consistency` (0016)
          // verlangt: Importquelle genau dann, wenn import_id,
          // source_row_number und row_fingerprint gesetzt sind. Zuvor setzte
          // dieser Test nur import_id — die rechte Seite der Aequivalenz war
          // damit falsch, die Bedingung erfuellt, und dass die RPC `source`
          // ueberschrieb, fiel nicht auf.
          source_row_number: 42,
          row_fingerprint: "f".repeat(64),
          source_file_name: "Historie.xlsx",
        },
      ],
    });

    const result = await restore(user, payload, "merge");
    expect(result.success).toBe(true);

    const stored = await asUser(user, async (client) => {
      const rows = await client.query<{
        import_id: string | null;
        source: string;
        source_row_number: number | null;
      }>(
        "select import_id, source, source_row_number from dividend_payments where id = $1",
        [paymentId],
      );
      return rows.rows[0] ?? null;
    });
    // Die Herkunft muss die Wiederherstellung ueberstehen — sonst waere nach
    // einem Restore nicht mehr nachvollziehbar, woher eine Zahlung stammt.
    expect(stored?.import_id).toBe(importId);
    expect(stored?.source).toBe("excel_import");
    expect(stored?.source_row_number).toBe(42);
  });

  it("weist eine Zahlung ab, deren Importvorgang in der Sicherung fehlt", async () => {
    // Die Pruefung ist richtig gemeint — sie soll nur den echten Fall treffen.
    const user = await createTestUser("restore-import-missing@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Ohne Import");
      const security = await seedSecurity(client, { name: "Ohne AG" });
      return { depotId: depot, securityId: security };
    });

    const payload = backupPayload(user, {
      securities: [{ id: securityId, name: "Ohne AG" }],
      depots: [{ id: depotId, name: "Ohne Import", base_currency: "EUR" }],
      imports: [],
      dividend_payments: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          security_id: securityId,
          depot_id: depotId,
          import_id: "99999999-9999-4999-8999-999999999999",
          pay_date: "2025-10-15",
          gross_amount: "80.00",
          net_amount: "80.00",
        },
      ],
    });

    await expect(
      asUser(user, (client) =>
        client.query("select restore_backup($1::jsonb, $2)", [
          JSON.stringify(payload),
          "merge",
        ]),
      ),
    ).rejects.toThrow(/missing_import_reference/);
  });
});

describe("restore_backup — Sicherung aus einem anderen Konto desselben Projekts", () => {
  /**
   * Eine Sicherung bewahrt die Original-UUIDs; nur so ueberstehen die Verweise
   * Zahlung → Import → Unternehmen → Depot die Wiederherstellung. Liegt im
   * selben Projekt bereits ein anderes Konto mit genau diesen Kennungen, kann
   * das nicht gelingen: `on conflict (id) do nothing` ueberspringt die
   * Stammdaten, RLS verbirgt die fremden Zeilen, und die Zahlung findet ihr
   * Unternehmen nicht.
   *
   * Der Fall trat beim vierten echten Wiederherstellungsversuch auf und
   * meldete `security_id ... nicht gefunden` — eine Meldung aus dem
   * Fingerprint-Trigger, die den Grund verschweigt und nach einer
   * unvollstaendigen Datei aussieht. Migration 0025 benennt die Lage.
   */
  it("bricht mit einer erklärenden Meldung ab statt mit „nicht gefunden“", async () => {
    const source = await createTestUser("foreign-source@example.test");
    const target = await createTestUser("foreign-target@example.test");

    const { depotId, securityId } = await asUser(source, async (client) => {
      const depot = await seedDepot(client, "Fremd");
      const security = await seedSecurity(client, { name: "Fremd AG" });
      return { depotId: depot, securityId: security };
    });

    const payload = backupPayload(source, {
      securities: [{ id: securityId, name: "Fremd AG" }],
      depots: [{ id: depotId, name: "Fremd", base_currency: "EUR" }],
      dividend_payments: [
        {
          id: "aaaaaaaa-3333-4333-8333-333333333333",
          security_id: securityId,
          depot_id: depotId,
          pay_date: "2025-11-15",
          gross_amount: "90.00",
          net_amount: "90.00",
        },
      ],
    });

    await expect(
      asUser(target, (client) =>
        client.query("select restore_backup($1::jsonb, $2)", [
          JSON.stringify(payload),
          "merge",
        ]),
      ),
    ).rejects.toThrow(/foreign_id_conflict/);
  });

  it("laesst den Bestand des fremden Kontos unangetastet", async () => {
    const source = await createTestUser("foreign-source-2@example.test");
    const target = await createTestUser("foreign-target-2@example.test");

    const { depotId, securityId } = await asUser(source, async (client) => {
      const depot = await seedDepot(client, "Unberuehrt");
      const security = await seedSecurity(client, { name: "Unberuehrt AG" });
      await seedPayment(client, { securityId: security, depotId: depot });
      return { depotId: depot, securityId: security };
    });

    const before = await asUser(source, async (client) => {
      const rows = await client.query<{ count: string }>(
        "select count(*)::text as count from dividend_payments",
      );
      return Number(firstRow(rows).count);
    });

    await asUser(target, (client) =>
      client.query("select restore_backup($1::jsonb, $2)", [
        JSON.stringify(
          backupPayload(source, {
            securities: [{ id: securityId, name: "Umbenannt" }],
            depots: [{ id: depotId, name: "Umbenannt", base_currency: "EUR" }],
          }),
        ),
        "replace",
      ]),
    ).catch(() => undefined);

    const after = await asUser(source, async (client) => {
      const rows = await client.query<{ count: string; name: string }>(
        `select (select count(*)::text from dividend_payments) as count,
                (select name from securities where id = $1) as name`,
        [securityId],
      );
      return firstRow(rows);
    });

    expect(Number(after.count)).toBe(before);
    // Auch der Modus "replace" darf fremde Stammdaten nicht umbenennen.
    expect(after.name).toBe("Unberuehrt AG");
  });
});
