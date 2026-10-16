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

/**
 * Minimale, gueltige Sicherungsnutzlast.
 *
 * `format_version: 1` bleibt die Vorgabe — nicht aus Traegheit, sondern weil
 * damit **jeder** Test dieser Datei nebenbei belegt, dass die vorhandenen
 * Sicherungen des Nutzers weiterhin einspielbar sind. Die Nutzlasten der
 * Version 2 setzen die Version ausdruecklich.
 */
function backupPayload(
  userId: string,
  data: Partial<{
    portfolios: unknown[];
    depots: unknown[];
    securities: unknown[];
    dividend_payments: unknown[];
    goals: unknown[];
    imports: unknown[];
    security_aliases: unknown[];
    security_snapshot_runs: unknown[];
    security_snapshots: unknown[];
  }> = {},
  formatVersion = 1,
): Record<string, unknown> {
  return {
    format: "dividend-tracker-backup",
    format_version: formatVersion,
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
      ...(data.security_aliases ? { security_aliases: data.security_aliases } : {}),
      ...(data.security_snapshot_runs
        ? { security_snapshot_runs: data.security_snapshot_runs }
        : {}),
      ...(data.security_snapshots ? { security_snapshots: data.security_snapshots } : {}),
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

describe("restore_backup — Depotstände (Formatversion 2)", () => {
  /**
   * Depotstaende sind der einzige Datenbestand des Projekts, der sich **nicht**
   * nachbeschaffen laesst: DivvyDiary exportiert immer nur den heutigen Stand
   * (docs/PORTFOLIO_IMPORT.md). Ein Stichtag, den die Wiederherstellung nicht
   * zurueckbringt, ist endgueltig verloren — deshalb hier dieselbe Sorgfalt
   * wie bei den Zahlungen.
   */
  /**
   * Je Test eigene Kennungen. Eine Sicherung behaelt ihre Original-UUIDs, und
   * `on conflict do nothing` uebergeht eine bereits vergebene Kennung still —
   * feste Konstanten liessen den zweiten Test derselben Datei ins Leere
   * laufen, ohne dass es auffiele.
   */
  let seq = 0;
  function ids(): { run: string; snapshot: string; alias: string } {
    seq += 1;
    const tail = (n: number) => String(seq * 10 + n).padStart(12, "0");
    return {
      run: `bbbbbbbb-0000-4000-8000-${tail(1)}`,
      snapshot: `bbbbbbbb-0000-4000-8000-${tail(2)}`,
      alias: `bbbbbbbb-0000-4000-8000-${tail(3)}`,
    };
  }

  function lauf(runId: string, overrides: Record<string, unknown> = {}) {
    return {
      id: runId,
      as_of: "2026-08-03",
      source: "divvydiary_csv",
      file_name: "portfolio-1754236800000.csv",
      rows_total: 1,
      rows_imported: 1,
      rows_skipped: 0,
      rows_invalid: 0,
      ...overrides,
    };
  }

  function stand(
    { run, snapshot }: { run: string; snapshot: string },
    securityId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: snapshot,
      security_id: securityId,
      run_id: run,
      as_of: "2026-08-03",
      quantity: "12.500000",
      buyin_total: "1051.50",
      market_value: "1205.00",
      annual_dividend_total: "37.60",
      dividend_frequency: "quarterly",
      asset_type: "equity",
      currency: "EUR",
      ...overrides,
    };
  }

  /** Alle Staende eines Nutzers, nach Stichtag. */
  async function readSnapshots(
    userId: string,
  ): Promise<{ as_of: string; market_value: string | null; run_id: string }[]> {
    return asUser(userId, async (client) => {
      const result = await client.query<{
        as_of: string;
        market_value: string | null;
        run_id: string;
      }>(
        `select to_char(as_of, 'YYYY-MM-DD') as as_of, market_value, run_id::text as run_id
           from security_snapshots order by as_of`,
      );
      return result.rows;
    });
  }

  it("spielt Läufe, Stände und bestätigte Schreibweisen ein", async () => {
    const kennung = ids();
    const user = await createTestUser("restore-snapshots@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Staende");
      const security = await seedSecurity(client, { name: "Stand AG" });
      return { depotId: depot, securityId: security };
    });

    const payload = backupPayload(
      user,
      {
        securities: [{ id: securityId, name: "Stand AG" }],
        depots: [{ id: depotId, name: "Staende", base_currency: "EUR" }],
        security_aliases: [
          {
            id: kennung.alias,
            alias_normalized: "stand ag inhaber aktien",
            security_id: securityId,
          },
        ],
        security_snapshot_runs: [lauf(kennung.run)],
        security_snapshots: [stand(kennung, securityId)],
      },
      2,
    );

    const result = await restore(user, payload, "merge");
    expect(result.success).toBe(true);
    expect(result.records_restored.security_snapshot_runs).toBe(1);
    expect(result.records_restored.security_snapshots).toBe(1);
    expect(result.records_restored.security_aliases).toBe(1);

    const rows = await readSnapshots(user);
    // Der Betrag muss die Runde durch JSON unveraendert ueberstehen.
    expect(rows.map((r) => [r.as_of, r.market_value])).toEqual([
      ["2026-08-03", "1205.00"],
    ]);
  });

  it("nimmt eine Sicherung der Version 1 unverändert an", async () => {
    // Die Dateien, die der Nutzer heute besitzt. Sie kennen die drei neuen
    // Bereiche nicht — das darf sie nicht unbrauchbar machen.
    const user = await createTestUser("restore-v1-still-works@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Altformat");
      const security = await seedSecurity(client, { name: "Alt AG" });
      return { depotId: depot, securityId: security };
    });

    const result = await restore(
      user,
      backupPayload(user, {
        securities: [{ id: securityId, name: "Alt AG" }],
        depots: [{ id: depotId, name: "Altformat", base_currency: "EUR" }],
      }),
      "merge",
    );

    expect(result.success).toBe(true);
    expect(result.records_restored.security_snapshots).toBe(0);
  });

  it("lässt einen bereits erfassten Stichtag im Modus „merge“ unberührt", async () => {
    /**
     * Der heikle Fall: Nach der Sicherung wurde eine neue CSV hochgeladen.
     * Fuer denselben Tag liegt damit ein **anderer** Lauf vor, und der Lauf
     * aus der Datei kann wegen `unique (user_id, source, as_of)` nicht
     * entstehen. Seine Staende zeigen dann auf eine Lauf-Kennung, die es nicht
     * gibt — ohne die Absicherung in 0031 braeche die gesamte
     * Wiederherstellung an einer Fremdschluesselverletzung ab, obwohl mit dem
     * Bestand alles in Ordnung ist.
     */
    const kennung = ids();
    const user = await createTestUser("restore-snapshot-conflict@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Konflikt");
      const security = await seedSecurity(client, { name: "Konflikt AG" });
      await client.query(
        `with r as (
           insert into security_snapshot_runs (as_of, source, rows_total, rows_imported)
           values ('2026-08-03', 'divvydiary_csv', 1, 1) returning id
         )
         insert into security_snapshots (security_id, run_id, as_of, quantity,
                                         market_value, currency)
         select $1, r.id, '2026-08-03', 9, 999.99, 'EUR' from r`,
        [security],
      );
      return { depotId: depot, securityId: security };
    });

    const result = await restore(
      user,
      backupPayload(
        user,
        {
          securities: [{ id: securityId, name: "Konflikt AG" }],
          depots: [{ id: depotId, name: "Konflikt", base_currency: "EUR" }],
          security_snapshot_runs: [lauf(kennung.run)],
          security_snapshots: [stand(kennung, securityId)],
        },
        2,
      ),
      "merge",
    );

    expect(result.success).toBe(true);
    expect(result.records_restored.security_snapshots).toBe(0);

    // Der vorhandene, neuere Stand bleibt — „merge" ergaenzt, es ueberschreibt
    // nicht.
    const rows = await readSnapshots(user);
    expect(rows.map((r) => r.market_value)).toEqual(["999.99"]);
  });

  it("ersetzt im Modus „replace“ genau die Stichtage der Datei", async () => {
    const kennung = ids();
    const user = await createTestUser("restore-snapshot-replace@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Ersetzen");
      const security = await seedSecurity(client, { name: "Ersetz AG" });
      // Zwei Stichtage im Bestand: einer, den die Datei kennt (03.08.), und
      // einer, ueber den sie nichts sagt (10.08.).
      for (const [tag, wert] of [
        ["2026-08-03", "999.99"],
        ["2026-08-10", "111.11"],
      ]) {
        await client.query(
          `with r as (
             insert into security_snapshot_runs (as_of, source, rows_total, rows_imported)
             values ($2::date, 'divvydiary_csv', 1, 1) returning id
           )
           insert into security_snapshots (security_id, run_id, as_of, quantity,
                                           market_value, currency)
           select $1, r.id, $2::date, 9, $3::numeric, 'EUR' from r`,
          [security, tag, wert],
        );
      }
      return { depotId: depot, securityId: security };
    });

    const result = await restore(
      user,
      backupPayload(
        user,
        {
          securities: [{ id: securityId, name: "Ersetz AG" }],
          depots: [{ id: depotId, name: "Ersetzen", base_currency: "EUR" }],
          security_snapshot_runs: [lauf(kennung.run)],
          security_snapshots: [stand(kennung, securityId)],
        },
        2,
      ),
      "replace",
    );
    expect(result.success).toBe(true);

    const rows = await readSnapshots(user);
    // Der 03.08. traegt jetzt den Wert der Datei, der 10.08. steht unveraendert
    // da: Ihn zu loeschen waere unwiederbringlich, und die Datei behauptet
    // ueber ihn nichts.
    expect(rows.map((r) => [r.as_of, r.market_value])).toEqual([
      ["2026-08-03", "1205.00"],
      ["2026-08-10", "111.11"],
    ]);
  });

  it("weist einen Stand ab, dessen Unternehmen die Sicherung nicht enthält", async () => {
    const kennung = ids();
    const user = await createTestUser("restore-snapshot-no-security@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Ohne Unternehmen");
      const security = await seedSecurity(client, { name: "Ohne AG" });
      return { depotId: depot, securityId: security };
    });

    const payload = backupPayload(
      user,
      {
        securities: [{ id: securityId, name: "Ohne AG" }],
        depots: [{ id: depotId, name: "Ohne Unternehmen", base_currency: "EUR" }],
        security_snapshot_runs: [lauf(kennung.run)],
        security_snapshots: [stand(kennung, "cccccccc-0000-4000-8000-000000000009")],
      },
      2,
    );

    await expect(
      asUser(user, (client) =>
        client.query("select restore_backup($1::jsonb, $2)", [
          JSON.stringify(payload),
          "merge",
        ]),
      ),
    ).rejects.toThrow(/missing_security_reference/);
  });

  it("weist einen Stand ab, dessen Lauf in der Sicherung fehlt", async () => {
    // Ohne diese Pruefung schluege dieselbe Datei eine Anweisung spaeter mit
    // einer Fremdschluesselverletzung fehl, deren Text niemandem sagt, was
    // mit der Datei nicht stimmt.
    const kennung = ids();
    const user = await createTestUser("restore-snapshot-no-run@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Ohne Lauf");
      const security = await seedSecurity(client, { name: "Lauflos AG" });
      return { depotId: depot, securityId: security };
    });

    const payload = backupPayload(
      user,
      {
        securities: [{ id: securityId, name: "Lauflos AG" }],
        depots: [{ id: depotId, name: "Ohne Lauf", base_currency: "EUR" }],
        security_snapshot_runs: [],
        security_snapshots: [stand(kennung, securityId)],
      },
      2,
    );

    await expect(
      asUser(user, (client) =>
        client.query("select restore_backup($1::jsonb, $2)", [
          JSON.stringify(payload),
          "merge",
        ]),
      ),
    ).rejects.toThrow(/missing_run_reference/);
  });

  it("weist einen Stand ab, dessen Stichtag nicht zu seinem Lauf passt", async () => {
    // Der zusammengesetzte Fremdschluessel aus 0029 verhindert genau das —
    // hier soll es aber schon an der lesbaren Pruefung scheitern.
    const kennung = ids();
    const user = await createTestUser("restore-snapshot-wrong-day@example.test");
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Falscher Tag");
      const security = await seedSecurity(client, { name: "Tag AG" });
      return { depotId: depot, securityId: security };
    });

    const payload = backupPayload(
      user,
      {
        securities: [{ id: securityId, name: "Tag AG" }],
        depots: [{ id: depotId, name: "Falscher Tag", base_currency: "EUR" }],
        security_snapshot_runs: [lauf(kennung.run)],
        security_snapshots: [stand(kennung, securityId, { as_of: "2026-08-04" })],
      },
      2,
    );

    await expect(
      asUser(user, (client) =>
        client.query("select restore_backup($1::jsonb, $2)", [
          JSON.stringify(payload),
          "merge",
        ]),
      ),
    ).rejects.toThrow(/missing_run_reference/);
  });

  it("schreibt Stände dem angemeldeten Konto zu, nicht dem in der Datei", async () => {
    const kennung = ids();
    const user = await createTestUser("restore-snapshot-owner@example.test");
    const fremd = "dddddddd-0000-4000-8000-000000000001";
    const { depotId, securityId } = await asUser(user, async (client) => {
      const depot = await seedDepot(client, "Eigentum");
      const security = await seedSecurity(client, { name: "Eigen AG" });
      return { depotId: depot, securityId: security };
    });

    await restore(
      user,
      backupPayload(
        user,
        {
          securities: [{ id: securityId, name: "Eigen AG" }],
          depots: [{ id: depotId, name: "Eigentum", base_currency: "EUR" }],
          security_snapshot_runs: [lauf(kennung.run, { user_id: fremd })],
          security_snapshots: [stand(kennung, securityId, { user_id: fremd })],
        },
        2,
      ),
      "merge",
    );

    const owner = await asUser(user, async (client) => {
      const rows = await client.query<{ user_id: string }>(
        "select user_id::text as user_id from security_snapshots where id = $1",
        [kennung.snapshot],
      );
      return rows.rows[0]?.user_id ?? null;
    });
    expect(owner).toBe(user);
  });
});
