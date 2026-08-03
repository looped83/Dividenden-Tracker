/**
 * Maskierung und Reduktion (Auftrag Phase B0 §4, §15).
 *
 * Die Discovery laeuft mit einem echten API-Schluessel gegen ein echtes Depot.
 * Alles, was sie ausgibt, landet erfahrungsgemaess in einem Chatfenster, einem
 * Ticket oder einer Zwischenablage. Deshalb gilt hier dieselbe Regel wie in der
 * Edge Function (docs/CALENDAR_INTEGRATION.md §3): **Der Bericht beschreibt die
 * Gestalt der Daten, niemals ihren Inhalt.**
 *
 * Rein und ohne Laufzeitbezug (kein `process`, kein `fetch`), damit dieselbe
 * Logik unter Node und in den Unit-Tests laeuft.
 */

/** Header, deren Wert niemals im Klartext ausgegeben wird. */
const SECRET_HEADERS = new Set([
  "x-api-key",
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

/** Query-Parameter, die erfahrungsgemaess Zugangsdaten tragen. */
const SECRET_QUERY_PARAMS = ["token", "key", "apikey", "api_key", "access_token", "sig"];

/**
 * Ein Geheimnis auf eine wiedererkennbare, aber nutzlose Form kuerzen.
 * Vier Zeichen genuegen, um zwei Schluessel auseinanderzuhalten; sie genuegen
 * nicht, um einen zu benutzen. Kurze Werte werden vollstaendig ersetzt.
 */
export function maskSecret(value: string): string {
  if (value.length === 0) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…**** (${String(value.length)} Zeichen)`;
}

/** Ersetzt die Werte verdaechtiger Query-Parameter. Bei kaputten URLs: Totalersatz. */
export function maskUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "<unlesbare Adresse>";
  }
  for (const name of SECRET_QUERY_PARAMS) {
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase() === name) parsed.searchParams.set(key, "****");
    }
  }
  return parsed.toString();
}

/** Header fuer die Ausgabe aufbereiten: Geheimnisse maskiert, Rest im Klartext. */
export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    result[name] = SECRET_HEADERS.has(name.toLowerCase()) ? maskSecret(value) : value;
  }
  return result;
}

/**
 * Entfernt jedes Geheimnis, das sich in einen freien Text verirrt hat — etwa
 * die Meldung von `fetch`, die die angefragte Adresse mitnennt. Zusaetzlich
 * wird der Text gekuerzt: Ein Fehlertext, der laenger ist als ein Satz, ist
 * meistens eine mitgelieferte HTML-Seite.
 */
export function redactText(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.length >= 4) result = result.split(secret).join("****");
  }
  return result.length > 300 ? `${result.slice(0, 300)}…` : result;
}

/**
 * Ein Beispielwert fuer den Bericht: Er soll den **Typ** und die **Gestalt**
 * eines Feldes zeigen, nicht seinen Wert.
 *
 * - Zahlen werden zu ihrer Groessenordnung. Aus `1234.56` wird `»Zahl, 4
 *   Vorkommastellen, 2 Nachkommastellen«` — daraus laesst sich die noetige
 *   Spaltenbreite ableiten (`numeric(p,s)`), aber kein Depotwert.
 * - Zeichenketten werden auf erkennbare Muster reduziert (ISIN, WKN,
 *   Waehrung, Datum, Zeitpunkt); alles andere wird zu Laenge und Zeichenart.
 * - `null` und Wahrheitswerte sind ungefaehrlich und bleiben stehen.
 */
export function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return `boolean (${String(value)})`;
  if (typeof value === "number") return describeNumber(value);
  if (typeof value === "string") return describeString(value);
  if (Array.isArray(value)) return `array[${String(value.length)}]`;
  if (typeof value === "object") {
    return `object{${Object.keys(value).length.toString()} Felder}`;
  }
  return typeof value;
}

function describeNumber(value: number): string {
  if (!Number.isFinite(value)) return "number (nicht endlich)";
  // Absichtlich Zeichenarithmetik statt Rechnung: Es geht um die Gestalt der
  // Zahl, nicht um ihren Wert (CALCULATION_RULES.md §8).
  const [mantissa = ""] = Math.abs(value).toString().split("e");
  const [integerPart = "", fractionPart = ""] = mantissa.split(".");
  const fraction = fractionPart.length > 0 ? `, ${String(fractionPart.length)} NK` : "";
  return `number (${String(integerPart.length)} VK${fraction})`;
}

const SHAPE_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, label: "ISIN" },
  { pattern: /^[A-Z0-9]{6}$/, label: "WKN-Form" },
  { pattern: /^[A-Z]{3}$/, label: "Waehrungscode" },
  { pattern: /^[A-Z]{4}$/, label: "MIC-Form" },
  { pattern: /^\d{4}-\d{2}-\d{2}$/, label: "Datum (ISO)" },
  {
    pattern: /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/,
    label: "Zeitpunkt (ISO)",
  },
];

function describeString(value: string): string {
  for (const { pattern, label } of SHAPE_PATTERNS) {
    if (pattern.test(value)) return `string (${label})`;
  }
  return `string (${String(value.length)} Zeichen)`;
}

/** Alle Werte, die aus einer Ausgabe herausgehalten werden muessen. */
export function collectSecrets(
  apiKey: string | null,
  extra: readonly string[] = [],
): readonly string[] {
  return [apiKey, ...extra].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}
