# DECISIONS.md — Dividend Tracker

Stand: 2026-07-19 · Status: Entscheidungsprotokoll (fortlaufend gepflegt)

Format: knappe ADR-Einträge. Jede spätere Abweichung von einer Spezifikation wird hier als
neue Entscheidung dokumentiert, nie stillschweigend umgesetzt.

---

## D-001 · UI-Sprache Deutsch, Formatierung de-DE
**Kontext:** Persönliche Nutzung, deutsche Quelldaten (Numbers, Broker-Exporte).
**Entscheidung:** UI einsprachig Deutsch; Zahlen/Daten `de-DE`; keine i18n-Infrastruktur in v1.
**Konsequenz:** Weniger Komplexität; spätere Mehrsprachigkeit wäre Refactoring.

## D-002 · Basiswährung EUR, fix nach erster Buchung
**Kontext:** Auswertungen brauchen eine gemeinsame Währung; Umrechnungslogik braucht einen Anker.
**Entscheidung:** Profil-Basiswährung, Default EUR; änderbar nur bei leerem Datenbestand
(Trigger-geschützt). Fremdwährungszahlungen speichern Originalwerte + Kurs (R-2).
**Konsequenz:** Keine nachträgliche Gesamtumrechnung nötig; historische Beträge bleiben stabil.

## D-003 · Kein eigenes Backend, Logik in Postgres-RPCs + Client
**Kontext:** Vorgegebener Stack ohne Serverkomponente; Transaktionspflicht für Import/Restore.
**Entscheidung:** Transaktionale Mehrschritt-Operationen als Postgres-Funktionen
(`security invoker`); Parsing/Analyse clientseitig im Web Worker; Importdateien verlassen den
Browser nicht.
**Konsequenz:** Weniger Angriffsfläche und Betriebskosten; SQL-Funktionen brauchen eigene Tests.

## D-004 · Rundung kaufmännisch (ROUND_HALF_UP), keine Bankers-Rundung
**Kontext:** Abgleich mit deutschen Broker-Abrechnungen und der bestehenden Numbers-Tabelle.
**Entscheidung:** Einheitlich HALF_UP an den in CALCULATION_RULES.md §3 definierten Stellen.
**Konsequenz:** Ergebnisse entsprechen Belegen; dokumentierte, testbare Regel.

## D-005 · Rückerstattungen als positiver `refund`-Eingang
**Kontext:** Quellensteuer-Erstattungen passen nicht in die Brutto-Steuer-Netto-Invariante.
**Entscheidung:** `refund` mit brutto = netto, Steuerfelder 0, Details in der Notiz; keine
negativen Steuerfelder.
**Konsequenz:** Invariante bleibt einfach; Steuerstatistiken zeigen Erstattungen als eigene
Kategorie, nicht als negative Steuer.

## D-006 · Portfolio als optionale Depot-Gruppe, nicht am Eingang
**Kontext:** Vorgabe nennt „Portfolio" und „Depot" in der Identifikation eines Eingangs.
**Entscheidung:** Zahlung → Depot (Pflicht); Depot → Portfolio (optional). Kein
Portfolio-Feld am Eingang selbst.
**Konsequenz:** Keine widersprüchlichen Zuordnungen; Portfolio-Auswertung via Join.

## D-007 · Kein Unique-Constraint auf dem fachlichen Fingerprint
**Kontext:** Zwei echte identische Zahlungen am selben Tag sind möglich (Tranchen).
**Entscheidung:** `business_fingerprint` nur indexiert; Duplikate werden im Import-/Restore-
Prozess erkannt und vom Nutzer entschieden. Hartes Unique nur auf `(import_id, source_row_number)`.
**Konsequenz:** Grundsatz „Nutzer entscheidet unsichere Fälle" auch technisch konsequent.

## D-008 · ISIN-Prüfziffer clientseitig, DB prüft nur Format
**Kontext:** Luhn-Prüfung in SQL wäre unverhältnismäßig komplex.
**Entscheidung:** Zod validiert Prüfziffer; Postgres CHECK nur Struktur-Regex.
**Konsequenz:** Direkte API-Schreibzugriffe könnten formal gültige, prüfziffernfalsche ISINs
setzen — akzeptiert (eigene Daten, `data_quality`-Mechanik fängt Auffälligkeiten).

## D-009 · Import-Rollback als Soft-Archivierung, nicht Hard Delete
**Kontext:** Grundsatz 3 (kein stilles Löschen) vs. „Import vollständig rückgängig".
**Entscheidung:** Rollback archiviert alle Import-Zahlungen (audit-protokolliert); erneuter
Import bleibt möglich, Historie bleibt einsehbar.
**Konsequenz:** Speicher wächst minimal; Nachvollziehbarkeit maximal.

## D-010 · `imports.row_report` als JSONB statt eigener Zeilentabelle
**Kontext:** Vollständige Zeilenklassifikation muss dauerhaft gespeichert werden (Bilanz).
**Entscheidung:** Bericht als JSONB am Import (Datei ≤ 50.000 Zeilen, Limits IMPORT_SPEC.md §2).
**Konsequenz:** Einfaches Schema; kein relationales Abfragen einzelner Berichtzeilen nötig
(Anzeige erfolgt importbezogen). Bei Bedarf später extrahierbar.

## D-011 · Keine Offline-Schreibwarteschlange in v1
**Kontext:** PWA-Offline-Schreiben erzeugt Konflikt-/Verlustszenarien, die den
Integritätsgrundsätzen widersprechen.
**Entscheidung:** Offline nur Lesen (Query-Persist-Cache); Schreiben erfordert Verbindung und
wird offline klar deaktiviert.
**Konsequenz:** Einfache, verlustfreie Semantik; mobiles Erfassen braucht Netz (akzeptiert).

## D-012 · Keine Optimistic Updates für Finanzdaten
**Kontext:** UI-Zustand dürfte nie vom bestätigten Serverzustand abweichen.
**Entscheidung:** Mutationen zeigen Ladezustand und rendern erst den Serverstand.
**Konsequenz:** Minimal langsameres UI-Gefühl, maximale Verlässlichkeit der Anzeige.

## D-013 · TypeScript 5.9 gepinnt, 7.x-Upgrade als eigener Schritt
**Kontext:** npm-`latest` ist der neue native Compiler (7.x); Ökosystem-Tooling teils frisch.
**Entscheidung:** 5.9.x für v1; Upgrade-Fenster nach Phase 10 mit voller Testsuite.
**Konsequenz:** Konservative, reproduzierbare Toolchain (ARCHITECTURE.md K-1).

## D-014 · Kein zusätzlicher App-Pin/Biometrie in v1
**Kontext:** Gerätesperre + Supabase-Session decken das persönliche Bedrohungsmodell ab.
**Entscheidung:** Verzicht in v1; Session-Lebensdauer konservativ, Logout löscht Cache.
**Konsequenz:** Weniger Komplexität; als Backlog-Kandidat notiert.

## D-015 · SheetJS 0.20.x aus Hersteller-Registry statt npm
**Kontext:** npm-Paket `xlsx` eingefroren bei 0.18.5 mit bekannten CVEs.
**Entscheidung:** Bezug von cdn.sheetjs.com, Version + Integrität im Lockfile gepinnt; exakte
Patch-Version wird beim Projektsetup dokumentiert (CDN aus Planungsumgebung nicht erreichbar).
**Konsequenz:** Gepflegter Parser inkl. XLS-Altformat; Bezugsquelle im Setup-README erklärt.

## D-016 · Aggregation clientseitig + SQL-Views mit Abgleichtest
**Kontext:** Drill-down-Garantie (Kennzahl == Summe der Liste) und große Historien.
**Entscheidung:** Eine Kennzahl-Codequelle in `lib/statistics` für UI und Drill-down;
`v_stats_*`-Views für Gesamtauswertungen; CI-Test erzwingt Wertgleichheit.
**Konsequenz:** Doppelte Implementierung bewusst in Kauf genommen, aber testgesichert.

## D-017 · Beträge als Strings im Transport, `Money`-Branded-Type im Code
**Kontext:** Grundsatz 9 (keine unkontrollierten Floats); PostgREST liefert `numeric` als JSON.
**Entscheidung:** supabase-js/Typegen so konfiguriert, dass `numeric` als `string` typisiert
ist; Umwandlung ausschließlich über `lib/money`.
**Konsequenz:** Compiler verhindert versehentliche Float-Arithmetik.

## D-018 · Selbstregistrierung bleibt aktiv, App bleibt mandantenfähig
**Kontext:** Persönliches Projekt, aber sauberes Multi-User-Modell ist ohnehin RLS-Pflicht.
**Entscheidung:** Standard-Supabase-Auth mit E-Mail-Bestätigung; optional später per
Konfiguration schließbar.
**Konsequenz:** RLS-Tests mit zwei Nutzern sind ohnehin Kernbestandteil.

## D-019 · Zeitzone: Zahlungsdatum als reines Datum (`date`)
**Kontext:** Dividendengutschriften haben ein Buchungsdatum, keine Uhrzeit; Zeitzonenrechnung
würde Monatssummen verfälschen (31.12. vs. 01.01.).
**Entscheidung:** `pay_date date`, keine TZ-Konvertierung; „heute" = lokales Gerätedatum.
**Konsequenz:** Eindeutige Monats-/Jahreszuordnung identisch zur Numbers-Praxis.

## D-020 · XLS-Altformat „best effort"
**Kontext:** Vorgabe „möglichst XLS"; SheetJS liest BIFF, aber Altdateien sind fehleranfällig.
**Entscheidung:** XLS wird unterstützt; bei Parserproblemen klare Meldung mit Empfehlung
„in Numbers/Excel als XLSX exportieren". Kein eigener BIFF-Sonderweg.
**Konsequenz:** Realistische Zusage ohne Qualitätsrisiko im Kernpfad.

## D-021 · lib/money: Wertobjekte als Klassen mit privatem Konstruktor statt Parameter-Properties
**Kontext:** Phase 1 (IMPLEMENTATION_PLAN.md) verlangt ein deterministisches, rein
funktionales, unabhängig testbares `lib/money`-Grundgerüst; TypeScript strict mode mit
`erasableSyntaxOnly` verbietet Konstruktor-Parameter-Properties (nicht erasable Syntax).
**Entscheidung:** `Money`, `Quantity`, `FxRate`, `OriginalAmount`, `PerShareAmount` sind
unveränderliche Klassen mit privatem Konstruktor und statischen Fabrikmethoden
(`fromString`, `zero`, …); Felder werden im Konstruktorkörper zugewiesen, keine
Parameter-Property-Kurzschreibweise. Parsing (`parseCanonicalDecimal`) und Rundung
(`roundHalfUp`) sind zentrale, geteilte reine Funktionen — keine duplizierte Logik zwischen
den Wertobjekten.
**Konsequenz:** Jedes Wertobjekt ist über seine Fabrikmethoden und wenige Instanzmethoden
vollständig gekapselt und typsicher; UI-Komponenten können keine abweichende Rundung/Parsing
einführen.

## D-022 · Money.fromString akzeptiert nur das kanonische Dezimalformat
**Kontext:** CALCULATION_RULES.md §7 beschreibt lokale Zahlenformate (deutsch/englisch,
Tausendertrennzeichen) für Import und Formulare; das ist explizit Aufgabe von `lib/parsing`
(Phase 3/4), nicht von `lib/money`.
**Entscheidung:** `lib/money` (Phase 1) parst ausschließlich ein kanonisches Format (Punkt
als Dezimaltrennzeichen, kein Tausendertrennzeichen, optionales Vorzeichen) und lehnt
Komma-/Tausenderformate mit klarer Fehlermeldung ab. Die lokale Formaterkennung entsteht erst
mit `lib/parsing` in einer späteren Phase und normalisiert vor dem Aufruf von `Money.fromString`.
**Konsequenz:** Sauberer Schnitt zwischen Rundungs-/Arithmetik-Grundgerüst (Phase 1) und
Formaterkennung (Phase 3/4); kein verfrühter Scope in Phase 1.

## D-023 · Intl.NumberFormat erhält den kanonischen String, nicht `Number()`
**Kontext:** R-5 verlangt reine Anzeige-Formatierung ohne erneute Rundung; ein Umweg über
`.toNumber()` würde Grundsatz 9 (keine unkontrollierten Floats) für sehr große Beträge
unterlaufen. TypeScripts `StringNumericLiteral`-Typ (lib.es2023.intl.d.ts) akzeptiert
statisch nur literale Template-Typen, keinen generischen `string`.
**Entscheidung:** `formatMoney`/`formatPercent` übergeben `toStringValue()`/`toFixed()`
direkt an `Intl.NumberFormat#format` (von der Laufzeit seit ES2020 unterstützt) mit einem
gezielt begründeten `as unknown as number`-Cast für die bekannte TS-Typisierungslücke.
**Konsequenz:** Keine Float-Konvertierung an der Formatierungsgrenze; der Cast ist eng
gefasst und kommentiert, kein pauschales `any`.

## D-024 · ThemeProvider nutzt `useSyncExternalStore` statt `setState` im Effect
**Kontext:** Die System-Farbschema-Präferenz ist ein extern veränderlicher Browser-Zustand
(`matchMedia`); `eslint-plugin-react-hooks` (React 19) markiert synchrones `setState` in
einem Effekt als Anti-Pattern (kaskadierende Re-Renders).
**Entscheidung:** Die Systempräferenz wird über `useSyncExternalStore` gelesen; `resolvedTheme`
ist ein reiner Ableitungswert aus `theme` und der Systempräferenz. Ein einzelner Effekt bleibt
nur noch für die DOM-Seiteneffekt-Synchronisierung (`classList.toggle`) übrig.
**Konsequenz:** Keine unterdrückten Lint-Fehler, idiomatisches React-19-Muster für externen
veränderlichen Zustand.

## D-025 · Theme-Präferenz in localStorage
**Kontext:** ARCHITECTURE.md §1 untersagt Local Storage/IndexedDB als alleinige Quelle für
fachliche/finanzielle Daten; die Hell/Dunkel/System-Präferenz ist keine Finanzdatum.
**Entscheidung:** Die Theme-Präferenz wird ausschließlich als reine UI-Einstellung in
localStorage gehalten (Schlüssel `dividend-tracker:theme`), unabhängig vom künftigen
Supabase-Profil (Phase 2 legt zusätzlich `profiles.theme` an; Synchronisierung ggf. in
späterer Phase, kein Widerspruch zum Source-of-Truth-Grundsatz für Finanzdaten).
**Konsequenz:** Sofortige, netzwerkunabhängige Theme-Anwendung bereits vor Phase 2.

## D-026 · SheetJS-CDN in der Implementierungsumgebung nicht erreichbar
**Kontext:** D-015/O-1 sahen vor, die konkrete SheetJS-0.20.x-Version beim Projektsetup von
`cdn.sheetjs.com` zu verifizieren. In der Sandbox-Umgebung dieser Phase-1-Implementierung ist
der Host durch die Egress-Policy des Proxys blockiert (403 auf CONNECT).
**Entscheidung:** SheetJS/xlsx wird planmäßig erst in Phase 4 (CSV- und Excel-Import)
installiert; die Versionsprüfung erfolgt dort in einer Umgebung mit Zugriff auf
cdn.sheetjs.com bzw. wird alternativ gegen eine erreichbare, gepflegte Bezugsquelle geprüft,
falls der CDN-Host dauerhaft nicht erreichbar ist.
**Konsequenz:** O-1 bleibt offen und wird auf den Start von Phase 4 verschoben (siehe unten).

## D-027 · RLS-/Trigger-Testsuite gegen reines PostgreSQL statt Supabase-CLI (Docker)
**Kontext:** Phase 2 verlangt eine automatisierte, blockierende RLS-Testsuite mit zwei
Nutzern (SECURITY_MODEL.md §10). Die Supabase-CLI (`supabase start`, `supabase gen types`)
benoetigt Docker; in der Implementierungsumgebung dieser Phase startet der Docker-Daemon
nicht (fehlende Berechtigung fuer `ulimit`/Cgroups in der Sandbox), und `supabase gen types
typescript --db-url ...` startet intern ebenfalls einen Container, unabhaengig vom
uebergebenen `--db-url`.
**Entscheidung:** Alle Migrationen (`supabase/migrations/*.sql`) bleiben unveraendert
Supabase-kompatibel (sie setzen ein bereits vorhandenes `auth`-Schema voraus, wie es jedes
echte Supabase-Projekt mitbringt). Fuer lokale/CI-Tests emuliert
`supabase/test-support/local-postgres-bootstrap.sql` ausschliesslich `auth.users`,
`auth.uid()` und `auth.role()` sowie die Rollen `anon`/`authenticated`/`service_role` —
funktional identisch zur echten RLS-Mechanik (`request.jwt.claims`-GUC), da Supabase RLS
selbst nur Standard-PostgreSQL-RLS ist, kein proprietäres Feature. `scripts/db/reset-test-db.sh`
baut damit eine Testdatenbank neu auf; `tests/integration/**` (Vitest + `pg`, eigene
Konfiguration `vitest.integration.config.ts`) simuliert je "Anfrage" eine eigene Transaktion
mit `SET LOCAL ROLE` + lokaler JWT-Claim-GUC (`tests/integration/support/db.ts`) — analog zu
PostgREST. 48 Integrationstests decken Constraints/FKs/Unique/Transaktionen/Soft-Delete
(TEST_STRATEGY.md §5) sowie alle neun anwendbaren Punkte der RLS-Checkliste inkl. zweier
Testnutzer, anon-Zugriff, manipulierter `user_id`, direkter Anfragen mit manipulierten
Filtern und RPC-Missbrauch (TEST_STRATEGY.md §6) ab und laufen tatsaechlich (nicht nur
geschrieben) gegen eine echte PostgreSQL-16-Instanz.
**Konsequenz:** Volle Testabdeckung von Schema/RLS/Triggern ohne Docker-Abhaengigkeit; CI
(`.github/workflows/ci.yml`, Job `db-integration`) nutzt einen Postgres-Service-Container
(auf GitHub-Actions-Runnern funktioniert Docker) und denselben Bootstrap/Migrationslauf.
**Nicht abgedeckt:** ein echter End-to-End-Lauf durch PostgREST/GoTrue (HTTP-Ebene) sowie
`supabase gen types typescript` selbst — siehe D-028/O-7.

## D-028 · Datenbanktypen (`database.types.ts`) handgepflegt statt generiert
**Kontext:** `supabase gen types typescript` erfordert Docker (siehe D-027), auch mit
`--db-url`. Phase 2 verlangt dennoch typisierten Datenbankzugriff (ARCHITECTURE.md §3,
Grundsatz 9/D-017: `numeric` als `string`, nie als JS-`number`).
**Entscheidung:** `src/lib/supabase/database.types.ts` wurde von Hand erstellt und Spalte
fuer Spalte gegen das tatsaechlich angewendete Schema abgeglichen (`\d+` auf der lokalen
Testdatenbank), inklusive der Insert/Update-Einschraenkungen aus den Immutable-Field- und
RLS-Regeln (z. B. `profiles.Insert = never`, `dividend_payments.Update` ohne `source`/
`import_id`/etc.). Ein `npm run gen:types`-Skript ist bereits hinterlegt.
**Konsequenz:** Sobald Docker oder ein verlinktes Supabase-Projekt verfuegbar ist, MUSS
`npm run gen:types` ausgefuehrt und das Ergebnis mit dieser Datei verglichen werden; bis
dahin muss jede weitere Migration diese Datei manuell nachziehen (Risiko fuer Drift, siehe
offene Punkte).

## D-029 · Kein Ende-zu-Ende-Test gegen echtes Supabase Auth (GoTrue/PostgREST)
**Kontext:** Es steht kein echtes Supabase-Projekt und kein lokaler GoTrue/PostgREST-Stack
zur Verfuegung (Docker-Einschraenkung, siehe D-027).
**Entscheidung:** Login/Registrierung/Passwort-Reset wurden gegen die UI-Ebene manuell
geprueft (Playwright: Redirect ins Login bei fehlender Session, Zod-Validierung inkl.
Passwort-Mindestlaenge und -Bestaetigung, Navigation zwischen den Auth-Seiten) — ohne echten
Netzwerk-Roundtrip zu `supabase.auth.signInWithPassword`/`signUp`/etc. Die Server-seitige
Absicherung (RLS, Trigger, `enforce_user_id`, Audit) ist dagegen vollstaendig gegen echtes
PostgreSQL verifiziert (D-027).
**Konsequenz:** Vor dem ersten produktiven Einsatz muss der komplette Auth-Flow einmal gegen
ein echtes (auch ein kostenloses) Supabase-Projekt durchgespielt werden (siehe O-8).

## D-030 · Hosting auf GitHub Pages (statt Vercel/Netlify) — Hash-Router und Basispfad
**Kontext:** O-2 (Hosting-Anbieter) wurde vom Nutzer entschieden: GitHub Pages, direkt aus
dem Repository, ohne separaten Hosting-Account. GitHub Pages liefert Projekt-Seiten unter
einem Unterpfad (`https://<user>.github.io/<repo>/`) und unterstuetzt kein serverseitiges
SPA-Fallback — ein direkter Aufruf oder Reload einer Unterseite (z. B. `/login`) mit
`BrowserRouter` liefert ein hartes 404 von GitHub Pages, bevor React Router ueberhaupt laedt.
**Entscheidung:**
- `src/app/router.tsx` nutzt `createHashRouter` statt `createBrowserRouter`. URLs haben
  dadurch die Form `/#/login` statt `/login`; der Pfad vor dem `#` wird nie an den Server
  geschickt, wodurch das GitHub-Pages-Fallback-Problem strukturell entfaellt (kein
  404.html-Redirect-Hack noetig).
- `vite.config.ts` setzt `base: '/Dividenden-Tracker/'` nur, wenn die Umgebungsvariable
  `GITHUB_PAGES=true` gesetzt ist (vom Deploy-Workflow), sonst bleibt `base: '/'` fuer
  andere Umgebungen (lokal, ggf. spaeter Vercel) unveraendert.
- `ResetPasswordRequestPage.tsx` baut den `redirectTo`-Link aus
  `window.location.origin + window.location.pathname + '#/passwort-zuruecksetzen'` —
  `pathname` ist bei einem Hash-Router unabhaengig von der aktuellen Route immer der
  Deployment-Basispfad, das funktioniert also sowohl an der Domainwurzel als auch unter
  `/Dividenden-Tracker/`.
- Neuer Workflow `.github/workflows/deploy-pages.yml`: baut bei jedem Push auf
  `claude/dividend-tracker-spec-l627i5` mit `GITHUB_PAGES=true` sowie den Repo-Secrets
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` und deployt via `actions/deploy-pages`.
**Konsequenz:** Der Nutzer muss einmalig (a) GitHub Pages in den Repo-Einstellungen mit
Quelle „GitHub Actions" aktivieren, (b) die zwei Secrets unter Settings → Secrets and
variables → Actions eintragen, und (c) in Supabase Site URL/Redirect URLs auf die
GitHub-Pages-URL (inkl. `#/passwort-zuruecksetzen`) anpassen. Wechselt das Hosting spaeter
zu einem Anbieter mit echtem SPA-Fallback (z. B. Vercel), kann auf `createBrowserRouter`
zurueckgewechselt werden — beides ist mit denselben Routendefinitionen moeglich.

## D-031 · Phase 3: TanStack Query fuer Server-State, `amount_per_share` nur bei Fremdwaehrung befuellt
**Kontext:** Phase 3 fuehrt die erste echte CRUD-UI ein (Depots/Portfolios, Unternehmen,
Dividendeneingaenge inkl. Fremdwaehrung und Invariante-Warnung).
**Entscheidung:**
- Server-State (Listen, Mutations, Cache-Invalidierung) laeuft ueber `@tanstack/react-query`
  (bereits in `package.json` vorgesehen, aber bislang nicht verdrahtet) statt eigener
  `useEffect`/`useState`-Datenladelogik je Seite — ein `QueryClientProvider` wurde in
  `main.tsx` ergaenzt.
- Fehlende UI-Bausteine (`Select`, `Table`, `Textarea`, `Dialog`) wurden als schlanke,
  Tailwind-basierte Komponenten in `src/components/ui/` ergaenzt statt eine vollstaendige
  Komponentenbibliothek nachzuruesten; `Dialog` nutzt das bereits installierte
  `@radix-ui/react-dialog` fuer Fokus-Trapping/Escape-Handling, `Select`/`Table` sind reine
  HTML-Wrapper (kein `@radix-ui/react-select` installiert).
- Die clientseitige Invariante-Pruefung (`lib/payments/invariant.ts`) spiegelt exakt die
  Postgres-CHECK-Constraint `net_amount_invariance` (Toleranz ±0,02) und zeigt bei
  Ueberschreitung eine Warnung mit expliziter Bestaetigungs-Checkbox — nie ein stilles
  Anpassen (CALCULATION_RULES.md §4).
- `amount_per_share` (DB-Spalte, R-7) wird nur bei Fremdwaehrungszahlungen aus
  `original_gross ÷ quantity` befuellt, da bei Inlandszahlungen kein `original_gross`
  existiert (DATA_MODEL.md `fx_fields_consistency`-Constraint) — bei Inlandszahlungen bleibt
  die Spalte `null`.
**Konsequenz:** Weitere Phasen (Statistik, Import) koennen dieselben Repository-/Hook-Module
(`src/lib/supabase/repositories/*`, `src/features/*/hooks.ts`) wiederverwenden bzw. erweitern.

## D-032 · `exceljs` statt SheetJS/`xlsx` fuer den Unternehmens-Excel-Import
**Kontext:** Nutzeranfrage: Unternehmens-Stammdaten (Name/Ticker/ISIN/WKN) aus einer
bestehenden Depot-Exceldatei importieren koennen, vorgezogen aus Phase 4. D-015/D-026 sahen
SheetJS von `cdn.sheetjs.com` vor; dieser Host ist in der Implementierungsumgebung weiterhin
nicht erreichbar (403 auf CONNECT), und das npm-Paket `xlsx` ist bei 0.18.5 mit bekannten CVEs
eingefroren.
**Entscheidung:**
- `exceljs` (npm, aktiv gepflegt) uebernimmt fuer dieses schmale Feature das Einlesen der ersten
  Tabelle einer `.xlsx`-Datei (`src/lib/xlsx/parseWorkbook.ts`). `npm audit` meldet eine
  transitive moderate CVE in `uuid` (Buffer-Bounds-Check) — betrifft nur Code-Pfade, die wir
  nicht aufrufen (wir lesen ausschliesslich, schreiben nie), und läuft rein clientseitig im
  Browser, kein Server-Angriffsvektor.
- `exceljs` wird per dynamischem `import()` nachgeladen (eigener ~930-KB-Chunk), damit das
  Hauptbundle nicht fuer alle Seiten aufgeblaeht wird, obwohl es nur beim Excel-Import auf der
  Unternehmensseite gebraucht wird.
- Nur Name/Ticker/ISIN/WKN werden uebernommen; andere Spalten einer Depot-Exportdatei
  (Stückzahl, Kurse, Kategorie, …) gehoeren fachlich nicht zu den Unternehmens-Stammdaten
  (DATA_MODEL.md §3.4). Das Land wird aus den ersten zwei Zeichen einer gueltigen ISIN
  abgeleitet. Bereits vorhandene Unternehmen (Abgleich per ISIN bzw. Name, spiegelt die
  DB-Unique-Indizes) werden uebersprungen, nicht aktualiert — kein Merge-/Upsert-Flow.
**Konsequenz:** Die eigentliche Phase-4-Entscheidung (SheetJS vs. Alternative fuer den
vollstaendigen CSV/Excel-Import-Assistenten mit Bilanz und Duplikaterkennung) bleibt offen
(O-1) und wird bei Phase-4-Start erneut geprueft — dieser schmale Stammdaten-Import ist davon
unabhaengig und muss bei Bedarf nicht dieselbe Bibliothek verwenden.

## D-033 · Schema-Migrationen auf dem echten Supabase-Projekt per SQL Editor statt CLI
**Kontext:** Nach Abschluss von Phase 2/3 bestand das reale Supabase-Projekt zwar aus einer
funktionierenden Auth (GoTrue), aber die eigenen Tabellen (`portfolios`, `depots`,
`securities`, `dividend_payments`, …) existierten dort nicht — sie wurden bislang ausschliesslich
gegen eine lokale PostgreSQL-Instanz getestet (D-027), nie gegen das verlinkte Projekt
angewendet. Fehlerbild beim ersten Live-Test: `Could not find the table 'public.portfolios' in
the schema cache`. Docker/Supabase-CLI stehen in der Implementierungsumgebung weiterhin nicht
zur Verfuegung (D-026/D-027).
**Entscheidung:** Alle 11 Migrationsdateien wurden zu einem einzigen SQL-Skript zusammengefasst
und vom Nutzer manuell im Supabase-Dashboard (Authentication → SQL Editor) eingefuegt und
ausgefuehrt — inklusive eines Nachtrags, der fuer bereits vor den Migrationen angelegte
Auth-Nutzer die fehlende `profiles`-Zeile ergaenzt (der `on_auth_user_created`-Trigger greift
nur fuer Registrierungen ab dem Zeitpunkt seiner Erstellung).
**Konsequenz:** Jede kuenftige Schemaaenderung (neue Migration) muss bis zur Verfuegbarkeit von
Docker/Supabase-CLI in dieser Umgebung ebenso manuell im SQL Editor nachgezogen werden — es gibt
noch keinen automatisierten Migrationsweg gegen das reale Projekt. Das Skript ist nur fuer eine
einmalige Anwendung auf ein leeres Projekt ausgelegt (kein `IF NOT EXISTS` auf Tabellen-/
Typ-Ebene); ein zweiter Lauf wuerde mit "already exists" fehlschlagen.

## D-034 · Endgueltiges Loeschen archivierter Dividendeneingaenge (enge Ausnahme von Grundsatz 3)
**Kontext:** Nutzer wollen fehlerhaft erfasste Dividendeneingaenge nicht nur archivieren,
sondern tatsaechlich entfernen koennen. Grundsatz 3 (PRODUCT_SPEC.md §3) schliesst Hard Delete
auf fachlichen Tabellen jedoch bewusst aus (kein stilles Loeschen, Audit-Pflicht); die einzige
bisherige Ausnahme war `imports` im Entwurfsstatus (0008), wo aber garantiert noch keine
abgeleiteten Daten existieren — bei `dividend_payments` als Kernbestand ist das nicht der Fall.
Der Nutzer wurde auf diesen Zielkonflikt hingewiesen und hat sich explizit fuer echtes Loeschen
statt einer reinen Erweiterung der Archivierung entschieden.
**Entscheidung:** Hard Delete wird zugelassen, aber ausschliesslich fuer bereits archivierte
eigene Zeilen (RLS-Policy `dividend_payments_delete_archived_own`, 0013) — der verpflichtende
Archivierungsschritt verhindert, dass ein aktiver Eingang durch eine einzelne, versehentliche
Aktion verschwindet. Die Loeschung selbst bleibt nachvollziehbar: `audit_row_change()` wurde um
den `DELETE`-Fall erweitert und protokolliert die geloeschte Zeile mit `action = 'delete'`,
bevor sie unwiderruflich entfernt wird (audit_action-Erweiterung in eigener Migration 0012, da
`ALTER TYPE ... ADD VALUE` vor Verwendung committet sein muss).
**Konsequenz:** Ab diesem Zeitpunkt existiert fuer `dividend_payments` kein vollstaendiger
Loeschschutz mehr — eine geloeschte Zeile ist nicht wiederherstellbar (nur der Audit-Log-Eintrag
bleibt). Migrationen 0012/0013 muessen wie in D-033 beschrieben manuell im Supabase SQL Editor
nachgezogen werden, und zwar **nacheinander in zwei getrennten Ausfuehrungen** (0012 zuerst
committen, danach 0013 einfuegen) — sonst schlaegt 0013 fehl, weil der neue Enum-Wert `'delete'`
nicht in derselben (impliziten) Transaktion verwendet werden darf, in der er hinzugefuegt wurde.

## D-035 · Optionales "Standard-Depot" an Unternehmen (Vorschlag, keine 1:1-Bindung)
**Kontext:** Der Nutzer wollte beim Anlegen eines Unternehmens direkt ein Depot zuweisen
koennen, um sowohl das Erfassen von Dividendeneingaengen (Depot-Feld vorausgefuellt) als
auch den Excel-Import (D-032) zu vereinfachen — die importierte Datei ist typischerweise
ein Depot-Export und traegt bereits eine Depot-/Broker-Spalte pro Zeile. DATA_MODEL.md §1
modelliert Unternehmen und Depots jedoch bewusst unabhaengig voneinander (n:m ausschliesslich
ueber `dividend_payments`); `recompute_business_fingerprint()` nutzt genau das, damit
dieselbe Aktie in mehreren Depots unterscheidbare Fingerprints erzeugt. D-006 begruendet an
anderer Stelle explizit, warum ein gespeichertes Zuordnungsfeld zu Widersprueche fuehren kann,
wenn eine spaetere Buchung doch abweicht.
**Entscheidung:** `securities.default_depot_id` (0014) wird ergaenzt, aber ausdruecklich nur
als unverbindlicher Vorschlag: Es fuellt das Depot-Feld beim Anlegen eines neuen
Dividendeneingangs vor (kann dort jederzeit geaendert werden) und wird beim Excel-Import
per Namensabgleich aus einer optionalen Depot-/Broker-Spalte gesetzt, sofern ein bestehendes
Depot mit passendem Namen existiert (kein automatisches Anlegen neuer Depots). Es gibt keine
Constraint, die eine abweichende Depot-Wahl je Zahlung verhindert — die n:m-Beziehung aus
DATA_MODEL.md §1 bleibt vollstaendig erhalten.
**Konsequenz:** Reine Komfortfunktion ohne Ruecksicht auf Datenkonsistenz-Risiken; kann
jederzeit ignoriert oder falsch vorbelegt sein, ohne dass das die eigentlichen Zahlungsdaten
verfaelscht.

## D-036 · `search_path` von Funktionen, die pgcrypto nutzen, muss `extensions` einschliessen
**Kontext:** Live-Fehler beim Archivieren eines Dividendeneingangs: "function digest(text,
unknown) does not exist". Ursache: Supabase installiert `pgcrypto` standardmaessig in ein
Schema `extensions`, nicht in `public` (anders als eine lokale, per CLI/psql angelegte
PostgreSQL-Instanz, wo `create extension pgcrypto;` ohne Schema-Angabe direkt in `public`
landet — siehe D-027, weshalb dieser Unterschied in der Implementierungsumgebung nicht
auffiel). `recompute_business_fingerprint()` (0009) ruft `digest()` auf, hatte aber keinen
eigenen `search_path`; sie erbte daher den des Aufrufers. Ein direktes UPDATE ueber
PostgREST funktioniert, weil die API-Verbindung `extensions` per Supabase-Standard im
`search_path` fuehrt — `archive_payment()` (0011) setzt jedoch explizit `search_path =
public` fuer sich selbst, wodurch der davon ausgeloeste BEFORE-Trigger `digest()` nicht mehr
findet. Lokal gegen eine simulierte Supabase-Schema-Aufteilung (`extensions`-Schema +
`grant usage ... to authenticated`, siehe TEST_STRATEGY.md-Luecke unten) reproduziert:
INSERT gelingt, `archive_payment()` schlaegt mit exakt derselben Fehlermeldung fehl.
**Entscheidung:** `recompute_business_fingerprint()` und `archive_payment()` bekommen
`set search_path = public, extensions` (0015). Nicht existierende Schemata im `search_path`
verursachen in Postgres keinen Fehler (sie werden bei der Namensaufloesung uebersprungen),
daher ist das auch gegen die lokale Test-Datenbank ohne `extensions`-Schema unschaedlich.
**Konsequenz:** Jede kuenftige Funktion, die eine Extension-Funktion aufruft (`digest`,
`gen_random_bytes`, …), muss denselben `search_path` explizit setzen — sich auf den
ererbten `search_path` des Aufrufers zu verlassen, ist auf dem echten Supabase-Projekt
nicht sicher, wenn irgendein Aufrufer (wie `archive_payment()`) den Pfad selbst einschraenkt.
Dieser Bug-Modus laesst sich mit der aktuellen lokalen Testumgebung (TEST_STRATEGY.md §5/§6)
nicht automatisiert abdecken, ohne das `extensions`-Schema samt Berechtigungen dort
nachzubilden — bislang nur manuell verifiziert, kein automatisierter Regressionstest.

---

## Offene Entscheidungen (bewusst vertagt)

| # | Thema | Vertagt bis |
|---|---|---|
| O-1 | Exakte SheetJS-Patch-Version — CDN in der bisherigen Sandbox-Umgebung nicht erreichbar (D-026), Prüfung erneut versuchen | Phase 4 |
| O-2 | ~~Hosting-Anbieter für das statische Frontend~~ — entschieden: GitHub Pages (D-030) | erledigt |
| O-3 | Supabase-Projektregion und Backup-Politik des Anbieters (zusätzlich zu eigenen JSON-Backups) | Phase 2 |
| O-4 | Konkrete Wertpapier-Stammdaten-Vorschlagsliste (Branchen-Taxonomie) | Phase 3 |
| O-5 | Umfang der Mapping-Vorlagen (nur letzte vs. benannte Bibliothek) | Phase 4 |
| O-6 | TypeScript-7-Umstieg | nach Phase 10 |
| O-7 | `database.types.ts` per `npm run gen:types` regenerieren und mit der handgepflegten Fassung abgleichen, sobald Docker/ein verlinktes Projekt verfügbar ist (D-028) | sobald verfügbar, spätestens Phase 3 |
| O-8 | ~~Echten Auth-Flow gegen ein reales Supabase-Projekt durchspielen~~ (D-029) | erledigt (Registrierung/Login live getestet, E-Mail-Bestätigung wegen Rate-Limit zwischenzeitlich deaktiviert) |
| O-9 | ~~Konkretes Supabase-Projekt anlegen und Umgebungsvariablen bereitstellen~~ | erledigt (Projekt `fylmynfwczvyqewnpdol`) |
| O-10 | ~~GitHub Pages Repo-Secrets eintragen, Pages-Quelle auf „GitHub Actions" stellen~~ (D-030) | erledigt |
| O-11 | Custom-SMTP-Anbieter (z. B. Resend) einrichten, damit E-Mail-Bestätigung ohne scharfes Rate-Limit dauerhaft aktiviert werden kann | vor Produktivbetrieb |
| O-12 | Migrationsweg gegen das reale Supabase-Projekt automatisieren (Supabase-CLI/Docker statt manuellem SQL Editor, D-033), sobald in der Implementierungsumgebung verfügbar | sobald verfügbar |

---

## Phase-4-Entscheidungen

### D-034 — exceljs statt SheetJS für den produktiven Import

SheetJS-CDN unerreichbar, npm-`xlsx` CVE-eingefroren (D-015/D-026). Der Phase-4-
Import nutzt daher durchgängig **exceljs** (dynamischer Import, eigener Chunk).
Damit ist die offene Frage **O-1 erledigt**. CSV wird von einem eigenen,
abhängigkeitsfreien Parser gelesen (UTF-8/BOM, Delimiter-Heuristik über mehrere
Zeilen, RFC-4180-Quoting) statt Papa Parse.

### D-035 — Importstatus bleibt beim bestehenden Enum

Die feineren Statuswerte der Aufgabenstellung (`uploaded`, `mapping_required`,
`ready`, `importing`, `completed_with_warnings`, `failed`) werden **nicht** als
DB-Enumwerte geführt. Verbindlich bleibt `analyzing → pending_confirmation →
committed → rolled_back / discarded` (D-010); die feineren Zustände sind reine
UI-Wizard-Phasen. Begründung: keine inkompatible Parallelstruktur; der atomare
Commit braucht keinen persistenten `importing`-Zwischenstatus (eine
fehlgeschlagene Transaktion rollt automatisch nach `pending_confirmation` zurück).

### D-036 — Netto-only: brutto = netto nach ausdrücklicher Bestätigung

Da die Datei nur Netto-EUR enthält und `gross_amount` NOT NULL ist, wird nach
expliziter Nutzerbestätigung im Mapping-Schritt `gross_amount = net_amount` und
Steuern = 0 gesetzt (erfüllt `net_amount_invariance` exakt). Es werden keine
Brutto-/Steuer-/FX-/Stückzahlwerte erfunden (bleiben `null`).

### D-037 — Neue Import-Unternehmen archiviert, nie automatisch aktiv

Durch den historischen Import neu entstehende Wertpapiere werden mit
`archived_at` gesetzt und `created_by_import_id` markiert
(`data_quality='incomplete'`). Bestehende Stammdaten behalten ihren Status; der
Import aktiviert nie ein archiviertes und archiviert nie ein aktives Unternehmen.

### D-038 — Atomarer Import ausschließlich serverseitig

Produktive Speicherung nur über die transaktionale RPC `commit_import`
(security invoker, ein Aufruf/eine Transaktion, serverseitige
Kontrollsummen-Verifikation), nicht über 1.439 Einzel-Inserts. Rückbau über
`rollback_import` (Soft Delete/Archivierung, audit-erhaltend). `guard_import_status`
macht `committed`/`rolled_back` final und nur über die RPCs erreichbar.

### Aktualisierte offene Entscheidungen

- **O-1 erledigt** (D-034): Excel-Parser ist exceljs, nicht SheetJS.
- **O-5** (Umfang Mapping-Vorlagen): Das Spaltenmapping wird in
  `imports.column_mapping` (jsonb) je Import persistiert; eine benannte
  Vorlagen-Bibliothek ist weiterhin vertagt.

### D-039 — Datenqualität spiegelt beim Speichern die Vollständigkeit wider

Beim Anlegen/Bearbeiten eines Wertpapiers wird `data_quality` aus den
Stammdaten neu abgeleitet (`deriveDataQuality`, eine Wahrheit für Formular und
Unternehmens-Import): **„OK" nur, wenn Ticker, ISIN, WKN, Land, Sektor und
Währung gefüllt sind**; Notiz und Standard-Depot zählen nicht. Ergänzt der
Nutzer bei einem importierten, archivierten Unternehmen die fehlenden Felder,
wechselt der Zustand automatisch von „Unvollständig" auf „OK"; fehlt etwas,
bleibt/wird es „Unvollständig". `needs_review` (ungültige Importquelle) hat
Vorrang, solange die Felder unvollständig sind.

## Phase-5A-Entscheidungen (Dashboard)

### D-5A-1 — Clientseitige Aggregation, keine materialisierten Views

Das Dashboard lädt die aktive Historie **einmal** (schlanke Spaltenauswahl) und
aggregiert alle Kennzahlen clientseitig in `lib/statistics`. Für den aktuellen
und absehbaren Datenumfang (Kontrollwert 1.439 Zeilen, Ziel ≥ 10.000) ist das
schnell, testbar und hält „Kennzahl = Summe der Drill-down-Liste" konstruktiv
konsistent (eine Codequelle). Materialisierte oder aggregierende Views werden
bewusst **nicht** eingeführt; sie bleiben eine spätere Option, falls die
Datenmenge dies erfordert (Neubewertung in Phase 5B).

### D-5A-2 — Dashboard-Query im `payments`-Namespace

Der Dashboard-Datensatz nutzt den Query-Key `['payments','dashboard']`, damit die
bestehenden Invalidierungen (`invalidateQueries(['payments'])` aus Anlegen,
Bearbeiten, Storno, Reaktivierung, Import-Commit/-Rollback) ihn per Präfix-Match
automatisch mitaktualisieren. Kein separates Invalidierungsschema, keine Gefahr
veralteter Summen.

### D-5A-3 — Jahresauswahl als URL-Zustand, clientseitige Filterung

Der ausgewählte Zeitraum liegt in der URL (`?year=2026` / `?year=all`) und wird auf
den bereits geladenen Datensatz angewandt. Vorteile: teilbare/persistente Ansicht,
Browser-Zurück/-Vorwärts, kein Refetch beim Jahreswechsel. Ungültige Parameter
fallen sicher auf das aktuelle Jahr zurück.

### D-5A-4 — `Money.toChartNumber()` als eng begrenzte Float-Ausnahme

Diagrammbibliotheken (recharts) benötigen `number` für Balkenhöhen. Statt eines
verbotenen `Number(betrag)` kapselt `Money.toChartNumber()` (via `Decimal.toNumber()`)
diese rein visuelle Umwandlung. Angezeigte Beträge/Tooltips stammen weiterhin aus
`formatMoney`, Aggregate aus `Money`/Decimal. Die Ausnahme ist in CALCULATION_RULES.md §8
dokumentiert.

### D-5A-5 — Effektiver Ausschüttungsmonat je Unternehmen

Auf Wunsch werden Auswertungen nicht am exakten Zahlungsdatum ausgerichtet, sondern
am geplanten Ausschüttungsmonat (Dividenden treffen mitunter später ein).
Umsetzung (nicht-destruktiv):
- Neues Feld `securities.payout_months` (smallint[] 1..12; leer = kein Plan). Das echte
  `pay_date` der Zahlungen bleibt unverändert.
- Reine Funktion `effectivePayDate` (`lib/statistics/effectiveMonth.ts`) ordnet jede Zahlung
  dem **letzten fälligen geplanten Monat am/vor dem Zahlungsmonat** zu (inkl. Rückverschiebung
  über den Jahreswechsel). Die geplanten Monate sind damit maßgebend: eine verspätete Dividende
  zählt zu dem Monat, für den sie fällig war, nicht zum nächstgelegenen (CALCULATION_RULES.md §10).
  Ohne Plan bleibt das echte Datum. (Frühere Fassung: „nächstliegender Monat" — auf Nutzerwunsch
  auf die fachlich maßgebende Rückwärtszuordnung geändert.)
- Der effektive Monat gilt **überall** (Dashboard-Kennzahlen/Diagramme, Eingangsliste:
  Jahr-/Monatsfilter, Sortierung, angezeigter Monat). Das echte Datum wird bei Abweichung
  zusätzlich ausgewiesen.
- Da der Plan clientseitige Stammdaten sind, wird der effektive Monat **clientseitig**
  berechnet; die Eingangsliste lädt dafür alle Zahlungen (paginiert) und filtert/sortiert lokal
  statt per serverseitigem Datumsfilter.

### D-5B-1 — Statistik teilt die Dashboard-Query, keine zweite Ladung

Der Statistikbereich nutzt denselben Query-Key `['payments','dashboard']` wie das
Dashboard (`useStatisticsData` → `useDashboardPayments`). Dadurch teilen sich beide
einen Cache-Eintrag; es entsteht keine zusätzliche Übertragung, keine zweite
Aggregationsquelle und keine Gefahr divergierender Summen. Die Neubewertung aus
D-5A-1 (materialisierte Views) bleibt negativ: die clientseitige Aggregation ist für
den Zielumfang (≥ 10.000 Eingänge, ≥ 500 Unternehmen) ausreichend schnell (O(n),
memoisiert; durch einen Skalierungstest belegt).

### D-5B-2 — Neue Kennzahlen ausschließlich in der Analytics-Schicht

Sämtliche Statistik-Aggregationen (`filterPayments`, `overviewStatistics`,
`yearStatistics`, `monthAcrossYearsStatistics`, `securityStatistics`,
`sortSecurityStatistics`, `depotStatistics`, `calendarMonthBuckets`,
`heatmapByYearMonth`, …) sind reine Funktionen in `src/lib/statistics`. Komponenten,
Tabellen und Diagramme erhalten fertige Werte; sie enthalten keine Aggregation,
Rundung oder Betrags-/Datumssortierung. So bleibt „Kennzahl = Summe der
Drill-down-Liste" konstruktiv konsistent (Grundsatz 6) und es gibt keine parallele Logik.

### D-5B-3 — „Durchschnittlicher Monat" über aktive Monate

Der Übersichtswert „Ø Monat" teilt die Gesamtsumme durch die Anzahl der Kalendermonate
**mit** Zahlungen (aktive Monate), nicht durch die volle Monatsspanne. Damit verwässern
zahlungsfreie Monate die historische Kennzahl nicht. Der Dashboard-Wert „Ø pro Monat"
(§5.4, auf ein Einzeljahr bezogen, Divisor 12 bzw. begonnene Monate) bleibt davon
unberührt; beide Definitionen sind in CALCULATION_RULES.md §5.4/§11.2 getrennt dokumentiert.

### D-5B-4 — URL-basierte, kombinierbare Statistikfilter mit Outlet-Kontext

Jahr, Unternehmen, Depot, Datenquelle und Zahlungsart liegen als kombinierbare
URL-Parameter vor (`?year=&security=&depot=&source=&type=`); Parsing/Serialisierung sind
reine, isoliert getestete Funktionen (`filterParams.ts`). Die Layoutseite wendet den
Filter **einmal** an und reicht den gefilterten Datensatz über den React-Router-
`Outlet`-Kontext (`context.ts`, bewusst Supabase-frei) an alle Unterbereiche weiter — eine
Filterung/Aggregation je Ansicht, isoliert testbare Unterbereiche.

### D-5B-5 — Tabellen paginiert statt virtualisiert

Die generische `StatTable` setzt Sortierung, Suche und **Paginierung** um (statt
Virtualisierung). Paginierung deckt die geforderte Skalierung (≥ 500 Unternehmen)
ohne zusätzliche Abhängigkeit ab, ist einfacher zugänglich (klare Fokus-/ARIA-Semantik,
`aria-sort`) und begrenzt die gleichzeitig gerenderten Zeilen. Virtualisierung bleibt eine
spätere Option, falls einzelne Seiten sehr groß werden.

### D-5B-6 — Endgültiges Löschen archivierter Unternehmen (analog D-034)

Wie bei Dividendeneingängen (D-034) können Unternehmen (`securities`) endgültig
gelöscht werden, aber ausschließlich nachdem sie archiviert wurden. Umsetzung
(Migration 0018): `grant delete` + Policy `securities_delete_archived_own`
(`user_id = auth.uid() and archived_at is not null`); der Audit-Trigger wird um
das DELETE-Ereignis erweitert (`action = 'delete'`). Die Fremdschlüssel
`dividend_payments.security_id` und `security_aliases.security_id` bleiben bei
`NO ACTION` — dadurch weist die Datenbank das Löschen eines Unternehmens mit noch
vorhandenen Zahlungen/Aliassen ab (Fehlercode 23503, in eine verständliche Meldung
übersetzt). So bleiben historische Zahlungen archivierter Unternehmen in allen
Auswertungen erhalten; löschbar sind nur archivierte Unternehmen ohne Historie.
Bearbeiten bleibt bei archivierten Unternehmen weiterhin erlaubt (Nachpflege von
Stammdaten, D-039) — anders als bei Dividendeneingängen, die im archivierten
Zustand nur reaktiviert oder gelöscht werden können.

### D-5B-7 — Bearbeiten/Löschen importierter Dividendeneingänge korrigiert

Zwei Fehler verhinderten das Ändern und Löschen **importierter** Eingänge
(manuelle Eingänge waren nicht betroffen):

- **Bearbeiten:** Das Formular sendete beim Speichern `source: "manual"` mit. Für
  einen importierten Eingang (`source = 'csv_import'`) löste der Trigger
  `protect_payment_immutables` (0009) daraufhin „Dieses Feld ist unveraenderlich"
  aus. Fix: Der Update-Pfad sendet nur noch die fachlich bearbeitbaren Felder;
  `source` und die Import-Herkunftsfelder werden ausschließlich beim Neuanlegen
  gesetzt.
- **Löschen:** Die Herkunftszeile `import_rows.payment_id` verwies mit
  `ON DELETE NO ACTION` auf die Zahlung; das endgültige Löschen scheiterte am
  Fremdschlüssel `import_rows_payment_id_fkey`. Fix (Migration 0019): Umstellung
  auf `ON DELETE SET NULL`. Die Herkunftszeile bleibt als Provenance-Historie
  erhalten, verliert aber ihren Verweis. Zusätzlich übersetzt `deletePayment`
  Fremdschlüsselfehler (23503) defensiv in eine verständliche Meldung.
