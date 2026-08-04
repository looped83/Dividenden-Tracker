# Dividenden-Tracker

Persönliche Web-App zur langfristigen, zuverlässigen Dokumentation **tatsächlich erhaltener
Dividendeneingänge** — als Ablösung einer langjährig gepflegten Numbers-Tabelle.
PWA für Mac, iPad und iPhone. Supabase Postgres als Source of Truth.

## Status (Stand 2026-07-29)

Alle Funktionsbereiche sind umgesetzt und unter GitHub Pages im Einsatz:

| Bereich | Stand |
|---|---|
| Anmeldung, Depots, Unternehmen | in Betrieb |
| Dividendeneingänge: erfassen, bearbeiten, stornieren, löschen | in Betrieb |
| Datenqualität (Dubletten, Auffälligkeiten) | in Betrieb |
| CSV-/Excel-Import mit Bilanz, Duplikatprüfung und Rollback | in Betrieb |
| Übersicht und Statistikbereich (sechs Unterbereiche, Drill-down) | in Betrieb |
| Ziele (Jahr und Monat) mit Fortschritt | in Betrieb |
| Datensicherung, Wiederherstellung und Export | in Betrieb seit 2026-07-29; Restore-Probe am realen Bestand bestanden |
| PWA (installierbar, App-Hülle offline, Aktualisierungshinweis) | in Betrieb |
| Dividendenkalender (angekündigte Zahltage aus dem DivvyDiary-iCal-Feed) | neu; Edge Function und Secret müssen einmalig eingerichtet werden ([docs/CALENDAR_INTEGRATION.md](docs/CALENDAR_INTEGRATION.md)) |
| Depotstand (Bestand, Marktwert und erwartete Ausschüttung aus dem DivvyDiary-Portfolio-Export) | neu; Migrationen 0029 und 0030 müssen eingespielt werden ([docs/PORTFOLIO_IMPORT.md](docs/PORTFOLIO_IMPORT.md)) |

Die Numbers-Migration (Übernahme der historischen Daten nach
[MIGRATION_PLAN.md](MIGRATION_PLAN.md)) ist der verbleibende Betriebsschritt. Ihre
Voraussetzung — eine geprüfte, funktionierende Datensicherung — ist seit dem 2026-07-29
erfüllt (siehe Audit, Abschnitt 4.3).

Was als Nächstes sinnvoll ist und warum, steht in
[docs/AUDIT_2026-07-29.md](docs/AUDIT_2026-07-29.md) — eine belegte
Bestandsaufnahme mit Phasenplan. Die Statusvermerke je Phase stehen in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver (benoetigt .env, siehe .env.example)
npm run typecheck  # TypeScript strict, ohne Emit
npm run lint       # ESLint (inkl. Geld-Verbotsliste, CALCULATION_RULES.md §8)
npm run format:check
npm test           # Vitest (Unit-Tests, kein Datenbankzugriff)
npm run build      # Produktions-Build
```

Node.js ≥ 22 wird vorausgesetzt. Alle Paketversionen sind exakt gepinnt
(siehe [ARCHITECTURE.md](ARCHITECTURE.md) §2).

Für den Betrieb wird ein Supabase-Projekt benötigt: `.env` aus `.env.example` anlegen und
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` eintragen (SECURITY_MODEL.md §5).

Der Dividendenkalender braucht zusätzlich eine Edge Function und ein serverseitiges
Secret — der persönliche Feed-Link gehört **nie** ins Repository oder in eine
`VITE_`-Variable:

```bash
supabase migration up
supabase secrets set DIVVYDIARY_ICAL_URL="YOUR_PRIVATE_ICAL_URL"
supabase functions deploy sync-divvydiary-calendar
```

Einzelheiten in [docs/CALENDAR_INTEGRATION.md](docs/CALENDAR_INTEGRATION.md).

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
npm run test:e2e:app  # die fünf Kernabläufe hinter der Anmeldung
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

## Spezifikation

| Dokument | Inhalt |
|---|---|
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | Produktziel, Umfang, Abgrenzung, Grundsätze, Funktionsbereiche |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Tech-Stack mit Versionen, Systemarchitektur, Datenfluss, PWA |
| [DATA_MODEL.md](DATA_MODEL.md) | Tabellen, Enums, Constraints, Trigger, Views |
| [DATA_DICTIONARY.md](DATA_DICTIONARY.md) | Feldlexikon: Pflicht / optional / abgeleitet / technisch |
| [IMPORT_SPEC.md](IMPORT_SPEC.md) | CSV/XLSX/XLS-Import: 25 Schritte, Duplikatstufen, Bilanz, Rollback |
| [CALCULATION_RULES.md](CALCULATION_RULES.md) | Geld- und Rundungskonzept, alle Kennzahldefinitionen |
| [SECURITY_MODEL.md](SECURITY_MODEL.md) | Auth, RLS, CSP, Audit Log, Bedrohungsmodell |
| [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) | Backupformat, Validierung, Voll-/Merge-Restore |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Unit-, Import-, DB-, Sicherheits-, Backup-, E2E-, A11y-Tests |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Kontrollierte Migration aus Numbers (Golden Source) |
| [UX_AND_DESIGN_SYSTEM.md](UX_AND_DESIGN_SYSTEM.md) | Designsystem, responsive Layouts, Barrierefreiheit |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | 10 Phasen mit Scope, Tests und Abnahmekriterien |
| [DECISIONS.md](DECISIONS.md) | Entscheidungsprotokoll (D-Einträge und ADRs) |
| [docs/AUDIT_2026-07-29.md](docs/AUDIT_2026-07-29.md) | Bestandsaufnahme, Risiken, Phasenplan |
| [docs/CALENDAR_INTEGRATION.md](docs/CALENDAR_INTEGRATION.md) | Dividendenkalender: Edge Function, Secret, Datenmodell, Synchronisation |
| [docs/PORTFOLIO_IMPORT.md](docs/PORTFOLIO_IMPORT.md) | Depotstand: CSV-Import, Zuordnung, Datenmodell, Kennzahlen |
