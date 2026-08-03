/**
 * Einstiegspunkt der DivvyDiary-Discovery (Auftrag Phase B0 §4).
 *
 *   DIVVYDIARY_API_KEY=… npm run discover:divvydiary -- --isin DE0007164600
 *
 * Diese Datei ist die einzige mit Laufzeitbezug (`process`, `console`, `fetch`)
 * — genau wie die `index.ts` der Edge Functions in der Kalenderintegration. Die
 * pruefbare Logik liegt in `endpoints.ts`, `request.ts`, `schemas.ts` und
 * `sanitize.ts` und wird von `tests/unit/divvydiary-discovery/` abgedeckt.
 *
 * Das Skript ist ein **Untersuchungswerkzeug, keine Integration**: Es fragt nur
 * die belegten Endpunkte an (endpoints.ts), nur lesend (request.ts), nur
 * einzeln und mit Abstand, und es gibt ausschliesslich Statuscodes, Kopfzeilen
 * und Feldstrukturen aus — niemals Depotwerte und niemals den Schluessel.
 */

import { writeFile } from "node:fs/promises";
import {
  API_ORIGIN,
  UNVERIFIED_NEEDS,
  buildUrl,
  selectEndpoints,
  type DiscoveryEndpoint,
} from "./endpoints.ts";
import { UsageError, parseOptions, type DiscoveryOptions } from "./options.ts";
import { probe, type ProbeResult } from "./request.ts";
import {
  classifyBody,
  compareWithExpected,
  describeShape,
  findPositionSignals,
  parseJson,
  type FieldShape,
} from "./schemas.ts";
import { collectSecrets, maskSecret, maskUrl, redactText } from "./sanitize.ts";

/** Abstand zwischen zwei Anfragen: kein Schnellfeuer gegen einen fremden Dienst. */
const REQUEST_SPACING_MS = 1_000;

async function pause(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

interface Finding {
  readonly endpoint: DiscoveryEndpoint;
  readonly result: ProbeResult;
  readonly lines: readonly string[];
  readonly shape: readonly FieldShape[];
}

/** Uebersetzt einen Statuscode in das, was er fuer die Bewertung bedeutet. */
function explainStatus(status: number): string {
  if (status === 200) return "OK";
  if (status === 401)
    return "nicht authentifiziert — Schluessel fehlt oder ist ungueltig";
  if (status === 403)
    return "authentifiziert, aber nicht berechtigt — Schluessel deckt diesen Endpunkt nicht ab";
  if (status === 404) return "Endpunkt existiert nicht (mehr)";
  if (status === 429) return "Rate Limit erreicht — siehe Retry-After";
  if (status >= 500) return "Serverfehler auf Seiten der Quelle";
  return "unerwarteter Status";
}

function analyse(
  endpoint: DiscoveryEndpoint,
  result: ProbeResult,
  secrets: readonly string[],
): Finding {
  const lines: string[] = [];
  let shape: readonly FieldShape[] = [];

  if (result.outcome !== "response") {
    lines.push(`Ausgang: ${result.outcome} — ${result.detail ?? "ohne weitere Angabe"}`);
    return { endpoint, result, lines, shape };
  }

  lines.push(`HTTP ${String(result.status)} — ${explainStatus(result.status ?? 0)}`);

  const body = result.body ?? "";
  const kind = classifyBody(result.contentType, body);
  lines.push(`Antwortart: ${kind}, ${String(result.bodyBytes ?? 0)} Zeichen`);

  if (kind === "empty") {
    lines.push("Leere Antwort — kein Schema ableitbar.");
    return { endpoint, result, lines, shape };
  }

  if (kind !== "json") {
    // Eine HTML-Antwort ist bei /documentation/ das Erwartete (Swagger-UI) und
    // bei jedem anderen Endpunkt ein Warnsignal (Fehlerseite, Login-Weiche).
    lines.push(
      endpoint.id === "documentation"
        ? "HTML — vermutlich die Swagger-Oberflaeche. Die Endpunktliste steht in " +
            "der dort geladenen Spezifikation; oeffne die Adresse im Browser."
        : "Kein JSON — moeglicherweise eine Fehler- oder Anmeldeseite. Nicht auswertbar.",
    );
    return { endpoint, result, lines, shape };
  }

  const parsed = parseJson(body);
  if (!parsed.ok) {
    lines.push(parsed.reason);
    return { endpoint, result, lines, shape };
  }

  shape = describeShape(parsed.value);
  lines.push(`Felder: ${String(shape.length)}`);

  const comparison = compareWithExpected(endpoint.id, shape);
  if (comparison.missing.length > 0) {
    lines.push(
      `SCHEMAAENDERUNG — belegte Felder fehlen: ${comparison.missing.join(", ")}`,
    );
  }
  if (comparison.additional.length > 0) {
    lines.push(
      `Zusaetzliche, bisher unbelegte Felder: ${comparison.additional.join(", ")}`,
    );
  }

  const signals = findPositionSignals(shape);
  lines.push(
    signals.length === 0
      ? "Keine Bestandsfelder in dieser Antwort."
      : `Moegliche Bestandsfelder: ${signals
          .map((signal) => `${signal.path} (${signal.label})`)
          .join(", ")}`,
  );

  return {
    endpoint,
    result,
    lines: lines.map((line) => redactText(line, secrets)),
    shape,
  };
}

function printFinding(finding: Finding): void {
  const { endpoint, result } = finding;
  console.log(`\n── ${endpoint.id} — ${maskUrl(result.url)}`);
  console.log(`   Zweck: ${endpoint.purpose}`);
  console.log(`   Beleg: ${endpoint.evidence} (${endpoint.source})`);
  console.log(`   Dauer: ${String(result.durationMs)} ms`);
  for (const [name, value] of Object.entries(result.headers)) {
    console.log(`   ${name}: ${value}`);
  }
  for (const line of finding.lines) console.log(`   ${line}`);
}

/**
 * Der Bericht fuer die Datei: ausschliesslich Feldpfade und Gestalten. Er
 * enthaelt keinen einzigen Depotwert und laesst sich deshalb gefahrlos in ein
 * Ticket oder eine Dokumentation uebernehmen.
 */
function renderReport(findings: readonly Finding[]): string {
  const lines: string[] = [
    "# DivvyDiary-Discovery — beobachtete Schemata",
    "",
    "Erzeugt von `scripts/divvydiary-discovery/discovery.ts`. Enthaelt nur",
    "Feldnamen und Werttypen, keine Depotdaten und keine Zugangsdaten.",
    "",
  ];

  for (const finding of findings) {
    lines.push(`## ${finding.endpoint.id}`, "");
    lines.push(
      `- Status: ${finding.result.status === null ? finding.result.outcome : String(finding.result.status)}`,
    );
    lines.push(`- Content-Type: ${finding.result.contentType ?? "—"}`);
    lines.push("");
    if (finding.shape.length === 0) {
      lines.push("Kein auswertbares JSON-Schema.", "");
      continue;
    }
    lines.push("| Feld | Typ |", "|---|---|");
    for (const field of finding.shape)
      lines.push(`| \`${field.path}\` | ${field.type} |`);
    lines.push("");
  }

  return lines.join("\n");
}

async function main(): Promise<number> {
  let options: DiscoveryOptions;
  try {
    options = parseOptions(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error instanceof UsageError ? error.message : String(error));
    return 2;
  }

  const secrets = collectSecrets(options.apiKey);

  console.log("DivvyDiary-Discovery — ausschliesslich lesend");
  console.log(`Host:       ${API_ORIGIN}`);
  console.log(`Schluessel: ${maskSecret(options.apiKey)}`);
  console.log(
    `ISIN:       ${options.isin ?? "— (Endpunkt /symbols wird uebersprungen)"}`,
  );

  const endpoints = selectEndpoints(options.isin);
  const findings: Finding[] = [];

  for (const [index, endpoint] of endpoints.entries()) {
    if (index > 0) await pause(REQUEST_SPACING_MS);
    const url = buildUrl(endpoint, options.isin ?? undefined);
    const result = await probe(endpoint.id, url, { apiKey: options.apiKey });
    const finding = analyse(endpoint, result, secrets);
    findings.push(finding);
    printFinding(finding);
  }

  console.log("\n── Nicht angefragt (kein Beleg — Raten waere unzulaessig)");
  for (const item of UNVERIFIED_NEEDS) {
    console.log(`   ${item.need}\n     ${item.note}`);
  }

  if (options.outFile !== null) {
    await writeFile(options.outFile, renderReport(findings), "utf8");
    console.log(`\nSchemabericht geschrieben: ${options.outFile}`);
  }

  // Ein fehlgeschlagener Abruf ist ein gueltiges Ergebnis, kein Skriptfehler.
  // Der Exit-Code sagt nur, ob die Authentifizierung ueberhaupt griff. Ein
  // Netzwerkfehler ist etwas anderes als eine abgelehnte Anmeldung — wer beides
  // gleich meldet, schickt den Leser auf die falsche Faehrte.
  if (findings.some((finding) => finding.result.status === 200)) return 0;

  const answered = findings.some((finding) => finding.result.status !== null);
  console.error(
    answered
      ? "\nKein Endpunkt hat mit 200 geantwortet — Schluessel und Statuscodes oben pruefen."
      : "\nKeine Antwort erhalten — Netzwerkverbindung oder Proxy pruefen. Node liest HTTPS_PROXY nur mit NODE_USE_ENV_PROXY=1.",
  );
  return 1;
}

process.exitCode = await main();
