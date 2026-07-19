import { normalizeCompareName, normalizeBrokerName } from "./normalizeName";

/**
 * Kryptografische Hashes fuer Datei- und Zeilenidentitaet (IMPORT_SPEC.md §3, §7).
 * Nutzt die Web-Crypto-API (`crypto.subtle`), die sowohl im Browser als auch in
 * Node >= 20 (globalThis.crypto) verfuegbar ist.
 */

const FIELD_SEPARATOR = ""; // ASCII Unit Separator, wie in der DB-Funktion

async function sha256Hex(input: ArrayBuffer | string): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 der Rohdatei (Stufe-1-Duplikatpruefung gegen `imports.file_hash`). */
export async function hashFile(file: ArrayBuffer): Promise<string> {
  return sha256Hex(file);
}

/**
 * Exakter Zeilen-Fingerprint (Stufe 2): ueber die normalisierten, gemappten
 * Werte. Formatunabhaengig, damit dieselbe fachliche Zeile unabhaengig von der
 * Quellformatierung denselben Fingerprint erhaelt.
 */
export async function rowFingerprint(input: {
  payDate: string;
  investmentName: string;
  netAmount: string;
  currency: string;
  brokerName: string;
}): Promise<string> {
  const payload = [
    input.payDate,
    normalizeCompareName(input.investmentName),
    input.netAmount,
    input.currency.toUpperCase(),
    normalizeBrokerName(input.brokerName),
  ].join(FIELD_SEPARATOR);
  return sha256Hex(payload);
}
