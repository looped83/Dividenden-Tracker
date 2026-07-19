import { computeChecksums } from "./checksums";
import { normalizeCompareName, normalizeBrokerName } from "./normalizeName";
import type { NormalizedRow, CompanyDecision, BrokerDecision } from "./types";

/**
 * Baut die Nutzlast fuer die serverseitige `commit_import`-RPC (IMPORT_SPEC.md
 * §22, Migration 0016). Erzeugt neue Stammdatenschluessel, Aliase, Zeilen-Refs
 * und die erwarteten Kontrollsummen. Die Serverseite prueft diese Kontrollsummen
 * erneut und lehnt bei Abweichung den gesamten Import ab.
 */

export interface SecurityRef {
  type: "existing" | "new";
  id?: string;
  key?: string;
}
export interface DepotRef {
  type: "existing" | "new";
  id?: string;
  key?: string;
}

export interface CommitPayload {
  sheet_name?: string | undefined;
  column_mapping?: unknown;
  new_securities: { key: string; name: string }[];
  new_depots: { key: string; name: string; broker: string }[];
  aliases: { alias_normalized: string; security_ref: SecurityRef }[];
  rows: {
    source_row_number: number;
    pay_date: string;
    net_amount: string;
    currency: string;
    security_ref: SecurityRef;
    depot_ref: DepotRef;
    row_fingerprint: string | null;
    raw: NormalizedRow["raw"];
    normalized: {
      investment: string;
      broker: string;
      pay_date: string;
      net_amount: string;
    };
    warnings: string[];
  }[];
  expected: {
    row_count: number;
    total_net: string;
    min_date: string | null;
    max_date: string | null;
    by_year: Record<string, { count: number; sum: string }>;
    by_broker: Record<string, { count: number }>;
  };
  row_balance: unknown;
}

export interface BuildPayloadInput {
  rows: NormalizedRow[];
  /** Entscheidung je Unternehmensgruppe, Schluessel = normalizeCompareName(sourceName). */
  companyDecisions: Map<string, CompanyDecision>;
  /** Entscheidung je Brokergruppe, Schluessel = normalizeBrokerName(sourceName). */
  brokerDecisions: Map<string, BrokerDecision>;
  sheetName?: string;
  columnMapping?: unknown;
}

/** Zeilen, die tatsaechlich importiert werden (gueltig, nicht ausgeschlossen, kein Duplikat-Skip). */
export function selectImportableRows(
  rows: NormalizedRow[],
  companyDecisions: Map<string, CompanyDecision>,
): NormalizedRow[] {
  return rows.filter((row) => {
    if (row.status !== "valid" && row.status !== "valid_warning") return false;
    if (!row.payDate || !row.netAmount) return false;
    const decision = companyDecisions.get(normalizeCompareName(row.investmentName));
    if (decision?.kind === "exclude") return false;
    return true;
  });
}

/** Zeile mit garantiert gesetztem Datum/Betrag (nach selectImportableRows). */
interface ResolvedRow {
  row: NormalizedRow;
  payDate: string;
  netAmount: string;
}

function resolve(row: NormalizedRow): ResolvedRow {
  if (row.payDate === null || row.netAmount === null) {
    throw new Error(
      `Interner Fehler: Zeile ${String(row.sourceRowNumber)} ohne Datum/Betrag zum Import ausgewaehlt.`,
    );
  }
  return { row, payDate: row.payDate, netAmount: row.netAmount };
}

export function buildCommitPayload(input: BuildPayloadInput): CommitPayload {
  const { rows, companyDecisions, brokerDecisions } = input;
  const importable = selectImportableRows(rows, companyDecisions).map(resolve);

  // Neue Wertpapiere/Depots und Aliase aus den Entscheidungen ableiten.
  const newSecurities = new Map<string, string>(); // key -> originalName
  const newDepots = new Map<string, string>(); // key -> originalName
  const aliases: CommitPayload["aliases"] = [];
  const seenAlias = new Set<string>();

  const payloadRows: CommitPayload["rows"] = importable.map(
    ({ row, payDate, netAmount }) => {
      const companyKey = normalizeCompareName(row.investmentName);
      const brokerKey = normalizeBrokerName(row.brokerName);
      const companyDecision = companyDecisions.get(companyKey) ?? {
        kind: "new" as const,
      };
      const brokerDecision = brokerDecisions.get(brokerKey) ?? { kind: "new" as const };

      let securityRef: SecurityRef;
      if (companyDecision.kind === "existing" && companyDecision.securityId) {
        securityRef = { type: "existing", id: companyDecision.securityId };
      } else if (companyDecision.kind === "alias" && companyDecision.securityId) {
        securityRef = { type: "existing", id: companyDecision.securityId };
        if (!seenAlias.has(companyKey)) {
          seenAlias.add(companyKey);
          aliases.push({
            alias_normalized: companyKey,
            security_ref: { type: "existing", id: companyDecision.securityId },
          });
        }
      } else {
        newSecurities.set(companyKey, row.investmentName);
        securityRef = { type: "new", key: companyKey };
      }

      let depotRef: DepotRef;
      if (brokerDecision.kind === "existing" && brokerDecision.depotId) {
        depotRef = { type: "existing", id: brokerDecision.depotId };
      } else {
        newDepots.set(brokerKey, row.brokerName);
        depotRef = { type: "new", key: brokerKey };
      }

      return {
        source_row_number: row.sourceRowNumber,
        pay_date: payDate,
        net_amount: netAmount,
        currency: row.currency,
        security_ref: securityRef,
        depot_ref: depotRef,
        row_fingerprint: row.rowFingerprint,
        raw: row.raw,
        normalized: {
          investment: row.investmentName,
          broker: row.brokerName,
          pay_date: payDate,
          net_amount: netAmount,
        },
        warnings: row.warnings,
      };
    },
  );

  const checksums = computeChecksums(
    importable.map(({ row, payDate, netAmount }) => ({
      payDate,
      netAmount,
      broker: row.brokerName,
    })),
  );

  const byBroker: Record<string, { count: number }> = {};
  for (const [broker, bucket] of Object.entries(checksums.byBroker)) {
    byBroker[broker] = { count: bucket.count };
  }

  return {
    sheet_name: input.sheetName,
    column_mapping: input.columnMapping,
    new_securities: [...newSecurities.entries()].map(([key, name]) => ({ key, name })),
    new_depots: [...newDepots.entries()].map(([key, name]) => ({
      key,
      name,
      broker: name,
    })),
    aliases,
    rows: payloadRows,
    expected: {
      row_count: checksums.rowCount,
      total_net: checksums.totalNet,
      min_date: checksums.minDate,
      max_date: checksums.maxDate,
      by_year: checksums.byYear,
      by_broker: byBroker,
    },
    row_balance: {
      analyzed: rows.length,
      imported: importable.length,
      invalid: rows.filter((r) => r.status === "invalid").length,
      excluded: rows.filter((r) => r.status === "excluded").length,
      needs_dedupe: rows.filter((r) => r.status === "needs_dedupe").length,
    },
  };
}
