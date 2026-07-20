# IMPLEMENTATION_PLAN.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindlicher Phasenplan (Planungsphase)

Regeln: Jede Phase ist klein, einzeln überprüfbar und endet mit erfüllten Abnahmekriterien,
bevor die nächste beginnt. Die 15 Produktgrundsätze (PRODUCT_SPEC.md §3) gelten als ständige
Abnahmekriterien. Tests der Phase laufen ab dann dauerhaft in CI.

---

## Phase 1 — Projektgrundlage und Designsystem

> ✅ **Umgesetzt** (siehe README.md Status-Zeile, DECISIONS.md D-021 ff.).

- **Ziel:** Lauffähiges, getestetes Projektskelett mit Designsystem, ohne Fachlogik.
- **Scope:** Vite+React+TS-strict-Setup, Tailwind 4, shadcn/ui-Basis, Design-Tokens
  (hell/dunkel), Routing-Gerüst mit 9 Bereichen (Platzhalter), responsive App-Shell
  (Sidebar/Bottom-Nav), Lint/Format/CI-Pipeline, `lib/money`-Grundgerüst mit Decimal.js.
- **Betroffene Komponenten:** App-Shell, Navigation, Theme, `AmountText`, `StatCard`
  (statisch), EmptyStates.
- **Betroffene Dateien:** `package.json` (gepinnte Versionen ARCHITECTURE.md §2), `vite.config.ts`,
  `tsconfig.json` (strict), `src/app/*`, `src/components/ui/*`, `src/lib/money/*`,
  `.github/workflows/ci.yml`, ESLint-Konfiguration inkl. Geld-Verbotsliste.
- **Datenbankänderungen:** keine.
- **Sicherheitsauswirkungen:** CSP-Header im Dev-/Preview-Setup vorbereitet; `.env.example`,
  gitleaks-CI-Check.
- **Tests:** Unit-Tests `lib/money` (R-Regeln-Grundfälle), Lint-Regel-Tests (parseFloat-Verbot
  schlägt an), Snapshot der App-Shell in drei Viewports.
- **Abnahmekriterien:** CI grün; App startet; Navigation in allen drei Layoutvarianten
  bedienbar; Dark Mode umschaltbar; keine Konsolen-Fehler.
- **Bekannte Risiken:** Versionsinkompatibilitäten (Vite 8/Vitest 4/Tailwind 4) — früh durch
  das Setup selbst getestet; SheetJS-Bezug (K-4) hier bereits verifizieren.
- **Explizite Nicht-Ziele:** keine Supabase-Anbindung, keine echten Daten, keine PWA.
- **Voraussetzung für die nächste Phase:** stabile CI + Designsystem-Basis abgenommen.

## Phase 2 — Supabase, Auth und Datenbank

> ✅ **Umgesetzt** und gegen ein echtes Supabase-Projekt in Betrieb (GitHub Pages, D-030).
> `database.types.ts` bleibt handgepflegt (D-028, O-7 offen).

- **Ziel:** Vollständiges Schema mit RLS, Audit-Triggern und Auth-Flows.
- **Scope:** Supabase-CLI-Setup (lokal + Projekt), alle Migrationen aus DATA_MODEL.md
  (Enums, Tabellen, Trigger, Views, Policies), Typen-Generierung, Registrierung/Login/Logout/
  Passwort-Reset, Session-Handling, Route-Guards, Profilanlage.
- **Betroffene Komponenten:** Auth-Seiten, `lib/supabase`, Provider/Guards.
- **Betroffene Dateien:** `supabase/migrations/0001…000N.sql`, `supabase/config.toml`,
  `src/lib/supabase/*`, `src/features/auth/*`, `tests/integration/*`.
- **Datenbankänderungen:** komplettes Grundschema inkl. `audit_log`, RLS auf allen Tabellen.
- **Sicherheitsauswirkungen:** maximal — RLS-Policies, Grants, `enforce_user_id`,
  insert-only-Audit; Migration-Checkliste (SECURITY_MODEL.md §4) etabliert.
- **Tests:** komplette RLS-Suite mit 2 Nutzern (SECURITY_MODEL.md §10), Constraint-/Trigger-
  Tests (TEST_STRATEGY.md §5), Auth-E2E (Registrierung/Login).
- **Abnahmekriterien:** alle Sicherheitstests grün und CI-blockierend; anon hat keinerlei
  Zugriff; Migrationen laufen auf leerer + Seed-DB; Typen diff-frei.
- **Bekannte Risiken:** RLS-Feinheiten bei Views/RPCs (security_invoker) — durch Tests §10
  abgedeckt; Auth-E-Mail-Zustellung (lokaler Testmodus nutzen).
- **Explizite Nicht-Ziele:** keine fachlichen UI-Flows, keine RPCs für Import/Restore
  (nur Gerüst `archive_payment`).
- **Voraussetzung:** Sicherheitstestsuite dauerhaft in CI verankert.

## Phase 3 — Stammdaten und manuelle Dividendeneingänge

> ✅ **Umgesetzt und live** (Stand 2026-07-19). Abweichungen vom ursprünglichen Scope:
> - Kein `PaymentCardList` (mobile Kartenansicht) und keine Virtualisierung — die Zahlungsliste
>   ist bislang eine einfache Tabelle ohne Performance-Test bei 10.000 Zeilen (siehe unten).
> - Kein separates `FilterBar`-Sheet für iPhone; Filter sind Desktop-Inline-Selects.
> - Zusätzlich, vorgezogen aus Phase 4: Excel-Import für Unternehmens-Stammdaten
>   (Name/Ticker/ISIN/WKN, optional Depot-/Broker-Spalte → `default_depot_id` per
>   Namensabgleich, `src/features/securities/xlsxImport.ts`, DECISIONS.md D-032/D-035) —
>   kein vollständiger Import-Assistent, keine Dividendeneingänge, keine Duplikaterkennung.
> - **Nachträglich vereinfacht (Nutzerwunsch nach Live-Test):** Das manuelle
>   Erfassungsformular für Dividendeneingänge erfasst nur noch Depot, Unternehmen,
>   Zahlungsdatum und Nettobetrag (kein Fremdwährungs-Umschalter, keine Steuerfelder, kein
>   Stückzahl-/Notizfeld im Formular mehr). Bruttobetrag = Nettobetrag, Steuern = 0,
>   `original_currency` = Depot-Basiswährung werden programmatisch gesetzt; die DB-Spalten
>   selbst bestehen unverändert fort (DATA_DICTIONARY.md §9). Der Nettobetrag akzeptiert
>   deutsches Zahlenformat mit Komma (`src/lib/money/germanDecimalInput.ts`).
> - **Nachträglich ergänzt:** Endgültiges Löschen eines Dividendeneingangs, aber nur wenn
>   bereits archiviert (enge Ausnahme vom „kein Hard Delete"-Grundsatz, DECISIONS.md D-034);
>   Archivieren/Reaktivieren zusätzlich direkt aus der Listenansicht, nicht nur der
>   Detailseite; optionales „Standard-Depot" an Unternehmen als Vorbelegungshilfe
>   (DECISIONS.md D-035); Fix eines `search_path`-Fehlers, der `archive_payment()` auf dem
>   echten Supabase-Projekt fehlschlagen ließ (DECISIONS.md D-036).
> - **Nicht erfüllt:** 10.000-Zeilen-Performancetest, E2E-Testsuite gegen echtes Supabase
>   (nur Unit-Tests + manuelles Testen durch den Nutzer gegen das echte Projekt).
>
> **Bekannter offener Fehler:** Neu registrierte Nutzer erhalten über den
> `on_auth_user_created`-Trigger automatisch eine `profiles`-Zeile; für Nutzer, die vor dem
> Anlegen der Migrationen bereits existierten, musste das Profil einmalig per Hand
> nachgetragen werden (siehe Chatverlauf 2026-07-19). Kein Code-Fehler, aber bei künftigen
> Migrationen auf einem bereits befüllten Projekt zu beachten.

- **Ziel:** Vollwertige manuelle Erfassung, Bearbeitung (auditiert), Storno/Archivierung,
  Listen- und Detailansichten; die App ist erstmals täglich nutzbar.
- **Scope:** CRUD (ohne Delete) für Depots, Portfolios, Wertpapiere; vereinfachtes
  Zahlungsformular (Depot, Unternehmen, Zahlungsdatum, Nettobetrag — siehe Abweichungen oben);
  Zahlungsliste (Tabelle/Karten) mit Suche, Sortierung, allen Filtern; Detailansicht mit
  `AuditTrail` und Herkunft; `archive_payment` sowie eine eng begrenzte
  Hard-Delete-Ausnahme für bereits archivierte Zahlungen (D-034).
- **Betroffene Komponenten:** `PaymentTable`/`PaymentCardList`, `FilterBar`, Formulare,
  `AuditTrail`, Unternehmens- und Depotseiten (Stammdaten + einfache Historienliste).
- **Betroffene Dateien:** `src/features/payments|securities|depots/*`, `src/lib/statistics/*`
  (Basissummen), Zod-Schemata.
- **Datenbankänderungen:** ggf. Feinschliff-Migrationen (Indizes), RPC `archive_payment` final.
- **Sicherheitsauswirkungen:** unveränderliche Felder (`protect_payment_immutables`) aktiv;
  Audit-Diffs verifiziert.
- **Tests:** Unit (Formular-Schemata, deutsches Zahlenformat), Integration (Audit-Diff, Soft
  Delete, Hard-Delete-Ausnahme, Fingerprint-Trigger), E2E (Erfassung, Bearbeitung mit Verlauf,
  Storno/Archivierung, endgültiges Löschen), RLS-Ergänzungen.
- **Abnahmekriterien:** Grundsätze 1–3, 7, 9 nachweisbar erfüllt (Audit-Verlauf in der UI
  sichtbar); Liste mit 10.000 Seed-Zahlungen flüssig; mobile Erfassung < 30 s für
  Standardfall.
- **Bekannte Risiken:** Performance großer Listen (virtualisiertes Rendering einplanen);
  Komplexität Fremdwährungsformular — durch feste UX (Umschalter) begrenzt.
- **Explizite Nicht-Ziele:** kein Import, keine Statistik-Kennzahlen über Basissummen hinaus,
  keine Ziele.
- **Voraussetzung:** stabile Erfassung + Audit als Fundament für Import-Vergleiche.

## Phase 4 — CSV- und Excel-Import

> **Hinweis:** Der Unternehmens-Stammdaten-Import (Name/Ticker/ISIN/WKN) wurde bereits in
> Phase 3 vorgezogen (`src/features/securities/xlsxImport.ts`, `exceljs`). Diese Phase betrifft
> ausschließlich den Import von Dividendeneingängen inkl. Bilanz, Duplikaterkennung und
> Rollback — die SheetJS-vs-Alternative-Entscheidung (O-1) ist davon unabhängig und noch offen.

- **Ziel:** Vollständiger Import-Assistent gemäß IMPORT_SPEC.md inkl. Bilanz, vierstufiger
  Duplikaterkennung, atomarem Commit und Rollback.
- **Scope:** Web Worker (Parsing/Normalisierung/Fingerprints), 25-Schritte-Assistent,
  Mapping-Vorlagen, `commit_import`- und `rollback_import`-RPCs, Importhistorie + Bericht.
- **Betroffene Komponenten:** `ImportWizard`, `BalanceSummary`, Duplikat-Vergleichsansicht,
  Importe-Bereich.
- **Betroffene Dateien:** `src/workers/import.worker.ts`, `src/lib/parsing/*`,
  `src/lib/fingerprint/*`, `src/features/imports/*`, Migration für RPCs,
  `tests/fixtures/*` (umfangreich).
- **Datenbankänderungen:** RPCs `commit_import`/`rollback_import`, Index-Feinschliff
  (`business_fingerprint`, `row_fingerprint`).
- **Sicherheitsauswirkungen:** Datei-Härtung (Magic Bytes, Limits, Worker-Timeout), Formula-
  Injection-Regeln, serverseitige Zweitvalidierung der Bilanz.
- **Tests:** komplette Importtestsuite (TEST_STRATEGY.md §3) inkl. Bilanz-Property-Test,
  Fingerprint-Testvektoren Client↔SQL, E2E Import/Duplikate/Rollback, RLS für neue RPCs.
- **Abnahmekriterien:** Grundsätze 4, 5, 10, 11 nachweisbar; 50.000-Zeilen-Fixture ohne
  UI-Blockade; Bilanz geht für jede Fixture auf; Rollback stellt Vorzustand exakt her.
- **Bekannte Risiken:** Format-Wildwuchs realer Dateien → früh mit echten (anonymisierten)
  Numbers-Exports testen; XLS-Altformat nur best effort (klare Fehlermeldung akzeptiert).
- **Explizite Nicht-Ziele:** keine Migration selbst (Phase 8), keine PDF-Erkennung.
- **Voraussetzung:** Importbilanz + Rollback abgenommen — Basis für alle Datenübernahmen.

## Phase 5 — Dashboard und Statistiken

- **Ziel:** Übersicht und Statistikbereich mit allen Kennzahlen 6.1–6.19 inkl. Drill-down.
- **Scope:** `lib/statistics` vollständig, `v_stats_*`-Views, Dashboard (StatCards, Monats-/
  Jahres-Charts), Statistikseiten (Vergleiche, Aufteilungen, Steuern, Konzentration),
  Unternehmens-/Depotstatistiken, Drill-down-Verdrahtung.
- **Betroffene Komponenten:** `ChartPanel`, `StatCard` (live), Statistik-Routen,
  Unternehmens-/Depot-Detailseiten.
- **Betroffene Dateien:** `src/lib/statistics/*`, `src/features/dashboard|statistics/*`,
  Migration für Views.
- **Datenbankänderungen:** Statistik-Views (`security_invoker`).
- **Sicherheitsauswirkungen:** Views RLS-transparent (Test §10.10).
- **Tests:** Unit je Kennzahl inkl. Randfälle (Teiljahr, fehlendes Vorjahr, negative
  Korrekturen, Nullmonate), View↔Client-Abgleich (§4), E2E Drill-down-Summengleichheit,
  axe auf Chartseiten.
- **Abnahmekriterien:** Grundsatz 6 nachweisbar (jede Kennzahl → gefilterte Liste mit
  identischer Summe); Kennzahlen entsprechen exakt CALCULATION_RULES.md; Diagramme mit
  Datentabellen-Alternative.
- **Bekannte Risiken:** schleichende Divergenz Client↔SQL — dauerhafter Abgleichtest;
  Chart-Performance bei langen Historien (Aggregation vor Rendern).
- **Explizite Nicht-Ziele:** keine Prognosen/erwarteten Werte (Grundsatz 8), keine Ziele-UI.
- **Voraussetzung:** Kennzahlfundament für Ziele und Migration-Abgleich.

## Phase 6 — Ziele

- **Ziel:** Zielverwaltung und Zielerreichung (Kennzahl 6.20) strikt getrennt von Ist-Daten.
- **Scope:** CRUD Ziele (5 Typen), `GoalProgress` im Dashboard und Zielebereich,
  Jahresübersicht der Zielerreichung.
- **Betroffene Komponenten:** `src/features/goals/*`, `GoalProgress`.
- **Datenbankänderungen:** `goals`-Tabelle war Phase 2; ggf. Constraint-Feinschliff.
- **Sicherheitsauswirkungen:** Standard-RLS; Audit für Ziele.
- **Tests:** Unit 6.20 (alle Zieltypen, >100 %, ohne Daten), Integration (Unique aktive
  Ziele), E2E (Ziel anlegen → Fortschritt korrekt), RLS.
- **Abnahmekriterien:** Ziele ohne jede Rückwirkung auf Zahlungsdaten (getrennte Tabelle,
  kein Join beim Schreiben); keine prognostizierten Einzelzahlungen irgendwo.
- **Bekannte Risiken:** gering; Versuchung „erwartete Zielerreichung" — bewusst nicht bauen.
- **Explizite Nicht-Ziele:** keine Prognose-, Kalender- oder Erwartungsfunktionen.
- **Voraussetzung:** keine (parallelisierbar nach Phase 5); Abschluss vor Phase 8 empfohlen.

## Phase 7 — Backup, Export und Restore

- **Ziel:** Vollständige Datensicherung gemäß BACKUP_AND_RESTORE.md.
- **Scope:** JSON-Vollexport mit Integritätsblock, CSV-/XLSX-Exporte, Backup-Validierung,
  Restore-Vorschau, `restore_backup`-RPC (full/merge), Backup-Erinnerung + Statusanzeige.
- **Betroffene Komponenten:** `src/features/backup/*`, `src/lib/export/*`, Einstellungen.
- **Datenbankänderungen:** RPC `restore_backup`; `profiles.last_backup_at`-Pflege.
- **Sicherheitsauswirkungen:** Formula-Injection-Escaping produktiv; Restore ersetzt nie
  stillschweigend (Archivierungspfad); Fremd-`user_id`s im Backup neutralisiert.
- **Tests:** komplette Backup-Suite (TEST_STRATEGY.md §7) inkl. Roundtrip, beschädigt,
  Altversion, Idempotenz, Merge-Konflikte; E2E Export+Restore.
- **Abnahmekriterien:** Grundsatz 12 nachweisbar; Roundtrip feldgenau; kein Restore-Pfad
  ohne Vorschau und Validierung.
- **Bekannte Risiken:** iOS-Download-/Share-Eigenheiten (früh auf echtem Gerät testen);
  Formatversionierung diszipliniert halten (Adapter + archivierte Beispieldateien).
- **Explizite Nicht-Ziele:** keine automatischen Cloud-Backups zu Drittdiensten.
- **Voraussetzung:** Backup verfügbar **vor** der Migration (Sicherheitsnetz).

## Phase 8 — Kontrollierte Numbers-Migration

- **Ziel:** Produktivübernahme der historischen Daten gemäß MIGRATION_PLAN.md.
- **Scope:** Mapping-Vorlage für Numbers-Exporte, jahrweise Importe, Abgleich-Ansicht
  (Kontrollsummen Import ↔ Statistik), Abweichungsprotokoll, Parallelphase, finaler
  Gesamtexport; kleinere App-Nachbesserungen aus realen Datenfunden.
- **Betroffene Komponenten:** Importe-/Statistik-Bereiche (Nutzung), ggf. Feinschliff.
- **Betroffene Dateien:** keine strukturellen; `MIGRATION_LOG.md` (privat, außerhalb Repo).
- **Datenbankänderungen:** keine geplanten.
- **Sicherheitsauswirkungen:** keine neuen Flächen; reale Daten → Backup-Disziplin ab sofort.
- **Tests:** keine neuen automatisierten (bestehende Suiten laufen); manuelle Abnahme je Jahr
  nach MIGRATION_PLAN.md §3.
- **Abnahmekriterien:** alle Jahre einzeln abgenommen (Checkliste), Parallelphase bestanden
  (≥ 8 Wochen ohne unerklärte Differenz), Numbers schreibgeschützt archiviert.
- **Bekannte Risiken:** reale Datenqualität (uneinheitliche Namen, Alt-Duplikate) — Prozess
  sieht Dokumentation statt stiller Bereinigung vor; Zeitbedarf pro Jahr nicht unterschätzen.
- **Explizite Nicht-Ziele:** keine „schnelle Komplettübernahme in einem Import".
- **Voraussetzung:** erfolgreiche Migration macht die App zur Golden Source (Betriebsphase).

## Phase 9 — PWA und mobile Optimierung

- **Ziel:** Installierbare PWA mit Offline-Lesecache und geschliffener Mobil-UX.
- **Scope:** vite-plugin-pwa (Manifest, Precache, Update-Prompt), TanStack-Query-Persist
  (IndexedDB, sessiongebunden), Offline-Banner + deaktivierte Schreibpfade, iOS-Feinschliff
  (Splash, Statusbar, Safe Areas), Performance-Pass mobil (Bundle-Split je Route).
- **Betroffene Komponenten:** Service-Worker-Konfiguration, App-Shell, Query-Provider.
- **Datenbankänderungen:** keine.
- **Sicherheitsauswirkungen:** kein SW-Caching von API-Antworten (ARCHITECTURE.md §6);
  Cache-Löschung bei Logout verifiziert.
- **Tests:** E2E PWA (Manifest, Offline-Banner, Lesecache offline nach Reload), Lighthouse-
  PWA-/Performance-Budget in CI (mobil ≥ 90 Performance auf Kernrouten), manuelle Tests auf
  echtem iPhone/iPad (Installation, Dateien-Import, Orientierungen).
- **Abnahmekriterien:** Installation auf iPhone/iPad/Mac funktioniert; Offline-Ansicht der
  letzten Daten; kein Datenverlust-Szenario durch Cache (Cache jederzeit löschbar).
- **Bekannte Risiken:** iOS-PWA-Eigenheiten (Storage-Eviction, Update-Verhalten) — Nur-Cache-
  Prinzip minimiert Folgen; Update-Prompt-UX sorgfältig testen.
- **Explizite Nicht-Ziele:** keine Offline-Schreibwarteschlange (D-011), keine Push-Nachrichten.
- **Voraussetzung:** stabile PWA vor dem Produktionsaudit.

## Phase 10 — Accessibility, Performance und Produktionsaudit

- **Ziel:** Nachweisbare Produktionsreife.
- **Scope:** vollständiger Accessibility-Pass (TEST_STRATEGY.md §9 inkl. manueller
  Screenreader-Prüfung VoiceOver Mac/iOS), Performance-Feinschliff (Virtualisierung,
  Query-Tuning, Bundle-Analyse), Sicherheitsaudit (CSP live, Header, `npm audit`, gitleaks,
  RLS-Suite-Review, Supabase-Konfig-Review: Auth-Limits, E-Mail-Templates), Dokumentations-
  abgleich (alle Spezifikationen ↔ Implementierung), Betriebs-Runbook (Deployment, Restore-
  Probe, Update-Prozess).
- **Betroffene Komponenten:** querschnittlich.
- **Datenbankänderungen:** keine geplanten; ggf. Index-Nachschärfung aus Messungen.
- **Sicherheitsauswirkungen:** abschließende Härtung; dokumentierter Audit-Bericht.
- **Tests:** axe ohne Verstöße auf allen Routen (beide Themes), Tastatur-E2E, Lighthouse-
  Budgets, Lasttest der Listen (10k+), komplette Restore-Probe aus echtem Backup auf
  frischem Konto.
- **Abnahmekriterien:** alle Suiten grün; Audit-Checkliste vollständig; eine erfolgreiche
  Restore-Probe dokumentiert; offene Punkte ausdrücklich ins Backlog überführt.
- **Bekannte Risiken:** „Audit-Müdigkeit" nach Migration — fester Zeitrahmen und Checklisten.
- **Explizite Nicht-Ziele:** keine neuen Features.
- **Voraussetzung für Folgearbeit:** Betriebsphase; Upgrade-Fenster (z. B. TypeScript 7,
  D-013) erst danach.

---

## Phasenübergreifende Definition of Done

- CI grün (Lint, Typecheck, Unit, Integration inkl. RLS, E2E der Phase)
- Neue Tabellen/RPCs: Migration-Checkliste SECURITY_MODEL.md §4 abgehakt
- Kennzahlen/Geldpfade: Regeln aus CALCULATION_RULES.md referenziert und getestet
- Dokumentation aktualisiert (Spec-Abweichungen in DECISIONS.md nachgetragen)
- Keine offenen TODO-Kommentare in gemergtem Code

---

## Phase 4 — Status: umgesetzt

- Migration `0016_import_phase4.sql` (Herkunftsspalten, `security_aliases`,
  `import_rows`, `commit_import`, `rollback_import`, `guard_import_status`).
- Import-Pipeline `src/lib/import/*` (Excel/CSV-Parsing, Datums-/Betrags-/Namens-
  Normalisierung, konservatives Matching A–D, Alias, Broker, Fingerprint,
  Dublettenmarkierung, Decimal-Kontrollsummen, RPC-Nutzlast).
- Wizard `src/features/imports/ImportWizard.tsx` + `ImportsPage.tsx`
  (Drag-and-drop, Blattauswahl, Mapping, EUR/„brutto=netto"-Bestätigung,
  Unternehmens-/Broker-Zuordnung, Vorschau mit Jahres-Kontrollwerten und
  filterbarer Detailtabelle, atomarer Commit, Importhistorie mit Rollback).
- Repository/Hooks `src/lib/supabase/repositories/imports.ts`,
  `src/features/imports/hooks.ts`; `database.types.ts` handnachgeführt.
- Tests: 44 neue Unit-Tests, 12 neue Integrationstests inkl. realer Excel-Datei.
- Gate grün: typecheck, lint, 126 Unit-Tests, 65 Integrationstests, Produktions-Build.

Bewusst nicht implementiert (außerhalb Phase 4): Kalender-, Prognose- und
Livekursfunktionen.

## Phase 5A — Dashboard (umgesetzt)

Umgesetzt:
- Zentrale, decimal-sichere Analytics-Schicht `src/lib/statistics` (Zeitraum-/Vergleichslogik,
  Gruppierungen, Extremwerte, Historie) — wiederverwendbar für Phase 5B.
- Dashboard-Datenbasis `fetchDashboardPayments` (eine Abfrage, aktive Eingänge) und Hooks
  (`useDashboardPayments`, `useDashboardYear`) mit URL-Zustand.
- Dashboard-UI: Zeitraumsteuerung, bis zu sechs KPI-Karten (§5), Monats-/Jahresdiagramm mit
  Monats-/Kumuliert-Umschalter und zugänglicher Datentabelle, Top-Unternehmen, Depotverteilung,
  letzte Eingänge, historische Übersicht, Drill-downs, Lade-/Fehler-/Leerzustände.
- URL-basierte Filterübergabe an die Zahlungsliste (`/eingaenge?year&month&security&depot`).
- Tests: Unit (Analytics, Zeitraum/Vergleich, URL, Render-Smoke) + Integration (RLS/Storno/Archiv).

Bewusst **nicht** Teil von 5A (folgt in späteren Phasen): vollständiger Statistikbereich,
Vergleichs-/Konzentrations-/Saisonanalysen, Exporte/PDF, Kalender, erwartete Dividenden,
Prognosen, Kurse/Depotwerte/Performance, Yield on Cost, Total Return, Broker-Sync.

## Phase 5B — Statistik (umgesetzt)

Umgesetzt:
- Erweiterung der zentralen Analytics-Schicht `src/lib/statistics` um reine, decimal-sichere
  Statistik-Aggregationen: `filterPayments`/`isEmptyFilter`, `overviewStatistics`,
  `yearStatistics`, `monthAcrossYearsStatistics`, `securityStatistics` + `sortSecurityStatistics`,
  `depotStatistics`, `calendarMonthBuckets`, `heatmapByYearMonth`, `averagePayment`,
  `averagePerActiveMonth`, `largestPayment`, `activeMonthCount`, `worstMonthInYear`, `bestYear`
  (CALCULATION_RULES.md §11). Keine parallele Logik, keine Berechnung in Komponenten.
- Statistikbereich `src/features/statistics` mit eigener Navigation und fünf Unterbereichen
  (Übersicht, Jahre, Monate, Unternehmen, Depots) als verschachtelte Routen unter `/statistiken`.
- Geteilter Datenfluss mit dem Dashboard (`useStatisticsData` nutzt den Query-Key
  `['payments','dashboard']`); Outlet-Kontext (`context.ts`) reicht den **einmal** gefilterten
  Datensatz an alle Unterbereiche weiter (ARCHITECTURE.md §4.5).
- Globale, kombinierbare, URL-basierte Filter (Jahr, Unternehmen, Depot, Datenquelle,
  Zahlungsart) mit isoliert getesteter Parse-/Serialisierungsschicht (`filterParams.ts`).
- Diagramme (Jahres-/Monatsentwicklung, Unternehmen nach Summe, Depotverteilung, Heatmap) mit
  Datentabellen-Alternative; generische `StatTable` mit Sortierung, Suche und Paginierung.
- Drill-down von jeder Kennzahl/Tabelle/Zelle in die gefilterte Zahlungsliste bzw. „Jahr →
  Monate dieses Jahres"; archivierte Unternehmen/Depots bleiben sichtbar und gekennzeichnet.
- Tests: Unit (Analytics inkl. Filter/Sortierung/Drill-Parameter und Skalierung ≥ 10.000
  Eingänge / ≥ 500 Unternehmen, URL-Parameter, `StatTable`, Render-Smoke) + Integration
  (SQL-Datenbasis: Jahres-/Unternehmens-/Depotaggregation, Storno/Archiv, RLS).

Bewusst **nicht** Teil von 5B (Grundsatz 8): Dividendenkalender, Prognosen, erwartete Dividenden,
Portfolio-Performance/Depotentwicklung, Kurse, Total Return, Kauf-/Verkaufsdaten,
Renditeberechnung, AI-Empfehlungen.
