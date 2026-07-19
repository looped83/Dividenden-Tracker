import type { CompanyMatch } from "./matchCompany";
import type { BrokerMatch } from "./brokerMatch";

/** Zeilenstatus (IMPORT_SPEC.md §8, Task §11). */
export type RowStatus =
  "valid" | "valid_warning" | "needs_mapping" | "needs_dedupe" | "invalid" | "excluded";

/** Eine normalisierte Quellzeile mit Validierungsergebnis und Herkunft. */
export interface NormalizedRow {
  /** 1-indizierte Datenzeilennummer der Quelldatei (Kopfzeile = 1, erste Daten = 2). */
  sourceRowNumber: number;
  /** Original-Zellwerte (String-Darstellung) fuer den Herkunftsnachweis. */
  raw: {
    date: string;
    investment: string;
    amount: string;
    broker: string;
  };
  payDate: string | null;
  /** Kanonischer Dezimalstring. */
  netAmount: string | null;
  currency: string;
  /** Sichtbarer Originalname (getrimmt) — bleibt erhalten. */
  investmentName: string;
  /** Sichtbarer Original-Brokername (getrimmt). */
  brokerName: string;
  rowFingerprint: string | null;
  status: RowStatus;
  warnings: string[];
  errors: string[];
}

export type CompanyDecisionKind = "existing" | "alias" | "new" | "exclude";

export interface CompanyDecision {
  kind: CompanyDecisionKind;
  /** bei existing/alias: Ziel-Wertpapier. */
  securityId?: string;
}

/** Nach eindeutigem Quellnamen gruppierte Unternehmensentscheidung (Task §8). */
export interface CompanyGroup {
  sourceName: string;
  normalized: string;
  count: number;
  minDate: string | null;
  maxDate: string | null;
  sum: string;
  match: CompanyMatch;
  /** Vorbelegte Entscheidung aus dem Match (autoAssignable => existing/alias, sonst new). */
  defaultDecision: CompanyDecision;
}

export type BrokerDecisionKind = "existing" | "new";

export interface BrokerDecision {
  kind: BrokerDecisionKind;
  depotId?: string;
}

export interface BrokerGroup {
  sourceName: string;
  normalized: string;
  count: number;
  sum: string;
  match: BrokerMatch;
  defaultDecision: BrokerDecision;
}
