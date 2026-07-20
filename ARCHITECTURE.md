# ARCHITECTURE.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliche technische Architektur (Planungsphase)

---

## 1. Architekturüberblick

Single-Page-Anwendung (React/Vite) als PWA, mit **Supabase Postgres als einziger Source of
Truth**. Es gibt kein eigenes Backend; die Geschäftslogik verteilt sich auf:

- **Postgres** (Supabase): Schema, Constraints, RLS, Trigger (Audit Log), transaktionale
  RPC-Funktionen für Import-Commit, Import-Rollback und Restore.
- **Client** (Browser): UI, Parsing/Validierung von Importdateien (Web Worker), Finanz-
  arithmetik mit Decimal.js, Darstellung und Caching (TanStack Query).

```
┌────────────────────────── Browser (Mac / iPad / iPhone) ──────────────────────────┐
│  React 19 + React Router (SPA)                                                    │
│  ├─ UI: Tailwind 4 + shadcn/ui + Recharts                                         │
│  ├─ Formulare: React Hook Form + Zod                                              │
│  ├─ Server-State: TanStack Query  ──────────────┐                                 │
│  ├─ Finanzlogik: Decimal.js (kein Float)        │                                 │
│  ├─ Import-Worker (Web Worker):                 │                                 │
│  │    Papa Parse (CSV) · SheetJS (XLSX/XLS)     │                                 │
│  │    Normalisierung · Validierung · Fingerprints                                 │
│  └─ Service Worker (vite-plugin-pwa/Workbox):   │                                 │
│       App-Shell-Cache + Offline-Lesecache       │                                 │
└─────────────────────────────────────────────────┼─────────────────────────────────┘
                                                  │ HTTPS (supabase-js, PKCE-Auth)
┌─────────────────────────────────────────────────▼─────────────────────────────────┐
│  Supabase (verwaltete Instanz)                                                    │
│  ├─ Auth (E-Mail/Passwort, PKCE, Session-Refresh)                                 │
│  ├─ PostgREST-API (ausschließlich RLS-geschützt)                                  │
│  └─ Postgres = SOURCE OF TRUTH                                                    │
│       Schema-Migrationen · CHECK/FK/UNIQUE-Constraints · RLS-Policies             │
│       Trigger → audit_log · RPCs: commit_import, rollback_import, restore_backup  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Zentrale Architekturentscheidung: Source of Truth

Supabase Postgres ist die einzige dauerhafte Datenquelle. Local Storage, IndexedDB, Browser
Cache, React State und PWA-Speicher dienen **niemals** als alleiniger dauerhafter Speicher.
Konkret:

- Schreiboperationen gelten erst als erfolgreich, wenn Postgres sie bestätigt hat.
- Der Offline-Cache (TanStack Query Persist → IndexedDB) ist **lesend**; er wird bei jedem
  Online-Start gegen den Server revalidiert und kann jederzeit verlustfrei gelöscht werden.
- In Phase 1–9 gibt es **keine Offline-Schreibwarteschlange** (bewusst, siehe DECISIONS.md
  D-011): Erfassen und Importieren erfordern eine Verbindung. Das verhindert Konflikt- und
  Verlustszenarien, die dem Grundsatz „kein stiller Verlust" widersprechen würden.

---

## 2. Tech-Stack und ausgewählte Versionen

Versionsstand geprüft am **2026-07-19** gegen die npm-Registry. Alle Versionen werden in
`package.json` exakt gepinnt (kein `^`), Updates laufen kontrolliert über Renovate-freie,
manuelle Review (persönliches Projekt, Nachvollziehbarkeit vor Bequemlichkeit).

| Baustein | Paket | Version | Anmerkung |
|---|---|---|---|
| UI-Framework | `react`, `react-dom` | 19.2.7 | Stable, Concurrent Features |
| Sprache | `typescript` | **5.9.x** | Bewusst nicht 7.x — siehe K-1 |
| Build | `vite` | 8.1.5 | mit `@vitejs/plugin-react` 6.0.3 |
| Styling | `tailwindcss` | 4.3.3 | CSS-first-Konfiguration (v4) |
| Komponenten | shadcn/ui (CLI `shadcn` 4.13.x) | — | Kein Laufzeitpaket; generierte Quellen im Repo |
| Routing | `react-router` | 8.2.0 | Library/Data Mode, kein Framework-Mode — K-2 |
| Server-State | `@tanstack/react-query` | 5.101.2 | + `@tanstack/react-query-persist-client` für Offline-Lesecache |
| Formulare | `react-hook-form` | 7.82.0 | |
| Validierung | `zod` | 4.4.3 | + `@hookform/resolvers` 5.4.0 (Zod-4-kompatibel) — K-3 |
| CSV | `papaparse` | 5.5.4 | Streaming-Parser, Worker-tauglich |
| Excel | `xlsx` (SheetJS CE) | **0.20.x von cdn.sheetjs.com** | npm-Version 0.18.5 ist veraltet/verwundbar — K-4 |
| Dezimalarithmetik | `decimal.js` | 10.6.0 | Konfiguration in CALCULATION_RULES.md §2 |
| Diagramme | `recharts` | 3.9.2 | React-19-kompatibel |
| Unit-Tests | `vitest` | 4.1.10 | + `@testing-library/react` 16.3.2 |
| E2E-Tests | `@playwright/test` | 1.61.1 | Chromium/WebKit (WebKit ≈ iOS Safari) |
| Backend-SDK | `@supabase/supabase-js` | 2.110.7 | PKCE-Flow |
| PWA | `vite-plugin-pwa` | 1.3.0 | Workbox 7.x |
| Supabase CLI | `supabase` | aktuell (≥ 2.x) | Lokale DB, Migrationen, Typen-Generierung |

### Kompatibilitätsentscheidungen

- **K-1 TypeScript 5.9 statt 7.x:** npm `latest` ist inzwischen TypeScript 7 (nativer
  Go-basierter Compiler). Für ein langlebiges Finanzprojekt wird die im gesamten Ökosystem
  (typescript-eslint, Vitest, IDE-Tooling, generierte Supabase-Typen) vollständig etablierte
  5.9-Linie gepinnt. Upgrade auf 7.x als eigener, getesteter Schritt nach Phase 10
  (DECISIONS.md D-013).
- **K-2 React Router 8 im Library-Modus:** Kein Framework-/SSR-Modus. Die App ist eine reine
  SPA hinter Auth; SSR brächte Komplexität ohne Nutzen und kollidiert mit dem PWA-Modell.
- **K-3 Zod 4 + @hookform/resolvers ≥ 5:** Resolver-Version 5.x ist die erste mit stabiler
  Zod-4-Unterstützung; ältere Anleitungen (Zod 3) sind nicht 1:1 übertragbar.
- **K-4 SheetJS aus der offiziellen SheetJS-Registry:** Das npm-Paket `xlsx` ist bei 0.18.5
  eingefroren und enthält bekannte Schwachstellen (u. a. Prototype Pollution, ReDoS). Bezogen
  wird 0.20.x als Tarball von `https://cdn.sheetjs.com` und mit Integritäts-Hash im Lockfile
  gepinnt. (CDN war aus der Planungsumgebung nicht erreichbar; exakte Patch-Version wird beim
  Projektsetup dokumentiert.) XLS-Altformat wird darüber mitunterstützt.
- **K-5 Tailwind 4 + shadcn/ui:** shadcn-CLI ≥ 4 generiert Tailwind-4-kompatible Komponenten
  (CSS-Variablen, `@theme`). Keine `tailwind.config.js`-Altlasten.
- **K-6 Recharts 3:** Nur SVG-Rendering, funktioniert ohne Canvas-Abhängigkeiten in WebKit;
  Accessibility-Layer (Tastatur/ARIA) von v3 wird genutzt.
- **K-7 Vitest 4 + Vite 8:** Major-Versionen sind aufeinander abgestimmt (gleiche
  Rollup/esbuild-Basis); Playwright unabhängig davon versioniert.

---

## 3. Projektstruktur

```
/
├── docs → (diese Spezifikationen, Repo-Root)
├── supabase/
│   ├── migrations/           # Nummerierte SQL-Migrationen (einzige Schemaquelle)
│   ├── seed.sql              # Nur Testdaten für lokale Entwicklung
│   └── config.toml
├── src/
│   ├── app/                  # App-Shell: Router, Provider, Layouts, Guards
│   ├── components/ui/        # shadcn/ui-Basiskomponenten (generiert, angepasst)
│   ├── components/           # Zusammengesetzte, fachneutrale Komponenten
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── payments/         # Dividendeneingänge: Liste, Formular, Detail, Historie
│   │   ├── securities/       # Unternehmen/Wertpapiere
│   │   ├── depots/
│   │   ├── statistics/
│   │   ├── imports/          # Assistent, Historie, Rollback
│   │   ├── goals/
│   │   ├── backup/
│   │   └── settings/
│   ├── lib/
│   │   ├── money/            # Decimal-Wrapper, Rundung, Formatierung (CALCULATION_RULES)
│   │   ├── parsing/          # Zahlen-/Datums-/Währungsparser, Encoding-Erkennung
│   │   ├── fingerprint/      # SHA-256-Fingerprints (Datei, Zeile, fachlich)
│   │   ├── statistics/       # Kennzahlfunktionen (pure functions, voll getestet)
│   │   ├── supabase/         # Client, generierte DB-Typen, typed RPC-Wrapper
│   │   └── export/           # JSON/CSV/XLSX-Exportformatierung inkl. Injection-Schutz
│   ├── workers/
│   │   └── import.worker.ts  # Datei-Analyse off-main-thread
│   └── styles/
├── tests/
│   ├── unit/                 # Vitest (lib/, statistics/, parsing/)
│   ├── integration/          # Vitest gegen lokale Supabase (RLS, RPC, Trigger)
│   ├── e2e/                  # Playwright
│   └── fixtures/             # Beispiel-CSV/XLSX/XLS, defekte Dateien, Backups
└── package.json
```

Regeln:

- `lib/money`, `lib/parsing`, `lib/fingerprint`, `lib/statistics` sind **reine Funktionen ohne
  React- oder Supabase-Abhängigkeit** → vollständig unit-testbar.
- Feature-Ordner kapseln Route-Komponenten, Query-Hooks und feature-lokale Komponenten.
- Datenbanktypen werden mit `supabase gen types typescript` generiert und eingecheckt; jede
  Migration aktualisiert die Typen im selben Commit.

---

## 4. Datenfluss und State-Management

### 4.1 Lesen

1. Route-Komponente nutzt Query-Hooks (`useQuery`) mit stabilen Query-Keys
   (`['payments', filter]`, `['stats','monthly',year]`, …).
2. supabase-js liest via PostgREST; RLS filtert serverseitig auf `auth.uid()`.
3. Aggregationen: kleine Datenmengen (≤ einige tausend Zahlungen/Jahr) werden clientseitig aus
   den Einzelzahlungen mit den Funktionen aus `lib/statistics` berechnet — dieselben Funktionen,
   die die Unit-Tests abdecken. Damit ist „Kennzahl = Summe der Drill-down-Liste" konstruktiv
   garantiert (eine Codequelle für beides). Für Gesamtauswertungen über alle Jahre werden
   Postgres-Views (`v_payment_stats_monthly` u. a.) genutzt, deren Definition testweise gegen
   die Client-Funktionen abgeglichen wird (TEST_STRATEGY.md §4).
4. TanStack Query cached im Speicher; Persist-Plugin spiegelt in IndexedDB (nur Cache).

### 4.2 Schreiben

1. Formular (React Hook Form) → Zod-Schema (Strings → Decimal, keine Float-Zwischenwerte).
2. Mutation via supabase-js `insert/update` bzw. RPC.
3. Bei Erfolg: gezielte Query-Invalidierung. **Kein Optimistic Update** für finanzielle Daten
   (DECISIONS.md D-012) — der Nutzer sieht erst den bestätigten Serverzustand.
4. Audit-Log-Einträge entstehen ausschließlich durch Datenbank-Trigger, nie durch Client-Code.

### 4.3 Transaktionale Operationen (RPC)

Mehrschrittige Schreibvorgänge laufen als Postgres-Funktionen (eine Transaktion, `SECURITY
INVOKER`, RLS bleibt aktiv):

| RPC | Zweck |
|---|---|
| `commit_import(import_id, rows)` | Atomares Anlegen aller bestätigten Zeilen + Statuswechsel + Bilanzprüfung serverseitig |
| `rollback_import(import_id)` | Archiviert alle Zahlungen des Imports + mitangelegte Stammdaten ohne weitere Referenzen |
| `restore_backup(payload, mode)` | Validierter Voll- oder Merge-Restore in einer Transaktion |
| `archive_payment(id, reason)` | Storno/Archivierung mit Pflicht-Audit |

Client-seitige Mehrfach-Inserts ohne Transaktion sind für diese Fälle verboten.

### 4.4 Dashboard-Datenfluss und Query-Strategie (Phase 5A)

Das Dashboard folgt bewusst dem Prinzip aus §4.1 Punkt 3:

- **Eine logische Ladung, alle Kennzahlen.** `fetchDashboardPayments()`
  (`lib/supabase/repositories/payments.ts`) lädt die gesamte aktive Historie
  (`archived_at is null`), reduziert auf die von der Analytics-Schicht benötigten Spalten
  (`id, pay_date, net/gross_amount, security_id, depot_id, payment_type, source, created_at`).
  Da PostgREST eine Antwort auf `db-max-rows` (Supabase-Default 1000) begrenzt, wird
  **seitenweise** (`.range()`, 1000er-Seiten) mit stabiler, eindeutiger Sortierung
  (`pay_date desc, id asc`) bis zur Vollständigkeit paginiert — sonst würden bei > 1000
  Eingängen Zahlungen fehlen (Kontrollwert 1.439). Keine Übertragung roher Daten je KPI,
  kein N+1, keine widersprüchlichen Einzelberechnungen. Für den aktuellen Datenumfang
  (Zielhorizont ≥ 10.000) werden **keine** materialisierten Views eingeführt (DECISIONS.md D-5A-1).
- **Analytics-Schicht** (`lib/statistics`): geparste `AnalyticsPayment`-Datensätze (Beträge
  einmalig zu `Money`), rein funktional und decimal-sicher. Einzige Quelle aller
  Dashboard-Kennzahlen und in Phase 5B für den Statistikbereich wiederverwendbar.
- **Jahresauswahl clientseitig.** Der ausgewählte Zeitraum (`?year=…`) wird auf den bereits
  geladenen Datensatz angewandt — ein Jahreswechsel löst **keine** neue Abfrage und keine
  Seitenneuladung aus (schnelle Umschaltung, memoisierte Aggregate).
- **Query-Key unter dem `payments`-Namespace:** `['payments','dashboard']`. Dadurch invalidieren
  alle bestehenden Zahlungs-Mutationen (Anlegen, Bearbeiten, Storno, Reaktivierung) sowie
  Import-Commit/-Rollback über `invalidateQueries(['payments'])` (Präfix-Match) automatisch auch
  die Dashboard-Daten. Namen/Archivstatus von Unternehmen und Depots stammen aus
  `['securities']`/`['depots']` und werden durch deren Mutationen aktualisiert. So zeigt das
  Dashboard nach Import, Bearbeitung, Storno, Reaktivierung oder Rollback nie veraltete Summen.
- **URL-Zustand:** Die Jahresauswahl liegt in der URL (`?year=2026` bzw. `?year=all`), bleibt nach
  Reload erhalten, funktioniert mit Browser-Zurück/-Vorwärts (Push-Historie) und fällt bei
  ungültigem Parameter sicher auf das aktuelle Jahr zurück. Drill-downs übergeben Filter an die
  Zahlungsliste (`/eingaenge?year=&month=&security=&depot=`).

---

## 5. Import-Pipeline (technische Sicht)

Details fachlich in IMPORT_SPEC.md; architektonisch:

1. Datei bleibt im Browser; sie wird **nie** an einen Server hochgeladen (Datenschutz,
   Größe). Nur die geprüften, normalisierten Zeilen gehen an Postgres.
2. `import.worker.ts` (Web Worker) übernimmt: Hashing (Web Crypto SHA-256), Encoding-Erkennung,
   Parsing (Papa Parse streaming / SheetJS), Normalisierung, Zod-Validierung, Fingerprints.
   Ergebnis: strukturierte `AnalyzedImport`-Datenstruktur mit vollständiger Zeilenbilanz.
3. Duplikatabgleich Stufe 3/4 (fachlich) erfolgt gegen die Server-Daten per Fingerprint-Query
   (indexierte Spalte), nicht durch Vollabzug aller Zahlungen.
4. Commit ausschließlich über `commit_import`-RPC in einer Transaktion; die Serverfunktion
   validiert erneut (Constraints + Plausibilitätsprüfungen) und verweigert bei
   Bilanzabweichung.
5. Importmetadaten (Hash, Mapping, Bilanz, Bericht) werden in `imports` persistiert.

---

## 6. PWA und Offline-Verhalten

- `vite-plugin-pwa` mit Workbox: Precaching der App-Shell (HTML/JS/CSS/Fonts/Icons),
  `registerType: 'prompt'` — Updates werden angezeigt und vom Nutzer bestätigt (keine stillen
  Versionswechsel bei einer Finanz-App).
- Manifest: Name „Dividend Tracker", `display: standalone`, Theme-Farben hell/dunkel, maskierbare
  Icons, iOS-Meta-Tags (Splash, Statusbar) für Add-to-Home-Screen auf iPhone/iPad.
- Laufzeit-Caching: **keine** Workbox-Runtime-Caches für Supabase-API-Antworten (Auth-gebundene
  Daten gehören nicht in den SW-Cache). Offline-Lesen läuft über den TanStack-Query-Persist-
  Cache in IndexedDB, der an die Nutzersession gebunden ist und bei Logout gelöscht wird.
- Offline-Zustand: klarer Banner „Offline — Daten evtl. nicht aktuell"; Schreibaktionen sind
  deaktiviert mit Erklärung (D-011).
- iOS-Besonderheiten: Speicher kann vom System geräumt werden → unkritisch, da nur Cache;
  Session-Persistenz über `localStorage` (supabase-js Standard) mit PKCE.

---

## 7. Umgebungen, Konfiguration, Migrationen

| Umgebung | Zweck | Datenbank |
|---|---|---|
| Lokal | Entwicklung + Integrationstests | Supabase CLI (Docker), Seed-Daten |
| CI | Lint, Unit, Integration (RLS!), E2E | Ephemere lokale Supabase-Instanz |
| Produktion | Echte Nutzung | Verwaltetes Supabase-Projekt |

- Konfiguration ausschließlich über Vite-Env-Variablen: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (Publishable Key — durch RLS geschützt, kein Geheimnis).
  Service-Role-Keys existieren nur in CI-Secrets/Supabase-Dashboard, niemals im Client oder
  Repo (SECURITY_MODEL.md §5).
- Schemaänderungen **nur** über nummerierte SQL-Migrationen (`supabase migration new …`);
  keine Dashboard-Änderungen an Produktionsschemata. Jede Migration ist idempotent prüfbar
  und läuft in CI gegen eine leere und eine befüllte Datenbank (TEST_STRATEGY.md §5).
- Deployment des Frontends: statisches Hosting mit korrekten CSP-Headern (SECURITY_MODEL.md §7).

---

## 8. Fehlerbehandlung und Logging

- Fehlerklassen: Validierungsfehler (erwartbar, feldbezogen angezeigt), Konfliktfehler
  (Duplikat/Constraint — mit Handlungsoption angezeigt), Netzwerkfehler (Retry durch TanStack
  Query mit Backoff), unerwartete Fehler (Error Boundary mit Wiederherstellungsoption).
- Logging nur lokal in der Konsole (Entwicklung) bzw. minimal strukturiert im Client
  (Produktion, ohne Beträge/Personendaten). **Kein externer Error-Tracking-Dienst**
  (Grundsatz 15). Fehlermeldungen enthalten nie rohe SQL- oder Tokendetails.

---

## 9. Architektur-Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Clientseitige Statistik weicht von SQL-View ab | Eine Codequelle für Drill-down + Kennzahl; Abgleichtests View ↔ lib/statistics |
| SheetJS-Version veraltet (npm-Falle) | Bezug über SheetJS-Registry, Version + Hash gepinnt, im Setup dokumentiert (K-4) |
| Große Importe blockieren UI | Web Worker + Streaming; Limits (IMPORT_SPEC.md §3) |
| RLS-Lücke durch neue Tabelle | Migration-Checkliste: keine Tabelle ohne RLS + Policies + Tests (SECURITY_MODEL.md §4) |
| iOS-PWA-Eigenheiten (Speicherräumung, Datei-Import) | Nur-Cache-Prinzip; Dateiimport über `<input type=file>` (Dateien-App), kein reines Drag-and-drop |
| Supabase-Ausfall/Vendor-Abhängigkeit | Regelmäßige JSON-Vollbackups (Kernfunktion); Schema als portables SQL; kein Supabase-proprietäres Feature außer Auth/RLS |
