# Dividenden-Tracker

Persönliche Web-App zur langfristigen, zuverlässigen Dokumentation **tatsächlich erhaltener
Dividendeneingänge** — als Ablösung einer langjährig gepflegten Numbers-Tabelle.
PWA für Mac, iPad und iPhone, ausgeliefert über GitHub Pages. Supabase Postgres ist die
Source of Truth. Die aktuelle Version steht in `package.json` und in den Einstellungen.

## Funktionsumfang (Stand v2.16.0, 2026-10-24)

| Bereich | Inhalt |
|---|---|
| Übersicht | Kennzahlen, eigenes Monatsdiagramm, Verteilung, Prognose; vom 15.12. bis 10.1. Einstieg in den Jahresrückblick |
| Dividenden | erfassen, bearbeiten, stornieren, löschen; Liste mit einklappbaren Monaten und Nachladen beim Scrollen; Detailseite mit Verlauf je Monat und Link zum Asset; Datenqualität (Dubletten, Auffälligkeiten) |
| Kalender | Umschalter Dividenden \| Ex-Tage, als Liste oder Monat; angekündigte Zahl- und Ex-Tage aus dem DivvyDiary-iCal-Feed ([docs/CALENDAR_INTEGRATION.md](docs/CALENDAR_INTEGRATION.md)) |
| Bestand | Assets (Bestand, Marktwert, erwartete Ausschüttung aus dem DivvyDiary-Portfolio-Export, [docs/PORTFOLIO_IMPORT.md](docs/PORTFOLIO_IMPORT.md)), Entwicklung, Analyse (Asset-Typ, Währung, Rhythmus, Branche, Länder), Prognose mit Monatslücken und Dividenden-Schneeball (DECISIONS.md ADR-006) |
| Statistiken | Übersicht, Verlauf, Vergleich, Aufteilung nach Unternehmen und Depots, Drill-down; Jahresrückblick je Jahr |
| Ziele | Jahres- und Monatsziele mit Zielbilanz, Monatsansicht und Zielvorschlag |
| Fortschritt | welche Fixkosten die Dividenden schon decken, nächste und erreichte Meilensteine; eigene Pflegeseite für Fixkosten mit Filtern |
| Einstellungen | Allgemein, Depots, CSV-/Excel-Import mit Bilanz und Rollback, Datensicherung, Wiederherstellung und Export |
| PWA | installierbar, App-Hülle offline, Aktualisierungshinweis |

Ein Fehler in einem Bereich legt nur diesen Bereich lahm, nicht die ganze App (Fehlergrenze je
Bereich). Excel-Dateien liest und schreibt die App mit eigenen Modulen in `src/lib/xlsx`
(`fflate` + `DOMParser`, DECISIONS.md ADR-007); das Altformat .xls wird mit klarer Meldung
abgelehnt.

Die historischen Daten aus Numbers sind einmalig importiert. Seit Version 2.0.0 gibt es kein
Audit Log und keine Import-Herkunftsspalten mehr (Migrationen 0037 und 0038, DECISIONS.md
ADR-008 und ADR-009); seit 2.11.5 ist auch die leere Tabelle `audit_log` entfernt (0040, ADR-011). Neue Sicherungen enthalten diese Felder nicht und lassen sich daher nicht
in Versionen vor 2.0.0 einspielen; ältere Sicherungen bleiben lesbar
([docs/BACKUP_FORMAT.md](docs/BACKUP_FORMAT.md)).

## Sicherheit

Das Repository ist öffentlich. Es enthält keine Zugangsdaten und keine echten Depotdaten;
Testdaten und Screenshots sind synthetisch. Der Anon-Key und die Projekt-URL von Supabase
sind öffentlich, der Schutz der Daten liegt vollständig bei Row Level Security und Grants:

- jede Tabelle mit RLS, Policies mit `(select auth.uid())` (Migration 0036);
- jede Migration entzieht `anon` und `authenticated` zunächst alle Rechte und vergibt danach
  gezielt nur die nötigen;
- Funktionen mit festem `search_path`, kein `EXECUTE` auf Trigger-Funktionen (Migration 0035).

Einzelheiten und die Checkliste für neue Migrationen stehen in
[SECURITY_MODEL.md](SECURITY_MODEL.md).

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver (benötigt .env, siehe .env.example)
npm run typecheck  # TypeScript strict, ohne Emit
npm run lint       # ESLint (inkl. Geld-Verbotsliste, CALCULATION_RULES.md §8)
npm run format:check
npm run knip       # ungenutzter Code und ungenutzte Abhängigkeiten
npm test           # Vitest (Unit-Tests, kein Datenbankzugriff)
npm run build      # Produktions-Build
```

Node.js ≥ 22 wird vorausgesetzt. Alle Paketversionen sind exakt gepinnt
(siehe [ARCHITECTURE.md](ARCHITECTURE.md) §2).

Für den Betrieb wird ein Supabase-Projekt benötigt: `.env` aus `.env.example` anlegen und
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` eintragen (SECURITY_MODEL.md §5).

Der Kalender braucht zusätzlich eine Edge Function und ein serverseitiges Secret. Der
persönliche Feed-Link gehört **nie** ins Repository oder in eine `VITE_`-Variable:

```bash
supabase migration up
supabase secrets set DIVVYDIARY_ICAL_URL="YOUR_PRIVATE_ICAL_URL"
supabase functions deploy sync-divvydiary-calendar
```

Nach Änderungen unter `supabase/functions/` rollt der Workflow „Deploy Edge Functions“ die
Funktion beim Merge auf `main` selbst aus. Einzelheiten in
[docs/CALENDAR_INTEGRATION.md](docs/CALENDAR_INTEGRATION.md).

### Versionsnummer

Jede Änderung unter `src/`, `public/`, `supabase/` oder an `index.html` hebt die Version in
`package.json` nach Semantic Versioning an:

```bash
npm version <patch|minor|major> --no-git-tag-version
```

CI prüft das bei jedem Pull Request (`scripts/check-version-bump.mjs`, DECISIONS.md ADR-004).

### Datenbank und Sicherheitstests

```bash
npm run db:test:reset     # baut eine lokale Test-Datenbank aus supabase/migrations neu auf
npm run test:integration  # Constraints/Trigger/RLS gegen eine echte PostgreSQL-Instanz
```

Voraussetzung ist eine lokal erreichbare PostgreSQL-16-Instanz (siehe
`scripts/db/reset-test-db.sh` für die Verbindungsparameter). Die eigentliche lokale
Supabase-CLI (`supabase start`, Docker-basiert) ist der empfohlene Weg für die reguläre
Entwicklung; die Integrationstests selbst benötigen nur reines PostgreSQL (DECISIONS.md D-027).
Sie laufen bei jedem Push im CI-Job `db-integration`.

```bash
npm run test:e2e      # öffentliche Routen: Rauchtests, axe, Telefonverhalten
npm run test:e2e:app  # die Kernabläufe hinter der Anmeldung
```

Beide bauen die Anwendung selbst und liefern sie aus (Chromium + WebKit).
`test:e2e:app` setzt zusätzlich die Testdatenbank neu auf und startet die
Testbrücke (`tests/e2e/support/bridge.ts`), damit die angemeldeten Abläufe
gegen echte Migrationen, echte RLS und die echten RPCs laufen — Aufbau und
Grenzen in TEST_STRATEGY.md §8.1.

Beim Arbeiten an einem einzelnen Test lohnt der Umweg über den Neuaufbau der
Datenbank nicht — sie ändert sich nur mit einer neuen Migration:

```bash
npm run db:test:reset        # einmal, danach nur bei neuer Migration
npm run test:e2e:app:only    # ohne Neuaufbau
npm run test:e2e:app:only -- --project=Desktop -g "storniert"   # ein Ablauf, ein Projekt
```

Der Vorschauserver wird lokal wiederverwendet (`reuseExistingServer`), der Build
läuft also ebenfalls nur beim ersten Aufruf.

### CI

Jeder Pull Request durchläuft Format, Lint, Typprüfung, Unit-Tests, `knip`, Build mit
Bundle-Budget (`scripts/check-bundle-size.mjs`), Lighthouse, die Deno-Typprüfung der Edge
Function, die Versionsprüfung, Rauchtests und angemeldete Abläufe (Chromium + WebKit) sowie die
Datenbanktests. Der Merge auf `main` veröffentlicht die App auf GitHub Pages.

## Spezifikation

| Dokument | Inhalt |
|---|---|
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | Produktziel, Umfang, Abgrenzung, Grundsätze, Funktionsbereiche |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Tech-Stack mit Versionen, Systemarchitektur, Datenfluss, PWA |
| [DATA_MODEL.md](DATA_MODEL.md) | Tabellen, Enums, Constraints, Trigger, Views |
| [DATA_DICTIONARY.md](DATA_DICTIONARY.md) | Feldlexikon: Pflicht / optional / abgeleitet / technisch |
| [IMPORT_SPEC.md](IMPORT_SPEC.md) | CSV/XLSX-Import: Schritte, Duplikatprüfung, Bilanz, Rollback |
| [CALCULATION_RULES.md](CALCULATION_RULES.md) | Geld- und Rundungskonzept, alle Kennzahldefinitionen inkl. Prognose |
| [SECURITY_MODEL.md](SECURITY_MODEL.md) | Auth, RLS, Grants, CSP, Bedrohungsmodell |
| [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) | Backupformat, Validierung, Voll-/Merge-Restore |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Unit-, Import-, DB-, Sicherheits-, Backup-, E2E-, A11y-Tests |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Kontrollierte Migration aus Numbers (Golden Source) |
| [UX_AND_DESIGN_SYSTEM.md](UX_AND_DESIGN_SYSTEM.md) | Designsystem, responsive Layouts, Barrierefreiheit |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | 10 Phasen mit Scope, Tests und Abnahmekriterien |
| [DECISIONS.md](DECISIONS.md) | Entscheidungsprotokoll (D-Einträge und ADRs) |
| [docs/BACKUP_FORMAT.md](docs/BACKUP_FORMAT.md) | Aufbau der Sicherungsdatei, Formatversionen |
| [docs/BACKUP_USER_GUIDE.md](docs/BACKUP_USER_GUIDE.md) | Sichern und Wiederherstellen in der App |
| [docs/CALENDAR_INTEGRATION.md](docs/CALENDAR_INTEGRATION.md) | Kalender: Edge Function, Secret, Datenmodell, Synchronisation, Ex-Tage |
| [docs/PORTFOLIO_IMPORT.md](docs/PORTFOLIO_IMPORT.md) | Depotstand: CSV-Import, Zuordnung, Datenmodell, Kennzahlen |
| [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Einrichtung und Auslieferung |
| [docs/ACCESSIBILITY_AUDIT.md](docs/ACCESSIBILITY_AUDIT.md) | Prüfung der Barrierefreiheit |
| [docs/AUDIT_2026-07-29.md](docs/AUDIT_2026-07-29.md) | Bestandsaufnahme vom Juli 2026 (historisch) |

Ältere Phasenberichte liegen in [docs/history](docs/history).

## Lizenz

[MIT](LICENSE)
