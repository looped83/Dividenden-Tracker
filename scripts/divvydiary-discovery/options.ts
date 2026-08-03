/**
 * Aufrufpruefung der Discovery (Auftrag Phase B0 §4, §22).
 *
 * Bewusst rein: `argv` und `env` kommen als Parameter herein, damit dieselbe
 * Pruefung im Unit-Test laeuft, die auch den echten Aufruf absichert. Sie ist
 * die letzte Sperre davor, dass jemand das Werkzeug ohne Schluessel, mit einer
 * unbrauchbaren ISIN oder mit einer erfundenen Option gegen einen fremden
 * Dienst laufen laesst.
 */

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export interface DiscoveryOptions {
  readonly apiKey: string;
  readonly isin: string | null;
  /** Zieldatei des Schemaberichts; `null` bedeutet: nur auf die Konsole. */
  readonly outFile: string | null;
}

/** Ein Bedienfehler — kein Programmfehler. Der Aufrufer gibt nur die Meldung aus. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const MISSING_KEY_MESSAGE = [
  "DIVVYDIARY_API_KEY ist nicht gesetzt.",
  "",
  "Der Schluessel steht in den DivvyDiary-Einstellungen. Er gehoert weder ins",
  "Repository noch in eine Datei mit VITE_-Praefix — uebergib ihn nur fuer",
  "diesen einen Aufruf:",
  "",
  "  DIVVYDIARY_API_KEY=… npm run discover:divvydiary",
].join("\n");

/**
 * Nur die eine Variable, die das Werkzeug liest — bewusst kein
 * `Record<string, string>`: Was hier nicht steht, kann es nicht auslesen.
 */
export interface DiscoveryEnv {
  readonly DIVVYDIARY_API_KEY?: string | undefined;
}

export function parseOptions(
  argv: readonly string[],
  env: DiscoveryEnv,
): DiscoveryOptions {
  const apiKey = (env.DIVVYDIARY_API_KEY ?? "").trim();
  if (apiKey.length === 0) throw new UsageError(MISSING_KEY_MESSAGE);

  let isin: string | null = null;
  let outFile: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";

    if (argument === "--isin") {
      const value = (argv[index + 1] ?? "").trim().toUpperCase();
      if (!ISIN_PATTERN.test(value)) {
        throw new UsageError(
          `--isin erwartet eine gueltige ISIN, erhalten: ${value || "—"}`,
        );
      }
      isin = value;
      index += 1;
      continue;
    }

    if (argument === "--out") {
      const value = (argv[index + 1] ?? "").trim();
      if (value.length === 0) throw new UsageError("--out erwartet einen Dateinamen");
      outFile = value;
      index += 1;
      continue;
    }

    throw new UsageError(`Unbekannte Option: ${argument}`);
  }

  return { apiKey, isin, outFile };
}
