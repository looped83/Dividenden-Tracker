# IMPORT_SPEC.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliche Importspezifikation (Planungsphase)

Leitsätze (aus den Produktgrundsätzen):

- Keine Datei erzeugt unmittelbar nach der Auswahl produktive Daten (Grundsatz 10).
- Keine Zeile geht stillschweigend verloren — die Importbilanz muss aufgehen (Grundsatz 5).
- Kein unbemerkter Doppelimport (Grundsatz 4); mögliche Duplikate entscheidet der Nutzer.
- Jeder Import ist vollständig rückrollbar (Grundsatz 11).

---

## 1. Unterstützte Formate

| Format | Parser | Anmerkungen |
|---|---|---|
| CSV | Papa Parse 5.5 (Streaming, Web Worker) | Trennzeichen `;` `,` `\t` (Auto-Erkennung + manuelle Wahl) |
| XLSX | SheetJS CE 0.20.x | Mehrere Tabellenblätter, Formelwerte (`cellFormula` wird ignoriert, `v`-Werte genutzt) |
| XLS (BIFF) | SheetJS CE 0.20.x | Best effort; bei Parserfehler klare Meldung mit Empfehlung „als XLSX exportieren" |

Zeichenkodierung (CSV): UTF-8, UTF-8 mit BOM, Windows-1252/ISO-8859-1 (Heuristik: BOM-Prüfung →
UTF-8-Validierung → Fallback Windows-1252; Umlaute-Stichprobe wird in der Vorschau angezeigt,
Kodierung manuell umschaltbar).

## 2. Dateiregeln und Limits

| Regel | Wert | Verhalten bei Verstoß |
|---|---|---|
| Max. Dateigröße | 20 MB | Ablehnung vor dem Parsen, klare Meldung |
| Max. Datenzeilen | 50.000 | Ablehnung mit Hinweis auf Aufteilung (z. B. jahrweise) |
| Dateityp-Prüfung | Endung + Magic Bytes (`PK` für XLSX, `D0 CF` für XLS) | Ablehnung „Dateityp nicht erkannt" |
| Beschädigte Datei | Parserfehler wird abgefangen | Fehlerbild mit Ursache; niemals Teilimport ohne Hinweis |
| Leere Datei / nur Kopfzeile | — | Meldung „keine Datenzeilen gefunden" |

Die Datei selbst verlässt den Browser nicht (ARCHITECTURE.md §5); gespeichert werden nur
normalisierte Zeilen + Metadaten.

## 3. Importprozess — 25 kontrollierte Schritte

Der Assistent führt durch vier Phasen; die Schritte entsprechen 1:1 der Vorgabe:

**Phase A — Datei (Schritte 1–4):**
1. Datei auswählen oder per Drag-and-drop hinzufügen (iPad/iPhone: Dateien-App über `<input type="file">`)
2. Dateigröße und Dateityp prüfen (§2)
3. Datei-Hash berechnen (SHA-256, Web Crypto) → Stufe-1-Duplikatprüfung gegen `imports.file_hash`
4. Datei analysieren (Encoding, Trennzeichen, Struktur; im Web Worker)

**Phase B — Struktur (Schritte 5–12):**
5. Bei Excel: Tabellenblatt auswählen (Liste aller Blätter mit Zeilen-/Spaltenzahl-Vorschau)
6. Kopfzeile erkennen (Heuristik: erste Zeile mit ≥ 2 nicht-numerischen eindeutigen Zellen) oder manuell festlegen; zusätzliche Überschrift-/Titelzeilen davor werden als „übersprungen (Strukturzeile)" klassifiziert
7. Rohdatenvorschau anzeigen (erste 50 Zeilen, Original-Zellwerte, Monospace)
8. Spalten automatisch vorschlagen (Synonym-Wörterbuch: „Datum/Date/Zahltag/Pay Date" → `pay_date`; „Netto/Net/Betrag" → `net_amount`; …)
9. Spalten manuell zuordnen (Pflichtziele: Datum, Wertpapier-Kennung, Betrag; unbekannte/zusätzliche Spalten bleiben sichtbar als „nicht importiert")
10. Datumsformat erkennen (Stichprobe über alle Zeilen: `DD.MM.YYYY`, `DD.MM.YY`, `YYYY-MM-DD`, `MM/DD/YYYY`, `DD/MM/YYYY`, Excel-Serienwert 1900/1904) — bei Mehrdeutigkeit (z. B. 03/04/2024) manuelle Festlegung erzwungen
11. Zahlenformat erkennen (deutsch `1.234,56` / englisch `1,234.56` / neutral `1234.56`; Spaltenweise Stichprobe; Mehrdeutigkeit → manuelle Festlegung)
12. Währungen erkennen (eigene Spalte, Symbol im Betrag `€ $ £`, oder globale Auswahl)

**Phase C — Prüfung (Schritte 13–19):**
13. Daten normalisieren (Datum → ISO, Beträge → Decimal-Strings, Währung → ISO-4217, Whitespace/Umlaute-Normalisierung NFC, Ticker/ISIN uppercase)
14. Jede einzelne Zeile validieren (Zod-Schema je Zeile; Fehler mit Zeilennummer, Spalte, Originalwert, Grund)
15. Exakte Duplikate erkennen (Stufe 2, §7)
16. Mögliche fachliche Duplikate erkennen (Stufen 3–4, §7)
17. Kontrollsummen erzeugen (Anzahl, Σ brutto, Σ netto je Währung — zur Abstimmung mit der Quelle, MIGRATION_PLAN.md)
18. Fehler und Warnungen anzeigen (gruppiert nach Typ, jede betroffene Zeile einsehbar)
19. Nutzerentscheidung zu unsicheren Zeilen (je mögliche-Duplikat-Zeile: „importieren" / „überspringen" / Vergleichsansicht mit vorhandenem Datensatz; je Fehlerzeile: nur „ausschließen" oder Abbruch und Datei korrigieren)

**Phase D — Bestätigung (Schritte 20–25):**
20. Importzusammenfassung anzeigen (Bilanz §8 + Kontrollsummen + Zielkonto/Depot-Zuordnung)
21. Ausdrückliche Bestätigung verlangen (Button nennt Konsequenz: „1.219 Eingänge endgültig importieren")
22. Alle bestätigten Datensätze atomar speichern (`commit_import`-RPC, eine Transaktion; Serverseite prüft Bilanz erneut und lehnt bei Abweichung komplett ab)
23. Importbericht erzeugen (persistiert in `imports.row_report` + `row_balance` + `checksums`)
24. Importhistorie speichern (Status `committed`)
25. Vollständigen Import-Rollback ermöglichen (§10)

Abbruch ist in jeder Phase möglich; vor Schritt 22 existieren ausschließlich Metadaten
(`imports` mit Status `analyzing`/`pending_confirmation`), keine Zahlungen.

## 4. Spaltenzuordnung

Zielfelder des Mappings (min.): Zahlungsdatum*, Unternehmen/Name*, Ticker, ISIN, WKN,
Depot, Bruttobetrag¹, Nettobetrag¹, Quellensteuer, inländische Steuer, Soli, Kirchensteuer,
Gebühren, Währung, Originalbrutto, Originalnetto, Wechselkurs, Stückzahl, Dividende je Aktie,
Zahlungsart, Notiz. (* Pflicht; ¹ mindestens einer von beiden Pflicht — fehlt einer, wird er
NICHT stillschweigend gleichgesetzt, sondern die Zeile erhält eine sichtbare Vorbelegung
„netto = brutto, Steuern = 0" nur nach expliziter globaler Nutzerentscheidung im Assistenten.)

- Mapping-Vorschläge per Synonymliste (de/en), Fuzzy-Match (Levenshtein ≤ 2) nur als Vorschlag.
- Ein Mapping kann als **Vorlage** gespeichert werden (jsonb in `imports.column_mapping`,
  wiederverwendbar für Folgeimporte derselben Quelle, z. B. jährliche Numbers-Exporte).
- Wertpapier-Zuordnung: ISIN > Ticker > normalisierter Name (Reihenfolge fest). Kein Treffer →
  Wertpapier wird mit `data_quality='incomplete'` neu angelegt und im Bericht als „neu angelegt"
  ausgewiesen. Name-Treffer mit abweichender ISIN → Zeile wird Warnung „prüfen".
- Depot-Zuordnung: Spalte, sonst globale Auswahl eines Zieldepots (Pflicht vor Schritt 20).

## 5. Normalisierung im Detail

| Eingabe | Regel |
|---|---|
| Datum | Erkanntes Format je Datei (nicht je Zeile!); Excel-Serienwerte über SheetJS-Datumsmodus inkl. 1904-Workbooks; Ergebnis ISO `YYYY-MM-DD`; unplausible Daten (< 1970, > heute) → Fehlerzeile |
| Beträge | String-basiertes Parsen nach erkanntem Zahlenformat → Decimal; niemals `parseFloat`; Tausendertrennzeichen entfernt; `−`/`(123,45)` → negativ; leere Zelle = „nicht angegeben" (nie 0 erzwingen, außer Feld hat Default 0) |
| Währung | Symbol→ISO-Mapping (€→EUR, $→USD nach Rückfrage bei mehrdeutigen Symbolen, £→GBP, CHF, …); Kleinbuchstaben → Großbuchstaben |
| Text | Trim, NFC-Normalisierung, Mehrfach-Whitespace zusammengefasst; Originalwert bleibt im `row_report` erhalten |
| Formeln (Excel) | Es zählt der berechnete Wert; Zellen ohne cached value → Fehlerzeile „Formel ohne Ergebniswert" |
| Leere Zeilen | Klassifiziert als „leer/übersprungen", zählen in der Bilanz als bewusst ausgeschlossen (Kategorie strukturell) |
| Negative Beträge | Erlaubt nur mit Zahlungsart `correction`/`cancellation` (automatischer Vorschlag, Nutzerbestätigung in Schritt 19) |

## 6. Import-Lebenszyklus (Status)

```
analyzing → pending_confirmation → committed → rolled_back
        ↘ discarded            ↘ discarded
```

`committed` und `rolled_back` sind endgültig und bleiben dauerhaft in der Historie sichtbar.

## 7. Duplikaterkennung (vier Stufen)

**Stufe 1 — Datei-Duplikat:** SHA-256 der Rohdatei == `imports.file_hash` eines früheren
Imports (Status `committed`) → deutliche Warnung „Diese Datei wurde am … bereits importiert";
Fortfahren möglich (z. B. nach Rollback), aber nie stillschweigend.

**Stufe 2 — Exakter Zeilen-Fingerprint:** SHA-256 über die normalisierten, gemappten Zellwerte
(Feldreihenfolge fest, Trennzeichen ``). Treffer gegen `dividend_payments.row_fingerprint`
(aktive Zeilen) → Klassifikation „exaktes Duplikat", Standard: übersprungen; Nutzer kann
einzeln auf „trotzdem importieren" setzen (mit Begründung im Bericht).

**Stufe 3 — Fachlicher Fingerprint:** SHA-256 über
`user | pay_date | Wertpapierschlüssel (ISIN > Ticker > normalisierter Name) | net_amount
(fallback gross_amount) auf 2 Nachkommastellen | original_currency | depot`.
Treffer gegen `business_fingerprint` aktiver Zahlungen → „bestätigtes Duplikat" (auch wenn die
Quellzeile anders formatiert ist). Standard: übersprungen, einzeln übersteuerbar.

**Stufe 4 — Mögliche Duplikate (heuristisch):** Kandidaten, wenn gleiches Wertpapier UND
mindestens zwei der folgenden Bedingungen: Zahlungsdatum ±3 Tage · Betragsabweichung ≤ 1 % oder
≤ 0,05 in Basiswährung · gleicher Monat und gleiche Stückzahl · Name ähnlich
(normalisiert, Levenshtein-Ratio ≥ 0,85) bei fehlender ISIN · gleicher Betrag in anderer
Währung/anderem Depot. Diese Zeilen werden **nie automatisch** entschieden: keine
Überschreibung, keine Löschung, kein Verwerfen — der Nutzer sieht Quellzeile und vorhandenen
Datensatz nebeneinander und entscheidet je Zeile (Schritt 19).

## 8. Importbilanz

Invariante (client- UND serverseitig geprüft; bei Verletzung wird der Commit verweigert):

```
Gesamtzahl analysierter Datenzeilen
  = gültige neue Zeilen
  + ungültige Zeilen (mit Grund)
  + bestätigte Duplikate (Stufe 2/3, übersprungen)
  + mögliche Duplikate (Stufe 4, je nach Nutzerentscheidung importiert ODER übersprungen — beide Zweige bleiben ausgewiesen)
  + bewusst ausgeschlossene Zeilen (Nutzerentscheidung oder strukturell: leer/Strukturzeile)
```

Anzeigebeispiel (verbindliches UI-Muster):

```
1.243 Datenzeilen analysiert

1.219 gültige neue Eingänge
   11 exakte Duplikate
    5 mögliche Duplikate
    6 fehlerhafte Zeilen
    2 bewusst ausgeschlossene Zeilen
```

Jede Kategorie ist aufklappbar bis auf Einzelzeilenebene (Zeilennummer, Originalinhalt, Grund).
`row_report` persistiert diese Klassifikation vollständig und dauerhaft.

## 9. Sicherheit beim Import

- **CSV-Formula-Injection:** Beim Import werden Zellwerte nie als Formeln interpretiert (nur
  Werte). Beim **Export** werden Zellen, die mit `=`, `+`, `-`, `@`, Tab oder CR beginnen, mit
  führendem `'` geschützt (SECURITY_MODEL.md §9).
- Dateityp über Magic Bytes, Größenlimit vor dem Einlesen, Parser in Web Worker (Isolation,
  UI bleibt bedienbar, Abbruch möglich).
- Alle importierten Strings laufen durch dieselbe Zod-Validierung wie manuelle Eingaben;
  Längenlimits verhindern Speicher-/DB-Missbrauch.
- ZIP-Bomben-Schutz (XLSX = ZIP): entpackte Größe wird von SheetJS begrenzt geprüft;
  Analyse-Timeout im Worker (60 s) mit sauberem Abbruch.

## 10. Import-Rollback

- Verfügbar für jeden Import im Status `committed`, jederzeit (auch nach Monaten).
- `rollback_import(import_id)` in einer Transaktion:
  1. Archiviert alle `dividend_payments` mit diesem `import_id` (`archived_at`,
     `archive_reason = 'Import-Rollback'`, Audit `origin='rollback'`).
  2. Archiviert Wertpapiere/Depots, die **durch diesen Import angelegt** wurden und keine
     anderen aktiven Zahlungen mehr haben (nachvollziehbar im Bericht).
  3. Setzt `imports.status='rolled_back'`, `rolled_back_at=now()`.
- Nachträglich vom Nutzer **bearbeitete** Zeilen des Imports werden nicht stillschweigend
  mitarchiviert: Der Rollback-Dialog listet sie vorab („3 Eingänge wurden seit dem Import
  geändert") und verlangt eine explizite Entscheidung (mitarchivieren / behalten).
- Ein Rollback ist selbst auditiert und in der Importhistorie dauerhaft sichtbar; die Datei
  kann danach erneut importiert werden (Stufe 1 warnt, blockiert aber nicht).

## 11. Fehlerbilder (verbindliche Meldungsqualität)

Jede Fehler-/Warnmeldung nennt: Zeilennummer der Quelldatei, Spaltenname, Originalwert,
konkreten Grund („‚31.02.2024' ist kein gültiges Datum"), und — wo möglich — einen
Lösungshinweis. Sammelmeldungen („17 Zeilen fehlerhaft") sind immer aufklappbar.

---

## 12. Umsetzung Phase 4 (Ist-Stand)

Diese Sektion dokumentiert die tatsächlich implementierte Fassung und begründet
Abweichungen von der Planung oben.

### Bibliotheken (Abweichung ggü. §1)

- Excel: **exceljs** (nicht SheetJS). `cdn.sheetjs.com` ist in der
  Implementierungsumgebung nicht erreichbar und das npm-Paket `xlsx@0.18.5` ist
  mit bekannten CVEs eingefroren (DECISIONS.md D-015/D-026). exceljs wird per
  dynamischem Import als eigener Chunk geladen. Damit erledigt sich die offene
  Frage O-1 (SheetJS-Version).
- CSV: eigener, abhängigkeitsfreier Parser (`src/lib/import/parseCsv.ts`) mit
  UTF-8/BOM-Erkennung, Mehrzeilen-Delimiter-Heuristik (`;` `,` Tab) und
  RFC-4180-Quoting statt Papa Parse.

### Import-Pipeline (reine Funktionen, `src/lib/import/`)

`excelDate` (1900/1904-Serien) · `parseDate` (de/iso/slash + Excel-Serie,
Mehrdeutigkeitsmeldung) · `parseAmount` (deutsch/englisch/neutral, nie
`parseFloat`, Decimal) · `normalizeName` · `similarity` (Levenshtein +
Token-Enthaltensein) · `columnMapping` (Synonyme de/en) · `matchCompany`
(Stufen A–D) · `brokerMatch` · `fingerprint` (SHA-256 via Web Crypto) ·
`checksums` (Decimal, je Jahr/Broker) · `pipeline` (Normalisierung/Gruppierung) ·
`buildCommitPayload` (RPC-Nutzlast inkl. erwarteter Kontrollsummen).

### Netto-only-Beträge (Konkretisierung §4/§12)

Die Datei enthält nur Netto in EUR. Nach ausdrücklicher Nutzerbestätigung im
Mapping-Schritt wird `gross_amount = net_amount`, alle Steuern = 0 gesetzt
(die `net_amount_invariance`-Constraint ist damit exakt erfüllt). Es werden
**keine** Brutto-/Steuer-/FX-/Stückzahlwerte erfunden — diese bleiben `null`
bzw. bei den Steuer-Defaultspalten 0.

### Statusmodell (Abweichung ggü. §6)

Verbindlich bleibt der bestehende `import_status`-Enum
(`analyzing → pending_confirmation → committed → rolled_back / discarded`,
DECISIONS.md D-010). Die feineren Zustände der Aufgabenstellung
(`uploaded`/`mapping_required`/`ready`/`importing`/`completed_with_warnings`/…)
sind reine UI-Wizard-Phasen und werden **nicht** als zusätzliche DB-Enumwerte
geführt (keine inkompatible Parallelstruktur). `importing` benötigt keinen
persistenten Status, da der Commit atomar in einer Transaktion läuft.

### Unternehmensmatching (Stufen, umgesetzt)

- A ISIN/WKN (in dieser Datei nicht vorhanden), B exakter kanonischer Name
  (genau ein Treffer → Autovorschlag), C bestätigter Alias, D ähnliche Namen
  **nur als Hinweis**. `Allianz`/`Allianz SE`, `Realty Income`/`… Corporation`,
  `JP Morgan`/`JPMorgan Chase & Co`, `JPM EU/US Equity` werden nie automatisch
  zusammengeführt (Unit-Tests `matching.test.ts`).

### Kontrollsummen (verifiziert gegen die reale Datei)

1.439 Zeilen · 15.11.2012–17.07.2026 · **49.391,57 €** · Broker Consorsbank 312 /
Trade Republic 1.012 / Scalable Capital 115 · alle 15 Jahreswerte exakt ·
Gladstone Capital 30.09.2025 bleibt zweimal (4,76 € und 7,84 €). Die Serverseite
(`commit_import`) verifiziert dieselben Summen erneut und lehnt bei Abweichung
den gesamten Import ab (Integrationstest `tests/integration/import.test.ts`).

## Phase 6 – Erneuter Import nach Einzellöschung

Wird ein importierter Eingang einzeln dauerhaft gelöscht (§13.4), bleibt der
übergeordnete Importlauf nachvollziehbar und die übrigen Zeilen desselben
Imports unverändert; die Herkunftszeile der gelöschten Zahlung bleibt als
Provenance erhalten (`import_rows.payment_id = null`, 0019).

Die Import-Dublettenerkennung arbeitet über den `business_fingerprint`
(fachliche Identität), nicht über `(import_id, source_row_number)`. Nach einer
Einzellöschung existiert dieser Fingerprint nicht mehr; die Zeile wird bei einem
erneuten Import derselben Datei daher wieder als importierbar angeboten (und,
falls gleichartige Zahlungen bestehen, gemäß bestehender Logik als mögliche
Dublette gekennzeichnet). Es gibt keinen stillen „bereits verarbeitet"-
Ausschluss — der Nutzer entscheidet (D-6-5, konsistent mit D-007/D-009).
Import-Identität und Dublettenlogik bleiben unverändert.
