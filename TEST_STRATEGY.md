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
