# DECISIONS.md

This file records durable project decisions that future work must respect.

It complements `CLAUDE.md`:

- `CLAUDE.md` defines how work should be approached.
- `DECISIONS.md` records what this project has already decided.

Only document decisions that materially affect future work.

---

# When to Add a Decision

Add an entry when the decision:

- affects future implementation choices
- has meaningful alternatives
- creates a lasting constraint or trade-off
- would otherwise be discussed again
- is important for product, architecture, data, UI/UX, security, performance, infrastructure or tooling

Do not document:

- minor implementation details
- temporary task notes
- obvious conventions
- short-lived workarounds
- decisions already documented elsewhere

Keep entries concise and practical.

---

# Decision Template

## ADR-000: Title

**Status:** Proposed | Accepted | Superseded | Deprecated  
**Scope:** Product | Architecture | Data | UI/UX | Security | Performance | Infrastructure | Tooling

### Decision

State what was decided in one clear paragraph.

### Why

Explain why this option was selected.

### Alternatives

List only meaningful alternatives and briefly explain why they were not chosen.

### Consequences

**Benefits**

- Main benefits

**Trade-offs**

- Accepted limitations or costs

### Guardrails

- Rules future work must respect

### Revisit When

- Conditions that justify reconsidering the decision

---

# Active Decisions

## Zur Herkunft dieser Liste

Die Einträge **D-002 bis D-6-6** waren im gesamten Projekt referenziert — in
Quelltextkommentaren, Migrationen und allen Spezifikationsdokumenten —, standen
aber nie in dieser Datei: Sie enthielt seit dem ersten Commit ausschließlich die
Vorlage. Rund dreißig Verweise liefen damit ins Leere.

Die Einträge unten wurden am 2026-07-29 aus den Belegen im Repository
rekonstruiert (Code, Migrationen, Spezifikationen). Sie geben wieder, was das
Projekt nachweislich umgesetzt hat, und tragen die jeweilige Fundstelle. Die
ursprünglichen Formulierungen sind nicht wiederherstellbar; wo eine Begründung
über den Beleg hinausgeht, ist sie als Herleitung gekennzeichnet.

Neue Entscheidungen folgen der Vorlage oben (ADR-Format, fortlaufend ab
ADR-002).

---

## D-002: Basiswährung EUR, Fremdwährung nur als Herkunftsangabe

**Status:** Accepted · **Scope:** Data

Alle Beträge werden in der Basiswährung des Profils gespeichert und ausgewertet
(EUR). Eine Zahlung in Fremdwährung führt den Originalbetrag zusätzlich in
`original_currency`/`original_gross`/`original_net`/`fx_rate` mit; gerechnet
wird ausschließlich mit dem Basiswährungsbetrag.

*Beleg:* `lib/statistics/mapPayment.ts` (EUR fest), `0009_dividend_payments.sql`
(`guard_base_currency_change`), CALCULATION_RULES.md §1.

*Nachtrag 2026-07-29:* Der Schutz galt nur für `profiles.base_currency`.
`depots.base_currency` war ein freies Textfeld — ein abweichender Wert führte zu
widersprüchlichen Währungszeichen und zur Vermischung von Beträgen.
Migration 0023 bindet die Depotwährung an die Profilwährung; das Formularfeld
ist nur noch eine Angabe.

## D-004: Kaufmännische Rundung, keine Bankers-Rundung

**Status:** Accepted · **Scope:** Data

ROUND_HALF_UP überall. HALF_EVEN wäre statistisch neutraler, weicht aber von
deutschen Broker-Abrechnungen ab; Übereinstimmung mit dem Beleg hat Vorrang.

*Beleg:* CALCULATION_RULES.md §3 (R-1 ff.), `lib/money/rounding.ts`.

## D-005: Steuererstattungen als positiver Netto-Eingang

**Status:** Accepted · **Scope:** Data

`payment_type = 'refund'` wird als positiver Nettobetrag mit Steuerfeldern = 0
erfasst; negative Steuerfelder gibt es nicht. Die Herkunft gehört in die Notiz.

*Beleg:* CALCULATION_RULES.md §4.

## D-006: Portfolio nur über das Depot, keine Zweitzuordnung

**Status:** Accepted · **Scope:** Data

Ein Dividendeneingang speichert kein Portfolio; es ergibt sich über
`depot.portfolio_id`. Ebenso ist `securities.default_depot_id` nur eine
Vorbelegungshilfe, keine Bindung — jede Zahlung wählt ihr Depot unabhängig.

*Herleitung:* Ein zweiter Pfad zur selben Information könnte auseinanderlaufen;
eine historische Zahlung würde bei einer Umgruppierung still ihr Portfolio
wechseln.

*Beleg:* DATA_DICTIONARY.md (Feld „Portfolio"), `0014_securities_default_depot.sql`.

## D-007: Kein Unique Constraint auf `business_fingerprint`

**Status:** Accepted · **Scope:** Data

Dubletten werden erkannt und angezeigt, nie technisch verhindert. Mehrere
Zahlungen desselben Unternehmens am selben Tag im selben Depot sind fachlich
möglich (Tranchen).

*Beleg:* `0009_dividend_payments.sql`, `lib/payments/dataQuality.ts`.

## D-008: ISIN-Prüfziffer im Client, Format in der Datenbank

**Status:** Accepted · **Scope:** Data

Die Datenbank prüft nur das Format (12 Zeichen, Muster). Die Luhn-Prüfziffer
prüft der Client — eine Prüfziffernlogik in SQL wäre schwer zu pflegen und
würde Altbestände blockieren.

*Beleg:* DATA_MODEL.md, `features/securities/schemas.ts`.

## D-009: Keine automatische Entscheidung bei Dubletten

**Status:** Accepted · **Scope:** Product

Der Import markiert mögliche Dubletten und legt sie dem Nutzer vor. Es gibt
keinen Schwellenwert, ab dem automatisch übersprungen oder zusammengeführt wird.

*Beleg:* IMPORT_SPEC.md §7, `lib/import/pipeline.ts`.

## D-010: `import_status` bleibt der verbindliche Zustandsraum

**Status:** Accepted · **Scope:** Data

`analyzing → pending_confirmation → committed → rolled_back / discarded`. Die
feineren Schritte des Assistenten sind reine UI-Phasen und werden nicht als
Enumwerte geführt.

*Beleg:* `0008_imports.sql`, IMPORT_SPEC.md §12.

## D-011: Kein Offline-Schreiben, keine Warteschlange

**Status:** Accepted · **Scope:** Architecture

Erfassen und Importieren erfordern eine Verbindung. Es gibt keine
Offline-Schreibwarteschlange und keinen IndexedDB-Cache der Finanzdaten.

*Herleitung:* Eine Warteschlange erzeugt genau die Fehlerklassen, die bei
Finanzdaten am teuersten sind — stille Doppel- und Verlustbuchungen. Der reale
Bedarf ist gering: Dividenden treffen nicht im Funkloch ein.

*Beleg:* ARCHITECTURE.md §6, `public/sw.js` (nur App-Hülle im Cache).

## D-012: Kein Optimistic Update für Finanzdaten

**Status:** Accepted · **Scope:** Architecture

Nach einer Mutation wird gezielt invalidiert; angezeigt wird erst der bestätigte
Serverzustand. Ein Betrag, der kurz erscheint und dann verschwindet, ist bei
Geld die falsche Rückmeldung.

*Beleg:* ARCHITECTURE.md §4.2, `features/*/hooks.ts`.

## D-013: TypeScript auf der 5.9-Linie

**Status:** Accepted · **Scope:** Tooling

Kein Upgrade auf 7.x vor Abschluss des Produktionsaudits; danach als eigener,
getesteter Schritt.

*Beleg:* ARCHITECTURE.md §2, `package.json`.

## D-014: Kein zusätzlicher App-PIN

**Status:** Accepted · **Scope:** Security

Der Schutz des Geräts ist Sache des Betriebssystems. Ein eigener PIN in der PWA
gäbe Sicherheit vor, die er nicht liefert (der Browser-Speicher bleibt lesbar).

*Beleg:* SECURITY_MODEL.md §1.

## D-015 / D-026: `xlsx` (SheetJS) nicht aus npm — abgelöst durch exceljs

**Status:** Superseded · **Scope:** Tooling

Das npm-Paket `xlsx` ist bei 0.18.5 mit bekannten CVEs eingefroren; die
gepflegten Fassungen liegen unter `cdn.sheetjs.com` (D-015). Diese Registry war
in der Implementierungsumgebung nicht erreichbar (D-026).

**Abgelöst:** Das Projekt verwendet `exceljs` aus npm, dynamisch nachgeladen
(rund 930 kB, eigener Chunk). Damit entfällt die externe Registry vollständig.

*Beleg:* `lib/xlsx/parseWorkbook.ts`, `package.json`.

## D-017: `numeric`-Spalten sind im Typsystem `string`

**Status:** Accepted · **Scope:** Data

`database.types.ts` typisiert Geldspalten als `string`, obwohl PostgREST auch
Zahlen liefern kann. Der Umweg über `lib/money` (Decimal) wird dadurch erzwungen
statt empfohlen.

*Beleg:* `src/lib/supabase/database.types.ts`, `repositories/normalizeAmountFields.ts`.

## D-021: Designsystem auf Tailwind 4 mit Farbrollen statt Farbwerten

**Status:** Accepted · **Scope:** UI/UX

Komponenten verwenden ausschließlich die Rollen des Designsystems
(`background`, `muted`, `negative`, `positive`, …), nie rohe Tailwind-Farben.
Nur so trägt der Dunkelmodus ohne Sonderfälle.

*Beleg:* `src/styles/index.css`, `components/ui/*`, UX_AND_DESIGN_SYSTEM.md.

*Nachtrag 2026-07-29:* Das Sicherungsmodul verstieß durchgehend dagegen
(`bg-green-50`, `bg-blue-50`, `text-gray-600`) und wurde angeglichen.

## D-027: Integrationstests gegen reines PostgreSQL, nicht gegen Supabase

**Status:** Accepted · **Scope:** Tooling

Die Testdatenbank wird aus `supabase/migrations` aufgebaut; `auth` wird über
`supabase/test-support/local-postgres-bootstrap.sql` emuliert. Die Supabase-CLI
(Docker) bleibt der Weg für die reguläre Entwicklung, ist für Tests aber nicht
nötig.

*Beleg:* `scripts/db/reset-test-db.sh`, `.github/workflows/ci.yml` (Job
`db-integration`).

## D-028: `database.types.ts` wird von Hand gepflegt

**Status:** Accepted · **Scope:** Tooling

`supabase gen types` benötigt Docker, das in der Implementierungsumgebung nicht
zur Verfügung steht. Die Datei wird deshalb bei jeder Migration von Hand
nachgezogen und gegen das angewendete Schema geprüft.

*Guardrail:* Sobald Docker oder ein verlinktes Projekt verfügbar ist, ersetzt
`npm run gen:types` die Datei.

*Beleg:* Dateikopf von `src/lib/supabase/database.types.ts`.

## D-030: Hash-Router wegen GitHub Pages

**Status:** Accepted · **Scope:** Architecture

GitHub Pages kennt kein serverseitiges SPA-Fallback; direkt aufgerufene Routen
liefen sonst in einen 404. Daher `createHashRouter` (`/#/eingaenge`) und
`base: "/Dividenden-Tracker/"` im Pages-Build.

*Beleg:* `src/app/router.tsx`, `vite.config.ts`, `.github/workflows/deploy-pages.yml`.

## D-032 / D-035: Unternehmens-Stammdatenimport und Standard-Depot

**Status:** Accepted · **Scope:** Product

Der Excel-Import für Unternehmensstammdaten (Name/Ticker/ISIN/WKN) wurde aus
Phase 4 vorgezogen (D-032). Eine Depot-/Broker-Spalte setzt per Namensabgleich
`securities.default_depot_id` als reine Vorbelegungshilfe (D-035) — keine
Bindung, keine automatische Anlage fehlender Depots.

*Beleg:* `features/securities/xlsxImport.ts`, `0014_securities_default_depot.sql`.

## D-034 / D-039 / D-6-1: Hard Delete als eng begrenzte Ausnahme

**Status:** Accepted · **Scope:** Data

Grundsatz ist Soft Delete (Stornierung). Endgültiges Löschen eines
Dividendeneingangs ist die einzige Ausnahme: zunächst nur für bereits
archivierte Zeilen (D-034), später auch für aktive (D-039/D-6-1). Jede Löschung
erfordert eine ausdrückliche Bestätigung und wird über einen AFTER-DELETE-
Trigger im Audit Log festgehalten.

*Beleg:* `0013_delete_payment.sql`, `0020_phase6_delete_and_duplicate_review.sql`,
`features/payments/dialogs.tsx`.

## D-036: `search_path` in jeder Datenbankfunktion festnageln

**Status:** Accepted · **Scope:** Security

Supabase legt pgcrypto in das Schema `extensions`, nicht in `public`. Eine
Funktion ohne festen `search_path` erbt den des Aufrufers — `archive_payment()`
scheiterte dadurch auf dem echten Projekt an `digest()`.

*Guardrail:* **Jede** neue Funktion setzt `search_path` explizit.

*Beleg:* `0015_fix_fingerprint_search_path.sql`.

*Nachtrag 2026-07-29:* Die fünf Funktionen aus `0022_restore_backup_rpc.sql`
hielten sich als einzige nicht daran; Migration 0023 zieht es nach.

## D-6-2: Archivierung heißt in der Oberfläche „Storno"

**Status:** Accepted · **Scope:** UI/UX

Technisch `archived_at`/`archive_reason`; in der Oberfläche „stornieren" und
„reaktivieren". Technische Feldnamen erscheinen nirgends im Text.

*Beleg:* `features/payments/PaymentsPage.tsx`, `dialogs.tsx`.

## D-6-3: Optimistic Concurrency über `updated_at`

**Status:** Accepted · **Scope:** Data

Ein UPDATE trifft nur, wenn `updated_at` unverändert ist; sonst meldet die
Anwendung einen Konflikt und lädt neu, statt still zu überschreiben.

*Beleg:* `repositories/payments.ts` (`PaymentConflictError`), `repositories/goals.ts`.

## D-6-4: „Keine Dublette"-Entscheidungen werden dauerhaft gespeichert

**Status:** Accepted · **Scope:** Product

Ein einmal geprüftes Paar verschwindet dauerhaft aus der Datenqualitätsansicht
(`duplicate_dismissals`), widerrufbar. Sonst müsste dieselbe Entscheidung bei
jedem Aufruf neu getroffen werden.

*Beleg:* `0020_phase6_delete_and_duplicate_review.sql`,
`repositories/duplicateDismissals.ts`.

## D-6-5: Auffälligkeiten benennen, nie automatisch handeln

**Status:** Accepted · **Scope:** Product

Die Datenqualitätsansicht zeigt mögliche Dubletten und ungewöhnliche Beträge an.
Sie storniert, löscht oder führt nichts von sich aus zusammen.

*Beleg:* `lib/payments/dataQuality.ts` (Dateikopf).

## D-6-6: Suche, Filter und Sortierung auf der geladenen Historie

**Status:** Accepted · **Scope:** Performance

Listenoperationen laufen auf der einmal geladenen, decimal-sicheren Historie im
Client — konsistent mit der Strategie der Auswertungen. Siehe **ADR-001** für
die Schwelle.

*Beleg:* `features/payments/PaymentsPage.tsx`, `features/payments/sortRows.ts`.

---

## D-7-1: Zeitraumvergleiche kappen immer beide Seiten

**Status:** Accepted · **Scope:** Fachlogik / Vertrauen in die Zahlen

Ist eines der beiden verglichenen Kalenderjahre das **laufende**, endet der
Vergleich auf **beiden** Seiten am selben Kalendertag. Ein laufendes Jahr gegen
ein volles Vorjahr zu stellen ist kein Vergleich, sondern eine systematische
Untertreibung — im Juli fehlen der einen Seite fünf Monate. Der Fehler fällt
nicht auf, weil das Ergebnis plausibel aussieht; genau deshalb steht die Regel
hier und nicht nur im Code.

Die Oberfläche **benennt** den Stichtag, statt ihn nur anzuwenden: Eine Zahl mit
der Überschrift „2026", die bis Juli reicht, führt sonst in die Irre.

*Beleg:* `lib/statistics/comparison.ts`, `tests/unit/lib/statistics/comparison.test.ts`
(25 Fälle), CALCULATION_RULES.md §11.10.

---

## D-7-2: Drill-down nur, wo die Zielliste die Zahl exakt wiedergibt

**Status:** Accepted · **Scope:** Grundsatz 6 (Drill-down-Garantie)

Die Zahlungsliste filtert auf Jahr und Monat, nicht auf einen Tag. Ein am
Stichtag angeschnittener Monat wird deshalb **nicht** verlinkt, sondern als
angeschnitten gekennzeichnet und erklärt.

*Warum nicht trotzdem verlinken:* Ein Link, der mehr zeigt als die Zahl daneben,
beschädigt das Vertrauen in beide. Die Garantie lautet „jede Kennzahl führt auf
**genau** ihre Zahlungen" — eine Ausnahme, die stillschweigend mehr zeigt, hebt
sie auf. Lieber kein Link mit Begründung als ein Link mit Abweichung.

*Beleg:* `features/statistics/ComparisonTab.tsx` (`MonthCell`),
`tests/unit/features/statistics/ComparisonTab.test.tsx`.

---

## D-7-3: Die Diagrammpalette wird gemessen, nicht ausgesucht

**Status:** Accepted · **Scope:** Designsystem / Barrierefreiheit

`--chart-1…6` sind in beiden Themes gegen die Kartenfläche durchgerechnet
(Helligkeitsband, Chroma-Untergrenze, CVD-Abstand benachbarter Slots,
Normalsicht-Abstand, Kontrast) und werden nur mit einem bestandenen Lauf
geändert. Die Reihenfolge ist fest; eine siebte Serienfarbe entsteht nie.

### Why

Die vorherige Palette war nach Augenmaß gesetzt und fiel in **beiden** Themes
durch: im Dunkelmodus lagen alle sechs Töne über dem Helligkeitsband, zwei unter
der Chroma-Untergrenze, und benachbarte Slots trennten mit ΔE 5,9 statt 8. Im
Hellmodus lagen Blau und Türkis bei ΔE 11,9 — auch mit vollem Farbsehen kaum
auseinanderzuhalten. `--chart-6` war mit einer Chroma von 0,02 praktisch Grau
und wurde trotzdem als Serienfarbe neben Blau eingesetzt (Vorjahresbalken im
Dashboard).

Die Werte sahen plausibel aus. Genau das ist der Punkt: Farbabstand ist
rechenbar, also wird er gerechnet.

### Guardrails

- Zwei Reihen (aktuell ↔ Referenz) sind immer Slot 1 gegen Slot 2.
- Statusfarben (`--positive`, `--negative`, `--warning`) sind reserviert.
- Identität hängt nie an der Farbe allein: Legende, Strichart und Datentabelle
  tragen dieselbe Aussage.

*Beleg:* `src/styles/index.css`, UX_AND_DESIGN_SYSTEM.md #1a.

---

## ADR-001: Historie vollständig im Client, Schwelle bei 10.000 Zahlungen

**Status:** Accepted  
**Scope:** Performance

### Decision

Dividendenliste, Übersicht und Statistik laden die **gesamte** aktive Historie einmal in den
Client (`fetchAllPayments` bzw. `fetchDashboardPayments`, jeweils in 1.000er-Seiten) und
filtern, sortieren, aggregieren und blättern dort. Das bleibt so, solange ein Konto weniger als
**10.000 Zahlungen** führt.

### Rationale

Die Auswertungen sind decimal-genau und laufen über `lib/money`/`lib/statistics`; sie im Client
zu halten hält Zahl und Wahrheit an einer Stelle (ARCHITECTURE.md §4.4/§4.5) und macht
Jahreswechsel, Filter und Drill-downs ohne Netzrunde möglich. Bei 1.439 Zahlungen (heutige
Kontrollmenge) ist das unmerklich.

**Gemessen am 2026-07-29** (Auswertungsschicht, Desktop-CPU; mobil erfahrungsgemäß Faktor 2–3):

| Datenmenge | JSON-Nutzlast | Money-Parsing | alle Aggregationen |
|---|---|---|---|
| 1.439 | 285 KiB | 8 ms | ≈ 52 ms |
| 10.000 | 1.988 KiB | 18 ms | ≈ 150 ms |

Die Schwelle ist damit belegt und nicht geschätzt: Bei 10.000 Zahlungen wird die
Übertragungsgrenze von rund 2 MB genau erreicht.

### Trade-offs

- Übertragung und Verarbeitung wachsen linear mit der Historie; jede Zahlung wird beim Laden zu
  einem `Money`-Objekt.
- Liste und Auswertungen holen die Historie unter zwei Query-Keys getrennt (vollständige Zeilen
  bzw. schlanke Projektion) — bei einem Wechsel zwischen den Bereichen also zweimal.

### Guardrails

- Kein serverseitiges Filtern/Paginieren einführen, solange die Schwelle nicht erreicht ist —
  es zerteilte die Auswertungen ohne Not.
- Bei Überschreiten in dieser Reihenfolge vorgehen: (1) beide Abfragen auf **eine** schlanke
  Projektion vereinheitlichen, (2) Aggregate serverseitig vorrechnen (RPC), (3) erst danach
  Liste serverseitig filtern und blättern.
- Jede Abfrage, die eine vollständige Tabelle lädt, läuft über `lib/supabase/fetchAllPages`.
  Eine Abfrage ohne `range()` liefert stillschweigend höchstens 1.000 Zeilen (siehe ADR-002).

### Revisit When

- Ein Konto überschreitet 10.000 aktive Zahlungen, **oder**
- das Laden der Liste dauert auf einem iPhone spürbar länger als eine Sekunde, **oder**
- die Übertragung je Aufruf überschreitet rund 2 MB.

---

## ADR-002: Vollständige Tabellen nur über `fetchAllPages`

**Status:** Accepted  
**Scope:** Data

### Decision

Jede Abfrage, die eine ganze Tabelle in den Client holt, läuft über
`src/lib/supabase/fetchAllPages.ts`. Direkte `select()`-Aufrufe ohne `range()`
sind für vollständige Bestände unzulässig.

### Why

PostgREST liefert nie mehr als `db-max-rows` Zeilen je Antwort (Supabase-Standard
1.000) und meldet die Kappung **nicht** als Fehler. Eine Abfrage ohne `range()`
sieht erfolgreich aus und ist unvollständig.

Genau das ist geschehen: Sicherung, Datenexport und die Konflikterkennung beim
Wiederherstellen luden ohne Paginierung. Bei 1.439 Zahlungen fehlten rund 439 in
jeder Sicherungsdatei und in jedem Export — ohne Warnung, und der
Integritätsblock bestätigte die gekappte Menge als korrekt.

### Consequences

**Benefits**

- Die Fehlerklasse existiert an genau einer Stelle und ist dort getestet.
- Fehler werden weitergereicht statt zu einer leeren Liste zu werden.

**Trade-offs**

- Der Aufrufer muss **eindeutig** sortieren (fachliches Feld plus `id`), sonst
  kann eine Zeile über die Seitengrenze hinweg doppelt oder gar nicht erscheinen.

### Guardrails

- Sicherung und Export prüfen die geladene Menge zusätzlich gegen `count` der
  Datenbank und brechen bei Abweichung ab (`assertComplete`). Eine fehlende
  Sicherung ist harmlos, eine unvollständige nicht.

### Revisit When

- Supabase ändert das Standardlimit, **oder**
- die Historie überschreitet ADR-001 und wird serverseitig aggregiert.

---

## ADR-003: Bedeutung der beiden Wiederherstellungsmodi

**Status:** Accepted  
**Scope:** Data

### Decision

- **merge** ergänzt, was fehlt. Vorhandene Zeilen bleiben unangetastet.
- **replace** stellt den Zustand der Sicherung her: Zeilen aus der Datei
  gewinnen, alles Übrige wird **storniert** — nie gelöscht.

`restore_backup` läuft vollständig in einer Transaktion; ein clientseitiges
Zusammenführen findet nicht statt.

### Why

Die ursprüngliche Fassung (0022) archivierte im Modus „replace" zuerst alles und
fügte anschließend mit `on conflict do nothing` ein. Da eine Sicherung dieselben
IDs mitbringt, tat jeder INSERT nichts: Wer seine eigene Sicherung einspielte,
hätte seinen gesamten Bestand storniert und nichts zurückerhalten.

### Guardrails

- „replace" verlangt eine ausdrückliche Bestätigung mit Nennung der Folgen.
- Kein Pfad der Wiederherstellung löscht Zeilen (Grundsatz 6, D-034).
- `business_fingerprint` wird beim Einspielen neu berechnet, nie aus der Datei
  übernommen — ein veralteter Wert verfälschte die Dublettenerkennung dauerhaft.
- Eine Wiederherstellung setzt `last_backup_at` **nicht**: Sie ist keine Sicherung.

### Revisit When

- Ein Anwendungsfall verlangt echtes Zusammenführen auf Feldebene mit
  Konfliktauflösung durch den Nutzer.

---

# Superseded Decisions

Move replaced decisions here instead of deleting them.

Reference the decision that replaced them.

- **D-015 / D-026** (SheetJS aus der Herstellerregistry) — abgelöst durch
  `exceljs` aus npm, siehe Eintrag oben.
