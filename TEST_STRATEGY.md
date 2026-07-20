# TEST_STRATEGY.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliche Teststrategie (Planungsphase)

Werkzeuge: Vitest 4 (+ React Testing Library 16) · Playwright 1.61 (Chromium + WebKit) ·
lokale Supabase-Instanz (CLI/Docker) für Integrations-, RLS- und Backup-Tests.

Grundsatz: Die Finanz- und Importlogik liegt in reinen Funktionen (`lib/money`, `lib/parsing`,
`lib/fingerprint`, `lib/statistics`, `lib/export`) und wird nahezu vollständig unit-getestet.
CI blockiert Merges bei jedem roten Test; Sicherheitstests (§6) sind nie „skippable".

---

## 1. Testpyramide und CI-Stufen

| Stufe | Umfang | Läuft |
|---|---|---|
| Lint + Typecheck | ESLint (inkl. Geld-Verbotsliste, CALCULATION_RULES.md §8), `tsc --noEmit` strict | jeder Commit |
| Unit (Vitest) | §2 | jeder Commit |
| Integration (Vitest + lokale Supabase) | §4–§7 | jeder Commit/PR |
| E2E (Playwright) | §8 | jeder PR + nightly |
| Accessibility | §9 (axe in E2E + manuelle Checkliste) | jeder PR / je Release |

## 2. Unit Tests

**Finanzberechnungen & Rundungen** (`lib/money`)
- R-1–R-7 aus CALCULATION_RULES.md mit Tabellenfällen inkl. Grenzwerten (0,005 → 0,01;
  negative Beträge; 0; sehr große Beträge; 6/8-stellige Skalen)
- Betragsinvariante §4 inkl. Toleranzgrenzen (0,02 ok / 0,021 Warnung)
- Währungsumrechnung R-2 (Hin-/Rückrechnung, keine Float-Drift; Property-Test: Ergebnis
  unabhängig von Additionsreihenfolge)

**Zahlenparser** (`lib/parsing/number`)
- `1.234,56` / `1,234.56` / `1234.56` / `1'234.56` / `(123,45)` / `−12,34` / `12,3456`
- Mehrdeutigkeitserkennung je Spalte; Ablehnung von `12,34,56`, Text, leeren Strings

**Datumsparser** (`lib/parsing/date`)
- DD.MM.YYYY, DD.MM.YY, YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, Excel-Serienwerte (1900- und
  1904-System, Schaltjahr-Bug 1900), Mehrdeutigkeit (03/04/2024), unplausible Daten

**Währungsnormalisierung** — Symbole, Codes, Kleinschreibung, unbekannte Symbole → Rückfrage

**Zeilen-Fingerprints** (`lib/fingerprint`) — Testvektoren (fixe Eingaben → fixe SHA-256),
Normalisierungs-Invarianz (Whitespace, NFC, Groß-/Kleinschreibung), Übereinstimmung
Client-Implementierung ↔ SQL-Triggerfunktion (gleiche Vektoren gegen lokale DB)

**Duplikaterkennung** — Stufen 2–4 (IMPORT_SPEC.md §7): exakt, fachlich, heuristisch
(±3 Tage, ≤1 %, Levenshtein-Ratio), keine falschen Auto-Entscheidungen (Stufe 4 liefert immer
„Nutzerentscheidung nötig")

**Statistikfunktionen** (`lib/statistics`) — jede Kennzahl 6.1–6.20 mit Randfällen:
leere Historie, ein einziger Eingang, Teiljahr, fehlendes Vorjahr, negative Korrekturen,
Monate mit 0, 29.02.-Vergleich, Zielerreichung > 100 %; Property-Test „Kennzahl == Aggregat
der Drill-down-Filtermenge"

**Exportformatierung** (`lib/export`) — CSV/XLSX/JSON-Formate, Formula-Injection-Escaping
(`=SUM(A1)` → `'=SUM(A1)`), Skalenerhalt der Beträge, kanonische Checksummen

## 3. Importtests (Unit/Komponententests mit Fixture-Dateien)

Fixtures in `tests/fixtures/` (CSV, XLSX, XLS, defekt):

- CSV: Semikolon/Komma/Tab; UTF-8, UTF-8-BOM, Windows-1252 (Umlaute „Müller AG")
- deutsche und englische Zahlen-/Datumsformate, gemischte Dateien → korrekte Formatfestlegung
- Sonderzeichen, Anführungszeichen, Zeilenumbrüche in Zellen
- leere Felder, leere Zeilen, Titelzeilen über der Kopfzeile, unbekannte Zusatzspalten
- negative Korrekturen (inkl. Klammernotation)
- doppelte Importe: identische Datei (Stufe 1), identische Zeilen (Stufe 2/3), ähnliche
  Zeilen (Stufe 4 → Entscheidungsbedarf)
- große Datei (50.000 Zeilen synthetisch): Laufzeit-Budget, UI-Thread frei (Worker-Test)
- beschädigte Dateien: abgeschnittenes XLSX, falsche Endung, Binärmüll, leere Datei
- XLSX mit mehreren Tabellenblättern, Formeln (cached values), 1904-Datumssystem
- XLS-Altformat (Beispieldatei) — bei Parserfehler: korrekte Fehlermeldung statt Absturz
- **Bilanz-Invariante:** für jede Fixture gilt `analysiert = gültig + ungültig + Duplikate +
  möglich + ausgeschlossen` (Property-Test über alle Fixtures)
- Import-Rollback: Commit → Rollback → aktive Zahlungen unverändert wie vor Import,
  Historie/Audit vorhanden

## 4. Statistik-Abgleich Client ↔ Datenbank

Seed mit repräsentativer Historie (mehrere Jahre, Währungen, Korrekturen, Archivierte) →
`v_stats_monthly/yearly/by_security/by_depot` müssen wertgleich mit `lib/statistics` über
dieselben Rohdaten sein (String-Vergleich der Decimal-Ergebnisse).

## 5. Datenbanktests (lokale Supabase, echte Migrationen)

- Migrationen laufen auf leerer DB und auf Seed-DB fehlerfrei; Typen-Generierung diff-frei
- Constraints: CHECKs (Beträge, Formate, `sign_consistency`, `fx_fields_consistency`,
  Betragsinvariante), NOT NULL, Wertebereiche
- Foreign Keys: Zahlung ohne Depot/Wertpapier unmöglich; kein Löschen referenzierter Stammdaten
- Unique Constraints: `(user_id, isin)`, `(user_id, name)`-Varianten, `(import_id,
  source_row_number)`, aktive Ziele
- Transaktionen: `commit_import` mit absichtlich ungültiger Zeile → kompletter Rollback,
  keine Teilimporte; `restore_backup`-Abbruch → kein Teilzustand
- Soft Deletes: DELETE auf fachlichen Tabellen scheitert; Archivieren setzt `archived_at`.
  Ausnahme (D-034): DELETE auf `dividend_payments` gelingt ausschließlich für bereits
  archivierte eigene Zeilen (RLS-Policy `dividend_payments_delete_archived_own`), scheitert
  weiterhin für aktive oder fremde Zeilen
- Trigger: `updated_at`, `enforce_user_id`, `protect_payment_immutables` (Änderung von
  `source`/`import_id`/`created_at` scheitert), `recompute_business_fingerprint`
- Audit Log: INSERT/UPDATE/Archive/Delete erzeugen korrekte Diffs (`action = 'delete'` bei
  endgültigem Löschen protokolliert die gelöschte Zeile); Ausschlussliste greift; insert-only
  erzwungen

## 6. Sicherheitstests (RLS, CI-blockierend)

Vollständige Liste in SECURITY_MODEL.md §10; ausgeführt als Integrationstests mit zwei echten
Auth-Nutzern (A, B) über supabase-js:

- Zugriff ohne Anmeldung (anon) auf jede Tabelle/View/RPC → verweigert
- A liest/schreibt nur eigene Daten; B sieht davon nichts
- manipulierte `user_id` in INSERT/UPDATE-Payloads → wirkungslos
- direkte PostgREST-Anfragen (fetch, ohne App-Code) mit Filter-/Header-Manipulation
- unberechtigtes Lesen, Schreiben, „Löschen" (auch via RPC mit fremden IDs)
- Neue Tabellen ohne diese Tests → Merge-Blocker (Checkliste SECURITY_MODEL.md §4)

## 7. Backup-Tests

- Vollständiger Export: alle Entitäten, Zähl- und Checksummen korrekt
- Restore-Roundtrip: Export → leerer Nutzer → Voll-Restore → feldgenauer Vergleich
  (inkl. IDs, Fingerprints, Importhistorie, Audit-Übernahme)
- Beschädigtes Backup (Bitflip → Checksummenfehler), unvollständiges Backup (Block entfernt)
  → Abbruch ohne Schreibzugriff
- Ältere Backupversion (archivierte v1-Beispieldatei bleibt dauerhaft im Repo) → Adapter
- Mehrfacher Restore (Idempotenz), Merge-Restore mit Konflikten (gleiche id ≠ Inhalt;
  gleicher Fingerprint ≠ id)

## 8. E2E-Tests (Playwright; Chromium + WebKit, Viewports Desktop/iPad/iPhone)

1. Registrierung, E-Mail-Bestätigung (lokaler Auth-Testmodus), An-/Abmeldung
2. Manueller Dividendeneingang über das vereinfachte Formular (Depot, Unternehmen,
   Zahlungsdatum, Nettobetrag mit deutschem Komma-Format), Archivieren/Reaktivieren sowohl aus
   der Listenansicht als auch der Detailseite, endgültiges Löschen eines bereits archivierten
   Eingangs (D-034)
3. Dateiimport CSV (deutsches Format) über alle Assistentenschritte
4. Duplikatprüfung: zweiter Import derselben Datei → Stufe-1-Warnung, Stufe-2/3-Klassifikation,
   Stufe-4-Einzelentscheidung
5. Importbestätigung mit Bilanzanzeige; Importbericht in Historie
6. Import-Rollback inkl. Bearbeitet-Warnung
7. Filter/Suche/Sortierung der Zahlungsliste; mobile Kartenansicht
8. Dashboard-Drill-down: Kennzahl → vorgefilterte Liste, Summengleichheit
9. Export (JSON/CSV/XLSX) und Restore mit Vorschau
10. Ziele anlegen, Zielfortschritt
11. Mobile Darstellung: Bottom-Nav, Touch-Ziele, Formulareingabe iPhone-Viewport
12. PWA: Installierbarkeit (Manifest-Check), Offline-Banner, Lesecache nach Reload offline
13. Excel-Import Unternehmen: Name/Ticker/ISIN/WKN sowie optionale Depot-/Broker-Spalte →
    Standard-Depot per Namensabgleich (D-035)

## 9. Accessibility-Tests

- Automatisiert: axe-core in Playwright auf allen Hauptrouten (hell + dunkel), Fail bei
  Verstößen gegen WCAG-AA-Regeln (Kontrast, Labels, Landmarks)
- Tastaturbedienung: komplette Kernflüsse (Erfassung, Import, Filter) ohne Maus; sichtbarer
  Fokus; Fokus-Reihenfolge in Dialogen/Assistent
- Screenreader-Bezeichnungen: aria-labels für Icons, Tabellen-Header-Zuordnung,
  Formularbeschriftungen (jedes Feld mit `<label>`), Fehlermeldungen mit `aria-describedby`
  und Live-Region
- Diagrammalternativen: jede Grafik mit Datentabelle-Umschalter/textueller Zusammenfassung
- Reduced Motion: `prefers-reduced-motion` deaktiviert Übergänge/Chart-Animationen
- Zoom 200 % ohne Funktionsverlust; Touch-Ziele ≥ 44×44 pt (Prüfliste je Release)

## 10. Testdaten

- Deterministische Seeds (feste UUIDs/Daten) für reproduzierbare Ergebnisse
- Realistische Fixture-Historie: ≥ 5 Jahre, ≥ 40 Wertpapiere, EUR/USD/CHF, Sonderdividenden,
  Korrekturen, Archivierte — Grundlage für Statistik- und E2E-Tests
- Keine echten persönlichen Daten in Fixtures oder Repo

---

## Phase 4 — Importtests (umgesetzt)

### Unit (`tests/unit/lib/import/`, Vitest)

Excel-Serien (1900/1904), Datumsformate (de/iso/slash inkl. Mehrdeutigkeit,
ungültige Daten), Beträge (deutsch/englisch/neutral, Klammern/Minus,
Mehrdeutigkeit, Decimal-Summierung inkl. 0,1+0,2=0,30), Spaltenmapping
(de/en-Synonyme), Namensnormalisierung, konservatives Matching (Allianz,
Realty Income, JP Morgan, JPM EU/US Equity werden NICHT automatisch gemergt),
Broker-Normalisierung, Zeilen-Fingerprint (gleiche fachliche Werte ⇒ gleicher
Hash; Gladstone 4,76 ≠ 7,84), Kontrollsummen je Jahr/Broker.

### Integration & realer E2E-Datenpfad (`tests/integration/import.test.ts`)

Läuft gegen eine echte lokale PostgreSQL mit allen Migrationen und die
**bereitgestellte Excel-Datei** (`tests/fixtures/Details-Dividenden-2012-2026.xlsx`):

1. Analyse: ein sichtbares Blatt `Dividenden`, keine verbundenen Zellen, Header
   `Datum/Investment/Betrag/Broker`, 4 Pflichtspalten automatisch erkannt.
2. Normalisierung: 1.439 gültige Zeilen, 0 Fehler, Summe **49.391,57 €**,
   Zeitraum 15.11.2012–17.07.2026, alle 15 Jahreswerte exakt, 94 Investmentnamen,
   Broker 312/1.012/115, Gladstone-Mehrfachzahlung erhalten.
3. `commit_import` speichert atomar 1.439 Zahlungen, 94 archivierte Wertpapiere
   (alle mit Herkunft), 3 Depots, 1.439 `import_rows`; serverseitige
   Kontrollsummen bestätigt.
4. Manipulierter Erwartungswert → vollständige Ablehnung, 0 gespeicherte Zeilen.
5. Wiederholungsimport wird am Datei-Hash erkannt.
6. `rollback_import` entfernt genau die Daten dieses Imports; Bestand/Summen
   wieder wie zuvor.
7. RLS-Isolation und Statusguard (Nutzer B, Anon, Client-Statuswechsel).

Ergebnis der Suite: 126 Unit-Tests und 65 Integrationstests grün; die
GUI-Wizard-Schicht ist eine dünne Hülle über exakt diesen getesteten Funktionen.

## Phase 5A — Dashboard-Tests

**Unit (`tests/unit/lib/statistics`, `tests/unit/features/dashboard`):**
- `dates.test.ts` — Zeitraumlogik: YTD vs. volles Jahr, gleicher Vorjahreszeitraum,
  Monatszeiträume, Schaltjahr-Kappung (`29.02.` → `28.02.`).
- `analytics.test.ts` — Summe/Anzahl, Monats-/Jahres-/Unternehmens-/Depot-Gruppierung,
  bester Monat (inkl. Gleichstand → aktuellerer Monat), historische Summe, erste/letzte
  Zahlung, letzte Eingänge (stabile Sortierung), Durchschnitt pro Monat, Vergleichslogik
  (Prozent / „neu" / „beide 0" / „kein Vergleich"), laufendes vs. abgeschlossenes Jahr,
  Monatsvergleich, decimal-sichere Summe (0,1 + 0,2 = 0,30).
- `yearSelection.test.ts` — URL-Parameter: „all", gültige Jahre, sichere Rückfälle bei
  ungültigem Parameter.
- `KpiCards.test.tsx` — Render-Smoke mit echter Analytics-Verdrahtung (historische Summe,
  Ø-pro-Monat nur bei Einzeljahr, ausschüttende Unternehmen).

**Integration (`tests/integration/dashboard.test.ts`, benötigt lokale Postgres-DB):**
aktive Zahlungen des Nutzers, Ausschluss stornierter/archivierter Zahlungen, Einbeziehung
historischer Zahlungen archivierter Unternehmen, Summe nur über aktive Beträge,
Nutzerisolation (RLS).

**Kontroll-Fixture:** Der historische Import (1.439 Eingänge / 49.391,57 € netto) dient als
Test-Fixture; diese Werte werden **nicht** in der produktiven UI hartkodiert.

**Noch offen (keine Infrastruktur im Repo):** Ein Playwright-E2E-Setup existiert (noch) nicht;
die in der Phasen-Spezifikation gelisteten E2E-Fälle sind daher nicht als automatisierte Tests
ausgeführt. Die zugehörige Logik ist über Unit- und Integrationstests abgedeckt.

## Phase 5B — Statistik-Tests

**Unit (`tests/unit/lib/statistics`, `tests/unit/features/statistics`):**
- `statistics.test.ts` — Analytics-Aggregationen: Filter (`filterPayments`, UND-Verknüpfung,
  Jahr/Unternehmen/Depot/Quelle/Art), Übersicht (Summe, Distinct, Durchschnitte, bester
  Monat/bestes Jahr, erstes/letztes Datum), Jahresstatistik (Sortierung neueste zuerst, bester/
  schwächster Monat, Vorjahresvergleich inkl. fehlendem Vorjahr), Monatsstatistik (12 Monate,
  Entwicklung über Jahre), Unternehmensstatistik + vier Sortierkriterien (Summe/Anzahl/Name/
  letzte Zahlung), Depotstatistik (Jahres-/Monatsentwicklung), Heatmap, sowie ein
  Skalierungstest (≥ 10.000 Eingänge / ≥ 500 Unternehmen / mehrere Depots) auf Korrektheit
  und lineare Aggregation.
- `filterParams.test.ts` — URL-Parameter des Statistikfilters: Parsen gültiger/ungültiger Werte,
  Verwerfen unbekannter Enum-Werte und von Zukunftsjahren, Round-Trip Serialisierung↔Parsing,
  Erhalt nach Reload, Unversehrtheit fremder Parameter.
- `StatTable.test.tsx` — generische Tabelle: Ausgangsreihenfolge, Sortierung per Spaltenkopf
  (desc→asc), `initialSort`, Suche, Paginierung, Tastatur-Drill-down (`Enter`).
- `OverviewTab.test.tsx` — Render-Smoke des Übersichts-Unterbereichs mit echter
  Analytics-Verdrahtung über den Outlet-Kontext (historische Summe, Kernkennzahlen,
  Diagramm-Datentabelle).

**Integration (`tests/integration/statistics.test.ts`, benötigt lokale Postgres-DB):** SQL-Ebene
der Statistik-Datenbasis (identische Query wie `fetchDashboardPayments`): Jahres-, Unternehmens-
und Depotaggregation per `GROUP BY`, Einbeziehung archivierter Unternehmen/Depots über aktive
Zahlungen, Ausschluss stornierter (archivierter) Zahlungen, Nutzerisolation (RLS). Die
decimal-genaue Client-Aggregation ist über die Unit-Tests abgedeckt (Statistik-Abgleich §4).

**Noch offen (unverändert):** Es existiert weiterhin kein Playwright-E2E-Setup im Repo; die in
der Phasen-Spezifikation gelisteten E2E-Fälle (Drill-down-Summengleichheit, axe auf Chartseiten)
sind daher nicht als automatisierte E2E-Tests ausgeführt. Die zugehörige Logik ist über Unit-
und Integrationstests abgedeckt.
