/**
 * Namensnormalisierung fuer den Vergleich (IMPORT_SPEC.md §5, §6).
 *
 * Wird ausschliesslich fuer den Abgleich verwendet — der sichtbare
 * Originalname aus der Quelldatei bleibt stets unveraendert erhalten.
 */
export function normalizeCompareName(raw: string): string {
  return (
    raw
      .normalize("NFC")
      // typografische Apostrophe vereinheitlichen
      .replace(/[‘’ʼ`´]/g, "'")
      // verschiedene Bindestriche/Gedankenstriche vereinheitlichen
      .replace(/[‐‑‒–—―]/g, "-")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Broker-Normalisierung (IMPORT_SPEC.md §5): nur offensichtliche
 * Formatunterschiede (Leerzeichen, Gross-/Kleinschreibung) — keine
 * inhaltliche Zusammenfassung unterschiedlicher Broker.
 */
export function normalizeBrokerName(raw: string): string {
  return raw.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}
