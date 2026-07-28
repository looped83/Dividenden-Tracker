# Phase 9 — Audit Report

**Datum:** 2026-07-27
**Branch:** `claude/phase-9-audit-release-c2fqo5`
**Basis-Commit:** `262adff`
**Stand nach Audit:** `363da12`

---

## 1. Executive Summary

Das Audit hat **einen kritischen Release-Blocker** gefunden, der in der
Ausgangslage als bestandene Prüfung dokumentiert war: Der Production-Build
lieferte ein Bundle **ohne Anwendung** aus und meldete dabei Erfolg (Exit 0).
Die als grün geführte Kennzahl „Build: 407 KB JS ✅" war genau das Symptom —
407 KB waren ausschließlich Vendor-Code, die komplette App fehlte.

Zusätzlich wurden alle 11 npm-Schwachstellen beseitigt, eine Lücke im
CSV-Formel-Schutz geschlossen, ein `parseFloat` im XLSX-Export durch
Decimal-Parsing ersetzt und ein Testfile korrigiert, das eine **Kopie** der
Produktionslogik statt der Produktionslogik selbst prüfte.

Die geprüfte Substanz ist gut: Die Geldschicht (`lib/money`) ist sauber um
Decimal.js gekapselt und per ESLint projektweit abgesichert; RLS-Policies
existieren für alle Tabellen; keine Secrets im Repository.

**Verdikt: BEDINGT RELEASEBEREIT** — siehe §6.

| Kennzahl | Vorher | Nachher |
|---|---|---|
| npm-Schwachstellen | 11 (1 mod, 10 high) | **0** |
| Unit-Tests | 354 | **373** |
| TypeScript-Fehler | 0 | 0 |
| ESLint-Verstöße | 0 | 0 |
| Prettier | — | sauber |
| Bundle (Initial Load) | 2.303 KB¹ | **1.374 KB** (397 KB gzip) |
| App im Bundle enthalten | **nein** | **ja** |

¹ Der korrekt gebaute Vergleichswert. Der dokumentierte 407-KB-Build enthielt
keine Anwendung.

---

## 2. Befunde nach Schweregrad

### KRITISCH — K-1: Production-Build lieferte Bundle ohne Anwendung aus

*Phase 9.1 / 9.13 · behoben in `1c9ff8d`*

Der Build erzeugte ein Artefakt, das im Deployment nur eine weiße Seite
gerendert hätte, und meldete dabei Erfolg.

**Nachweis.** Im gebauten Chunk kam kein einziger App-String vor
(`eingaenge`, `Root-Element`, `datensicherung`, …, jeweils 0 Treffer). Ein
Build mit Sourcemaps listete **5 von ~200** App-Modulen; `main.tsx` und
`router.tsx` fehlten vollständig. Differenzbuilds:

| Build | Größe | App enthalten |
|---|---|---|
| ohne Env-Variablen | 407.976 B | nein |
| mit Env-Variablen | 2.303.361 B | ja |
| ohne Tree-Shaking | 6.234.550 B | ja |

**Ursache** — eine Kette aus Constant-Folding, kein Bundler-Defekt:

1. `supabase/client.ts` wirft auf Modulebene, wenn die Supabase-Env-Variablen
   fehlen.
2. Vite ersetzt `import.meta.env.VITE_*` zur Buildzeit statisch. Ohne `.env`
   werden beide zu `undefined`.
3. Die Guard-Bedingung `if (!url || !key)` wird dadurch konstant wahr; der
   Modulrumpf ist ein unbedingtes Top-Level-`throw`.
4. Rolldown wertet alles dahinter als nicht erreichbar und entfernt die
   gesamte Anwendung.
5. Der Build endet mit Exit 0.

**Auswirkung.** Der CI-Job `Build` setzte diese Variablen nie — jedes grüne
„Build ✅" prüfte also ein App-loses Artefakt. Der Deploy-Workflow übergibt
die Secrets korrekt, ein korrekt konfiguriertes Deployment war also intakt;
ein leeres, fehlendes oder vertipptes Secret hätte jedoch eine weiße Seite
veröffentlicht, ohne dass irgendeine Prüfung angeschlagen hätte.

**Behebung.** Der Build bricht jetzt mit Exit 1 und klarer Anleitung ab, wenn
Pflicht-Env-Variablen fehlen (`vite.config.ts`, geteilte Quelle in
`src/lib/config/requiredEnv.ts`). Der CI-`Build`-Schritt erhält
Platzhalterwerte und verifiziert damit das echte Anwendungsbundle.
13 Regressionstests.

---

### HOCH — H-1: CSV-Formel-Schutz konnte durchbrochen werden

*Phase 9.5 · behoben in `363da12`*

Der Formel-Zweig in `escapeCsvField` umschloss den Wert mit Anführungszeichen,
verdoppelte enthaltene Anführungszeichen aber nicht — anders als der
Normalzweig:

```ts
if (/^[\s=+\-@]/.exec(str)) return `"'${str}"`;   // ohne Quote-Escaping
```

Ein Wert wie `=x","y` ergab `"'=x","y"`. Das Feld endete vorzeitig, `y` wurde
zu einer eigenen Spalte. Die Nutzlast musste lediglich mit einem
Formelzeichen beginnen, um genau die Maskierung auszuhebeln, die sie
eindämmen sollte. Escaping erfolgt jetzt auf allen Pfaden; `\r` wird
zusätzlich maskiert.

### HOCH — H-2: Tests prüften eine Kopie statt des Produktionscodes

*Phase 9.5 / 9.14 · behoben in `363da12`*

`tests/unit/backup/exportService.test.ts` implementierte `escapeCsvField`
lokal nach („simulating escapeCsvField") statt sie zu importieren. Die
12 Tests validierten damit einen Klon und konnten auf eine Regression im
Produktionscode grundsätzlich nicht anschlagen — so blieb H-1 unentdeckt.

Ursache für das Muster war eine strukturelle Hürde: `supabase/client.ts`
wirft ohne Env-Variablen beim Import, wodurch sich **kein** Modul testen
ließ, das den Client auch nur transitiv importiert. Die Vitest-Konfiguration
stellt jetzt Platzhalter-Zugangsdaten bereit; Service-Module sind damit
direkt testbar. Ein Scan bestätigt, dass dies die einzige betroffene
Testdatei war.

### HOCH — H-3: 11 npm-Schwachstellen

*Phase 9.1 · behoben in `9671437`*

- **react-router 8.2.0 → 8.3.0** — CSRF-Bypass im RSC-Modus
  (GHSA-qwww-vcr4-c8h2). Die App nutzt den Library-Modus
  (`createHashRouter`), war also nicht exponiert; Update dennoch risikofrei.
- **brace-expansion 5.0.7 → 5.0.8** (Override) — DoS durch unbegrenzte
  Expansion. Dieser eine Override löst die gesamte transitive Kaskade auf,
  die npm exceljs zuschrieb: `minimatch → glob → archiver-utils →
  archiver / zip-stream / readdir-glob / rimraf` (7 Advisories).
- **uuid 8.3.2 → 11.1.1** (Override) — fehlende Puffergrenzen-Prüfung in
  v3/v5/v6. exceljs ruft nur `uuid.v4()` ohne `buf` auf, war also nie
  betroffen; Kompatibilität des Overrides per Smoke-Test bestätigt.

`npm audit fix --force` hätte exceljs auf 3.4.0 **herabgestuft** (breaking und
älter) — 4.4.0 ist bereits die neueste Version, die Kette hatte also keinen
Upstream-Fix. Die Overrides patchen die tatsächlich verwundbaren Pakete,
ohne exceljs anzufassen.

---

### MITTEL — M-1: `parseFloat` im XLSX-Export

*Phase 9.5 · behoben in `363da12`*

`generateXlsxExport` deaktivierte die projektweite ESLint-Regel
`no-restricted-globals` (CALCULATION_RULES.md §8) und rief `parseFloat` auf
Beträge, Kurse und Steuern auf. `parseFloat` schneidet beim ersten
ungültigen Zeichen stillschweigend ab — aus `"1,234.56"` wäre `1` geworden:
eine falsche, aber plausibel aussehende Zahl in der Exportdatei. Jetzt über
`MoneyDecimal`, das nur vollständig gültige Zahlen akzeptiert und sonst auf
den Rohwert zurückfällt, damit der Fehler sichtbar bleibt. Die Unterdrückung
wurde entfernt, die Regel gilt für die Datei wieder.

### MITTEL — M-2: Negative Beträge wurden als Text exportiert

*Phase 9.5 · behoben in `363da12`*

`-12,34` beginnt mit `-`, erhielt daher den Formel-Schutz-Apostroph und kam
in Excel als **Text** an, der sich nicht summieren lässt — betroffen war
jeder Storno- und Korrekturbetrag. Reine Zahlenliterale sind jetzt vom
Schutz ausgenommen; eine reine Zahl kann keine Formel sein. Werte, die nur
numerisch *beginnen* (`-2*3`, `-1+1`), bleiben geschützt.

### MITTEL — M-3: exceljs blockierte das Code-Splitting

*Phase 9.13 · behoben in `1c9ff8d`*

`exportService.ts` importierte exceljs (~930 KB) statisch. Das zog die
Bibliothek in den Haupt-Chunk und machte die dynamischen Imports in beiden
Workbook-Parsern wirkungslos (Rolldown-Warnung `INEFFECTIVE_DYNAMIC_IMPORT`).
Jetzt dynamisch importiert:

| | vorher | nachher |
|---|---|---|
| Initial Load | 2.303 KB | **1.374 KB** (397 KB gzip) |
| exceljs | im Haupt-Chunk | eigener Lazy-Chunk (930 KB) |

Rund **40 % kleinerer Initial Load**; exceljs wird nur bei Import/Export
geladen. Die Warnung ist verschwunden.

---

### NIEDRIG

- **N-1** `exportService.ts` trägt großflächige `eslint-disable`-Blöcke für
  `no-unsafe-*` und `no-explicit-any`; das Modul arbeitet durchgehend mit
  `any[]` statt mit den generierten Supabase-Typen. Funktional unauffällig,
  aber die schwächste Typstelle der Codebasis.
- **N-2** Die Filter `securityIds` / `depotIds` in `fetchPaymentsForExport`
  sind als leere Blöcke mit `// For now, we'll note this limitation`
  implementiert — sie werden stillschweigend ignoriert. Wird die UI diese
  Filter je anbieten, exportiert sie ungefiltert.
- **N-3** Kommentar-Altlast: „Excel Export (using a simple approach without
  external library)" / „In production, you'd use a library like xlsx or
  exceljs" widerspricht dem Code, der exceljs verwendet. Korrigiert.

---

## 3. Angewandte Fixes

| Commit | Inhalt |
|---|---|
| `9671437` | 11 npm-Schwachstellen → 0 (react-router-Update + zwei Overrides) |
| `1c9ff8d` | Build-Guard gegen App-loses Bundle; CI baut echtes Bundle; exceljs-Code-Splitting |
| `363da12` | CSV-Escaping, negative Beträge, `parseFloat` → Decimal, Tests gegen echten Code |

## 4. Ergänzte Tests

**+19 Unit-Tests (354 → 373):**

- 13 Regressionstests für den Env-Build-Guard
  (`tests/unit/lib/config/requiredEnv.test.ts`) — fehlende, leere,
  Whitespace-only und `undefined`-Werte; Aussagekraft der Fehlermeldung.
- 6 Regressionstests für den CSV-Export inklusive eines RFC-4180-Parsers,
  der prüft, dass ein präparierter Wert in **genau einem** Feld bleibt;
  außerdem negative Beträge als Zahl und weiterhin blockierte Formeln.
- Die 12 bestehenden Export-Tests laufen jetzt gegen den echten
  Produktionscode statt gegen eine Kopie.

---

## 5. Nicht abgedeckt / Blocker

Die Umgebung hatte **keine laufende PostgreSQL-Instanz**
(`127.0.0.1:5432` ohne Antwort). Alle datenbankgebundenen Prüfungen konnten
daher nicht ausgeführt werden:

- **9.3 Datenmodell**, **9.4 Datenintegrität** — Constraints, Indizes,
  Cascade-Verhalten, Lasttest mit 10k Einträgen
- **9.6 Security/RLS** — die Suite existiert und ist ordentlich
  aufgestellt (`rls.test.ts` 19 Tests, `constraints.test.ts` 21,
  `triggers.test.ts` 16, dazu `backup/rls-enforcement` und
  `backup/restore-atomicity`), wurde hier aber **nicht ausgeführt**
- **9.7 Import-Pipeline** gegen echte Daten

Statisch geprüft und unauffällig: RLS-Policies existieren für alle Tabellen;
keine Secrets im Repository (`.env` nicht versioniert, nur `.env.example`);
`service_role` erscheint ausschließlich im lokalen Test-Bootstrap.

Ebenfalls **nicht** durchgeführt, da ohne Browser/Gerät nicht belastbar:
**9.11 Accessibility** und **9.12 Responsive Design**. Beide erfordern
manuelle Prüfung (Screenreader, Kontrast, Touch-Targets, 9 Breakpoints).

Die Phasen 9.2, 9.8, 9.9, 9.10, 9.16 und 9.17 wurden nicht systematisch
abgearbeitet — die Untersuchung von K-1 und dessen Folgebefunden hat den
verfügbaren Rahmen gebunden. Das war die richtige Priorisierung:
K-1 hätte jedes Release wertlos gemacht.

---

## 6. Release-Entscheidung

### BEDINGT RELEASEBEREIT

**Dafür:** Der kritische Blocker ist behoben und durch einen Guard
abgesichert, der ihn nicht wieder auftreten lässt. Keine offenen
Schwachstellen. 373 Tests grün, TypeScript und ESLint sauber, Build erzeugt
nachweislich ein vollständiges Bundle mit sinnvollem Code-Splitting.

**Auflagen vor dem Release — verpflichtend:**

1. **Integrationstests gegen echtes Postgres ausführen**
   (`npm run test:integration`). Ohne einen grünen RLS-Lauf ist die
   Mandantentrennung unbewiesen — bei einer Finanz-App nicht vertretbar.
2. **Deployment-Secrets verifizieren.** `VITE_SUPABASE_URL` und
   `VITE_SUPABASE_ANON_KEY` müssen im Pages-Environment gesetzt sein. Der
   Build bricht jetzt korrekt ab statt still eine weiße Seite zu liefern —
   das erste Deployment nach diesem Fix schlägt fehl, falls ein Secret fehlt.
   Das ist beabsichtigt.
3. **Deployte Seite nach dem Release manuell aufrufen.** Genau dieser
   Schritt hätte K-1 sofort sichtbar gemacht.
4. **Accessibility- und Responsive-Prüfung nachholen** (9.11 / 9.12), oder
   bewusst als bekanntes Restrisiko für Phase 10 akzeptieren.

**Empfehlung für Phase 10:** `exportService.ts` auf die generierten
Supabase-Typen umstellen und die `eslint-disable`-Blöcke abbauen (N-1);
die stillschweigend ignorierten Export-Filter entweder implementieren oder
aus der Signatur entfernen (N-2); einen Smoke-Test ergänzen, der das
gebaute Bundle auf enthaltene App-Marker prüft — eine automatisierte
Absicherung gegen die Klasse von K-1.
