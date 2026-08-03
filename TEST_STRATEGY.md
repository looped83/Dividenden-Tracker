# TEST_STRATEGY.md — Dividend Tracker

Stand: 2026-07-29 · Status: Verbindliche Teststrategie

Werkzeuge: Vitest 4 (+ React Testing Library 16) · Playwright 1.56 (Chromium + WebKit) ·
reines PostgreSQL 16 für Integrations-, RLS- und Restore-Tests (DECISIONS.md D-027).

## 0. Tatsächlicher Stand (2026-07-29)

| Stufe | Umfang | Läuft in CI |
|---|---|---|
| Lint + Typecheck + Format | ESLint inkl. Geld-Verbotsliste, `tsc --noEmit` strict | ✅ Job `quality` |
| Unit (Vitest) | 708 Tests / 72 Dateien | ✅ Job `quality` |
| Integration (PostgreSQL 16) | 118 Tests: Constraints, Trigger, RLS, Import, Statistik, Ziele, Restore | ✅ Job `db-integration` |
| E2E öffentlich (Playwright) | 33 Tests: Rauchtests, axe und Telefonverhalten (Schriftgröße der Felder, kein seitlicher Überlauf, Pinch-Zoom bleibt erlaubt) | ✅ Job `e2e-smoke` |
| E2E angemeldet (Playwright + PostgreSQL) | 54 Tests je Projekt (Desktop + iPhone): die fünf Kernabläufe und axe auf allen Routen hinter der Anmeldung | ✅ Job `e2e-app` |

**Bekannte Lücken** — bewusst benannt statt stillschweigend hingenommen:

1. **Der Realdaten-Importtest läuft nicht in CI.** Die Datei enthält echte
   Finanzdaten und ist zu Recht nicht eingecheckt (`.gitignore`); die Suite
   überspringt sich selbst, wenn sie fehlt (12 Tests). Die Jahreskontrollwerte
   2012–2026 werden damit nie automatisch geprüft. Abhilfe wäre eine
   anonymisierte Fixture mit derselben Struktur. Der Importweg selbst ist seit
   Phase A im Browser abgedeckt (CSV-Assistent inkl. Commit und Rollback, §8.1),
   die **Kontrollsummen der echten Historie** sind es nicht.
2. **Registrierung und Passwortweg** laufen über echtes GoTrue (Bestätigungs-
   mails, PKCE-Links) und bleiben deshalb außerhalb der automatisierten Läufe;
   die Formulare selbst deckt der öffentliche Rauchtest ab.

Erledigt seit dem Audit: E2E hinter der Anmeldung (§8.1) und die dokumentierte
Restore-Probe (`docs/AUDIT_2026-07-29.md` §4.3).

Priorisierung siehe `docs/AUDIT_2026-07-29.md`, Abschnitt F.4.

---

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

**Exportformatierung** (`lib/backup/exportService`) — die **erzeugte Datei**: Spaltenwahl je
Bestand, aufgelöste Unternehmens-/Depotnamen, Beträge als Zahl und Datumsangaben als Datum in
XLSX, BOM und CRLF in CSV, Formula-Injection-Escaping (`=SUM(A1)` → `'=SUM(A1)`), Skalenerhalt
der Beträge, kanonische Checksummen der Sicherung

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

**Stand: Rauchtests umgesetzt** (`tests/e2e/smoke.spec.ts`, `npm run test:e2e`, im CI als
eigener Auftrag). Sie laufen gegen den **gebauten** Stand — `vite build` + `vite preview` über
`playwright.config.ts` — und decken die Fehlerklasse ab, die Unit-Tests nicht sehen können:
weiße Seite nach dem Bauen, kaputtes Nachladen der Bereiche, fehlendes Manifest, ins Startpaket
gerutschte schwere Abhängigkeit (Größenschwelle). Zwei Projekte: iPhone-Geometrie (im CI mit
WebKit, lokal mit Chromium) und Desktop-Chromium.

Alles, was ein Konto und Daten braucht, liegt seit Phase A in einer eigenen Suite (§8.1). Die
folgende Liste bleibt der Zielumfang; abgehakt ist, was dort tatsächlich läuft:

1. ✅ An-/Abmeldung inkl. abgewiesener Anmeldung — Registrierung und E-Mail-Bestätigung
   brauchen echtes GoTrue und bleiben offen
2. ✅ Manueller Dividendeneingang über das Formular (Depot, Unternehmen, Zahlungsdatum,
   Nettobetrag mit deutschem Komma-Format), Bearbeiten, Stornieren mit Grund, Reaktivieren —
   offen: endgültiges Löschen (D-034), Storno aus der Listenansicht
3. ✅ Dateiimport CSV (deutsches Format) über alle Assistentenschritte
4. ⬜ Duplikatprüfung: zweiter Import derselben Datei → Stufe-1-Warnung, Stufe-2/3-Klassifikation,
   Stufe-4-Einzelentscheidung
5. ✅ Importbestätigung mit Bilanzanzeige; Importbericht in Historie
6. ✅ Import-Rollback — offen: Bearbeitet-Warnung
7. ⬜ Filter/Suche/Sortierung der Zahlungsliste; mobile Kartenansicht (Filter bisher nur als
   axe-Zustand geprüft, nicht fachlich)
8. ⬜ Dashboard-Drill-down: Kennzahl → vorgefilterte Liste, Summengleichheit
9. ✅ Sicherung erstellen (Datei, Vollständigkeit, Integritätsblock, Sicherungsstand) —
   offen: Export CSV/XLSX und Restore mit Vorschau
10. ⬜ Ziele anlegen, Zielfortschritt
11. ✅ Beide Suiten laufen im iPhone-Projekt (im CI mit WebKit); Touch-Ziele und
    Formulareingabe deckt zusätzlich `tests/e2e/mobile.spec.ts` ab
12. ⬜ PWA: Offline-Banner, Lesecache nach Reload offline (Manifest-Check läuft)
13. ⬜ Excel-Import Unternehmen: Name/Ticker/ISIN/WKN sowie optionale Depot-/Broker-Spalte →
    Standard-Depot per Namensabgleich (D-035)

### 8.1 Angemeldete Abläufe gegen eine echte Datenbank

**Stand: umgesetzt** (`tests/e2e/app/`, `playwright.app.config.ts`, `npm run test:e2e:app`,
im CI als Job `e2e-app`). 38 Tests je Projekt, Desktop-Chromium und iPhone (im CI WebKit).

Aufbau — bewusst ohne Attrappen:

- **Datenbank:** dieselbe Testdatenbank wie die Integrationstests, aufgebaut aus
  `supabase/migrations` (`npm run db:test:reset`).
- **Brücke:** `tests/e2e/support/bridge.ts` übersetzt die HTTP-Aufrufe von supabase-js in SQL
  und führt sie mit `set local role authenticated` plus JWT-Claims aus — wie PostgREST. RLS,
  Constraints, Trigger und die RPCs (`archive_payment`, `commit_import`, `rollback_import`)
  laufen damit echt. Was die Brücke nicht kennt, beantwortet sie mit **501**, statt einen
  Filter stillschweigend zu ignorieren (D-8-2).
- **Konto je Test:** jeder Test legt sein eigenes Konto samt Depot und Unternehmen an; die
  echte RLS trennt die Tests, sodass sie parallel laufen können.
- **Sitzung:** wird als fertiges supabase-js-Sitzungsobjekt im `localStorage` hinterlegt; nur
  `anmeldung.spec.ts` geht durch das Formular.

Abgedeckte Abläufe: Erfassen, Bearbeiten, Stornieren/Reaktivieren, CSV-Import mit Rollback,
Sicherung erstellen — dazu An-/Abmeldung und axe (§9).

## 9. Accessibility-Tests

**Stand: umgesetzt für die kontofreien Routen** (`tests/e2e/accessibility.spec.ts`):
axe-core über `@axe-core/playwright` auf Anmelden, Registrieren und Passwort-vergessen, jeweils
**hell und dunkel** (Kontraste stammen je Theme aus eigenen Tokens), geprüft gegen WCAG 2.0/2.1
Stufe A und AA sowie 2.2 Stufe AA. Ein Fund nennt Regel, Beschreibung und betroffenes Element.

**Hinter der Anmeldung ebenfalls umgesetzt** (`tests/e2e/app/barrierefreiheit.spec.ts`): alle
sechzehn angemeldeten Routen in hell und dunkel, dazu die Zustände, in denen Barrierefreiheit
erfahrungsgemäß bricht — geöffneter Dialog, gesetzte Filter, eingeblendete Rückmeldung und der
Fehlerzustand „nicht gefunden". Die Filterprüfung weist zuerst nach, dass die Filter greifen,
bevor sie misst; sonst prüfte sie eine Liste, die sie gar nicht gemeint hat.

**Das Theme steht fest, bevor die Seite geladen wird** — nie im laufenden Bild umgeschaltet.
Das ist eine bewusste Festlegung mit Vorgeschichte, damit sie nicht versehentlich rückgängig
gemacht wird:

Der Versuch, hell und dunkel in *einem* Test zu messen (`emulateMedia` nach dem Laden), spart je
Route einen Seitenaufbau und wurde deshalb umgesetzt — er scheiterte zweimal:

1. In Chromium meldete axe Kontrastfehler auf wechselnden Routen, weil `button` über
   `transition-colors` umfärbt und mitten im 150-ms-Übergang gemessen wurde. `reducedMotion`
   löste das (`styles/index.css` schaltet die Übergänge dann ab).
2. In WebKit blieben Kontrastfehler auf Überschriften, Beschriftungen und Eingabefeldern —
   **reproduzierbar, mit identischer Fundliste über Versuch und Wiederholung**, also kein
   Zeitproblem. Ein nachträglich geändertes `color-scheme` löst dort offenbar nicht alle Farben
   neu auf; der Endzustand ist ein anderer als bei einem frischen Dunkel-Start. Warten hilft
   dagegen nicht.

Ein Neuladen für den zweiten Durchgang wäre korrekt gewesen, kostete aber genau die Ersparnis,
um die es ging (gemessen: 89 s → 84 s angemeldet, öffentlich sogar 24 s → 30 s). Deshalb bleibt
es bei einem Test je Route und Theme.

Auch `reducedMotion` ist wieder entfallen: Es war die Absicherung gegen Farbübergänge beim
Umschalten und mit dem Umschaltweg überflüssig. Beibehalten schadete sogar — in WebKit meldete
axe damit auf der Anmeldeseite in Dunkel reproduzierbar Kontrastfehler auf `p` und `span`, die
ohne die Emulation nicht auftreten. Was die Anwendung unter reduzierter Bewegung darstellt,
gehört eigenständig geprüft (siehe manuelle Liste unten), nicht als Nebenwirkung einer
Messvorbereitung.

Die Zusicherung auf die Klasse `dark` (`erwarteTheme`) bleibt in jedem Test: Ohne sie prüfte ein
nicht greifendes Theme unbemerkt zweimal dasselbe Bild — ein Test, der bestätigt, was er nie
gemessen hat.

Die geprüften Stufen und die Auswertung stehen an einer Stelle (`tests/e2e/support/axe.ts`),
damit die öffentliche und die angemeldete Prüfung nicht auseinanderlaufen.

**WCAG 2.2 (`wcag22aa`) ist eingeschlossen.** In axe-core 4.12 steckt dahinter genau eine Regel:
`target-size` (2.5.8, Mindestgröße von Bedienelementen). Sie gibt gerade dem iPhone-Projekt einen
eigenen Zweck, der über die Wiederholung der Desktop-Prüfung hinausgeht. Nachgewiesen ist, dass
die Regel tatsächlich läuft und nicht nur getaggt ist (`passes`, nicht `inapplicable`).

Nicht automatisiert und weiterhin Sache der Checkliste: Tastaturbedienung über ganze Abläufe,
Screenreader-Ausgabe, 200-%-Zoom, Reduced Motion.

**Manuelle Prüfliste je Release:**

- Tastaturbedienung: komplette Kernflüsse (Erfassung, Import, Filter) ohne Maus; sichtbarer
  Fokus auf jedem Bedienelement
- Screenreader: aria-labels für Symbole, Tabellen-Header-Zuordnung, Ansage des Bereichswechsels
  (`RouteAnnouncer`) und Fokus im Inhalt nach dem Navigieren
- Diagrammalternativen: jede Grafik mit Datentabelle-Umschalter/textueller Zusammenfassung
- Reduced Motion: `prefers-reduced-motion` deaktiviert Übergänge/Chart-Animationen
- Zoom 200 % ohne Funktionsverlust; Touch-Ziele ≥ 44×44 pt

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

**Noch offen:** Das Playwright-Setup steht (§8), deckt aber nur die kontofreien Rauchtests ab.
Die in der Phasen-Spezifikation gelisteten E2E-Fälle brauchen einen Auth-Testmodus und sind
weiterhin über Unit- und Integrationstests abgedeckt.

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
- `PaymentsHeatmap.test.tsx` — Heatmap-Zellen: Ein Monat **ohne** Zahlungen nennt seinen Wert
  als Text (er stand zuvor in einem `aria-label` auf einem `div` und wurde dort nicht
  vorgelesen), ein Monat **mit** Zahlungen ist bedienbar und benannt, und nur er.
- `comparison.test.ts` — Zeitraumvergleich (CALCULATION_RULES.md §11.10). Schwerpunkt
  **Teiljahr**, weil dort der teuerste Fehler dieser Auswertungsart sitzt: Kappung in beide
  Richtungen (laufendes Jahr im Vordergrund **und** als Vergleichsseite), 250 € gegen 200 €
  statt gegen die vollen 400 €, volle Jahre ungekappt, 29.02. gegen ein Nicht-Schaltjahr,
  Zahlung genau am Stichtag bzw. einen Tag danach, Nullmonate, negative Korrekturen,
  Summengleichheit von Monatswerten und kumuliertem Verlauf zur Periodensumme, rollierende
  Zwölfmonatsfenster über den Jahreswechsel, sowie die Kennzeichnung angeschnittener Monate.
  Für den **Monatsvergleich** zusätzlich: Kappung des laufenden Monats auf beiden Seiten,
  Stichtag jenseits der Monatslänge (31. im Februar), Aufschlüsselung nach Unternehmen inklusive
  eines Unternehmens, das nur auf einer Seite zahlt, und Summengleichheit der Zeilen zur
  Monatssumme.
- `comparisonParams.test.ts` — URL-Zustand des Vergleichs (`?modus=&basis=&referenz=`):
  Vorgaben, Verwerfen nicht wählbarer Jahre, kein Jahr gegen sich selbst, Round-Trip.
- `ComparisonTab.test.tsx` — Oberfläche des Vergleichs bei festgesetztem Systemdatum: benannter
  Stichtag, Zeiträume je Seite, Drill-down nur für vollständige Monate (der angeschnittene
  Monat trägt **keinen** Link, DECISIONS.md D-7-2), Übernahme des Unternehmensfilters ins
  Drill-down-Ziel, Moduswechsel und der Hinweis, dass der Jahresfilter hier nicht wirkt. Für den
  Monatsvergleich: Aufschlüsselung nach Unternehmen statt nach Monaten, Drill-down auf
  Unternehmen + Jahr + Monat, benannte Kappung des laufenden Monats, und dass ein noch nicht
  begonnener Monat gar nicht erst zur Auswahl steht.

**Integration (`tests/integration/statistics.test.ts`, benötigt lokale Postgres-DB):** SQL-Ebene
der Statistik-Datenbasis (identische Query wie `fetchDashboardPayments`): Jahres-, Unternehmens-
und Depotaggregation per `GROUP BY`, Einbeziehung archivierter Unternehmen/Depots über aktive
Zahlungen, Ausschluss stornierter (archivierter) Zahlungen, Nutzerisolation (RLS). Die
decimal-genaue Client-Aggregation ist über die Unit-Tests abgedeckt (Statistik-Abgleich §4).

**Noch offen:** Die Rauchtests (§8) kommen ohne Konto aus; Drill-down-Summengleichheit und axe
auf den Diagrammseiten brauchen angemeldete Sitzungen und sind daher weiterhin über Unit- und
Integrationstests abgedeckt.

## Phase 6 – Ergänzte Tests

**Unit:** Zahlungsdatum-Validierung inkl. Zukunfts-/1970-Ablehnung; decimal-
sichere Betragsprüfung (0, negativ, > 2 Nachkommastellen, NaN/Infinity/Exponent,
Bereich); Notizlänge; Listen-Parameter (Status/Quelle/Sortierung, sichere
Defaults bei ungültigen Werten); stabile Sortierung; Dublettenerkennung (hohe
Wahrscheinlichkeit vs. mögliche Dublette, legitime Tranche, Ausblenden
stornierter/verworfener Paare, keine automatische Löschung); Auffälligkeitsregeln.

**Integration/RLS:** Löschen eigener aktiver **und** stornierter Eingänge;
fremde Zeilen unlöschbar; atomares Audit (`action='delete'`); Einzellöschung
importierter Eingänge (Importlauf + übrige Zeilen erhalten, `import_rows`
entkoppelt); `duplicate_dismissals`-RLS (nur eigene, fremde `user_id` abgewiesen).
Bestehender „kein aktives Löschen"-Test auf die neue Policy (D-6-1) umgestellt.

---

## Phase 7 — Ziele und Fortschritt

**Unit (`tests/unit/lib/goals`, `tests/unit/features/goals`).** Zielzeiträume
(Jahr/Monat, Schaltjahr, Februar), Zeitstatus und Zeitfortschritt (inkl. Tag),
Fortschritt < / = / > 100 %, Rest- und Überschreitungsbetrag, Zielstatus
(bevorstehend/aktiv/erreicht/übertroffen/beendet-nicht-erreicht), Berechnungs­
grundlage (nur Zahlungen im Zeitraum, fachliches Datum), keine Hochrechnung,
stabile Sortierung, Formular-Validierung (Betrag > 0, Jahr-Grenzen, Monat/
Zielart-Konsistenz), Anzeige-/Drill-down-Beschriftungen. Komponententest der
`GoalCard` (Progressbar mit `aria-valuenow`/`aria-valuetext`, visuelle
100 %-Begrenzung, Zustände).

**Integration (`tests/integration/goals.test.ts`).** Anlegen von Jahres-/
Monatszielen, DB-Constraints (Monat/Zielart-Konsistenz, Betrag > 0, ungültiger
Monat), Eindeutigkeit (`goals_unique_period`), decimal-sichere Speicherung,
Bearbeiten, Löschen ohne Veränderung von Dividendeneingängen, RLS-Isolation
(kein Lesen/Ändern/Löschen fremder Ziele über direkte ID, kein anon-Zugriff,
user_id nicht fremdsetzbar) und Audit (insert/update/delete). `constraints.test.ts`
prüft zusätzlich die Eindeutigkeit auf DB-Ebene.

**E2E-Szenarien (Auftrag §39).** Es existiert kein Browser-E2E-Harness
(Playwright) im Projekt; die geforderten Abläufe (Anlegen, doppeltes Ziel
verhindern, Bearbeiten, Löschen, Zahlungswirkung, Storno/Reaktivierung/Löschung,
historisches Ziel, Nutzerisolation) sind auf Unit-/Komponenten- und
Integrationsebene abgedeckt. Ein echter Browser-Durchlauf bleibt manuell bzw.
für eine spätere Playwright-Einführung offen (siehe Abschlussbericht).
