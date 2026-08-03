# DivvyDiary-Discovery (Phase B0)

Ein **Untersuchungswerkzeug**, keine Integration. Es beantwortet genau eine
Frage: Liefert die DivvyDiary-API einen lesenden Zugang zum Depotbestand?

Die Auswertung steht in [`docs/divvydiary-api-discovery.md`](../../docs/divvydiary-api-discovery.md);
dieses Verzeichnis enthaelt nur das Werkzeug, mit dem sich die dortigen Angaben
mit einem eigenen Schluessel nachpruefen lassen.

## Was das Skript tut — und was nicht

| Tut | Tut nicht |
|---|---|
| fragt **drei belegte** Endpunkte an (`endpoints.ts`) | Pfade raten, Wortlisten abarbeiten, Verzeichnisse durchsuchen |
| ausschliesslich `GET` | `POST`, `PUT`, `PATCH`, `DELETE` — technisch blockiert (`request.ts`) |
| einzeln, mit 1 s Abstand, 15 s Zeitgrenze | Schnellfeuer, Wiederholungsschleifen |
| meldet Weiterleitungen | Weiterleitungen folgen (der Schluessel bliebe sonst nicht beim bekannten Host) |
| gibt Statuscodes, Kopfzeilen, **Feldnamen und Werttypen** aus | Depotwerte, Stueckzahlen, Betraege oder den Schluessel ausgeben |
| schreibt auf Wunsch einen reinen Schemabericht (`--out`) | vollstaendige Antworten speichern |

Der Schluessel wird **nur** aus der Umgebungsvariablen `DIVVYDIARY_API_KEY`
gelesen, nur an `api.divvydiary.com` gesendet und in jeder Ausgabe maskiert.

## Aufruf

```bash
# Nur fuer diesen einen Aufruf gesetzt — nicht in eine Datei schreiben.
DIVVYDIARY_API_KEY="…" npm run discover:divvydiary

# Zusaetzlich die Wertpapierdaten zu einer ISIN pruefen
DIVVYDIARY_API_KEY="…" npm run discover:divvydiary -- --isin DE0007164600

# Schemabericht (nur Feldnamen und Typen) in eine Datei schreiben
DIVVYDIARY_API_KEY="…" npm run discover:divvydiary -- --out /tmp/divvydiary-schema.md
```

Den Schluessel legt DivvyDiary unter *Einstellungen* an. Er gehoert **nicht** in
`.env`, nicht ins Repository und niemals hinter ein `VITE_`-Praefix — das
landete im Browser-Bundle (SECURITY_MODEL.md §5).

> **Achtung, derselbe Schluessel schreibt auch.** Portfolio Performance nutzt
> ihn fuer `POST /portfolios/{id}/import`. Dieses Skript sendet nur `GET`, aber
> wer den Schluessel weitergibt, gibt Schreibzugriff auf sein DivvyDiary-Depot
> weiter. Details: [`docs/divvydiary-security-assessment.md`](../../docs/divvydiary-security-assessment.md).

## Was zu berichten ist

Nach dem Lauf zaehlen vier Angaben:

1. **`/session`** — Status 200? Wie viele Depots, und haben sie eine stabile `id`?
2. **`/documentation/`** — Erreichbar? Nennt die Spezifikation einen lesenden
   Endpunkt fuer Positionen? *Das ist die entscheidende Frage der Phase B0.*
3. **`/symbols/{isin}`** — Status 200 und die belegten Felder vorhanden?
4. **Schemaabweichungen** — meldet das Skript fehlende belegte Felder?

Antworten bitte als Statuscodes und Feldnamen weitergeben, nicht als
Bildschirmfoto der Antwort.

## Aufbau

| Datei | Rolle |
|---|---|
| `endpoints.ts` | Allowlist der belegten Endpunkte samt Quellenangabe |
| `request.ts` | lesender Abruf: Methodenwaechter, Zeitgrenze, Weiterleitungen, Kopfzeilen |
| `schemas.ts` | Strukturanalyse: Feldpfade, Typen, Schemaabgleich, Bestandssignale |
| `sanitize.ts` | Maskierung von Schluesseln und Reduktion von Werten auf ihre Gestalt |
| `discovery.ts` | Node-Einstiegspunkt; die einzige Datei mit Laufzeitbezug |

Wie bei der Kalenderintegration (`supabase/functions/_shared`) traegt nur der
Einstiegspunkt Laufzeitbezug. Die vier uebrigen Module sind rein und werden von
`tests/unit/divvydiary-discovery/` geprueft — inklusive der Blockade
schreibender Methoden.

```bash
npm test -- tests/unit/divvydiary-discovery
```

## Wenn Phase B1 nicht kommt

Dann kann dieses Verzeichnis ersatzlos entfernt werden. Es hat keine Aufrufer im
Anwendungscode und keine eigenen Abhaengigkeiten.
