/**
 * Kryptografischer Hash der Importdatei (IMPORT_SPEC.md §3, §7). Der fruehere
 * Zeilen-Fingerprint (Stufe 2) wurde berechnet und verworfen, seit es die
 * Spalte nicht mehr gibt (ADR-009) — er ist entfernt.
 * Nutzt die Web-Crypto-API (`crypto.subtle`), die sowohl im Browser als auch in
 * Node >= 20 (globalThis.crypto) verfuegbar ist.
 */

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
