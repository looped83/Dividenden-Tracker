# DATA_DICTIONARY.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliches Datenlexikon (Planungsphase)

Klassifikation jedes Feldes:

- **P** = Pflichtfeld (vom Nutzer bzw. Import zwingend zu liefern)
- **O** = optionales Feld
- **A** = abgeleitetes Feld (wird aus anderen Feldern berechnet, nie direkt eingegeben)
- **T** = technisch verwaltetes Feld (System/Trigger, nie vom Client gesetzt)

Typangaben entsprechen DATA_MODEL.md; Rundungs- und Parsing-Regeln: CALCULATION_RULES.md und
IMPORT_SPEC.md.

---

## 1. Dividendeneingang (`dividend_payments`)

### Identifikation

| Feld | Kl. | Typ | Bedeutung / Regeln |
|---|---|---|---|
| `id` | T | uuid | Interne ID, systemvergeben |
| `user_id` | T | uuid | Eigentümer; immer `auth.uid()`, durch RLS + Trigger erzwungen |
| `security_id` | P | uuid → securities | Wertpapier/Unternehmen. Bei Import ggf. automatisch angelegt (dann `data_quality='incomplete'`) |
| `depot_id` | P | uuid → depots | Depot des Zahlungseingangs |
| (Portfolio) | A | — | Ergibt sich über `depot.portfolio_id`; nicht am Eingang gespeichert (DECISIONS.md D-006) |

### Zahlung

| Feld | Kl. | Typ | Bedeutung / Regeln |
|---|---|---|---|
| `pay_date` | P | date | Tatsächliches Zahlungs-/Wertstellungsdatum. Nicht in der Zukunft (Grundsatz 8) |
| `gross_amount` | P | numeric(14,2) | Bruttobetrag in Basiswährung, final gerundet (R-1) |
| `net_amount` | P | numeric(14,2) | Nettobetrag in Basiswährung. Bei nur-Brutto-Quellen manuell zu bestätigen, keine stille Ableitung |
| `withholding_tax` | O (Default 0) | numeric(14,2) | Ausländische Quellensteuer in Basiswährung |
| `domestic_tax` | O (Default 0) | numeric(14,2) | Inländische Steuer (Kapitalertragsteuer) in Basiswährung |
| `solidarity_surcharge` | O | numeric(14,2) | Solidaritätszuschlag |
| `church_tax` | O | numeric(14,2) | Kirchensteuer |
| `fees` | O | numeric(14,2) | Gebühren/Spesen |
| `original_currency` | P | char(3) | ISO-4217. Bei EUR-Zahlung = 'EUR' |
| `original_gross` | O¹ | numeric(18,6) | Bruttobetrag in Originalwährung, ungerundet wie in Quelle |
| `original_net` | O¹ | numeric(18,6) | Nettobetrag in Originalwährung |
| `fx_rate` | O¹ | numeric(18,8) | Verwendeter Wechselkurs: Einheiten Basiswährung je 1 Einheit Originalwährung; `Betrag_Basis = Betrag_Original × fx_rate` (Konvention R-2) |
| `quantity` | O | numeric(18,6) | Stückzahl, Bruchteile erlaubt (Sparpläne) |
| `amount_per_share` | O/A | numeric(18,8) | Dividende je Aktie in Originalwährung. Direkt erfassbar; wenn leer und `quantity` vorhanden, als Anzeige-Ableitung `original_gross ÷ quantity` berechnet, aber dann **nicht** gespeichert (A) |

¹ Pflicht als Gruppe, sobald `original_currency ≠ Basiswährung` (Constraint `fx_fields_consistency`).

### Klassifikation

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `payment_type` | P (Default `regular`) | enum | `regular` · `special` · `correction` · `cancellation` · `refund` · `other`. `correction`/`cancellation` dürfen negative Beträge tragen |

### Herkunft

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `source` | T | enum | `manual` · `csv_import` · `excel_import` · `restore`; vom System anhand des Erfassungswegs gesetzt, danach unveränderlich |
| `import_id` | T | uuid → imports | Pflicht bei Import-Herkunft, sonst null; unveränderlich |
| `source_file_name` | T | text | Ursprünglicher Dateiname (Import/Restore) |
| `source_row_number` | T | int | Datenzeilennummer in der Quelldatei (1-basiert, nach Kopfzeile) |
| `row_fingerprint` | T | text | SHA-256 des exakten normalisierten Zeileninhalts (Stufe-2-Duplikate) |
| `business_fingerprint` | T/A | text | SHA-256 fachlicher Schlüsselfelder; serverseitig per Trigger berechnet (CALCULATION_RULES.md §5) |

### Dokumentation

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `note` | O | text ≤ 5000 | Persönliche Notiz |
| `created_at` | T | timestamptz | Erstellungszeitpunkt |
| `updated_at` | T | timestamptz | Letzter Änderungszeitpunkt (Trigger) |
| `archived_at` | T | timestamptz | Archivierungs-/Stornozeitpunkt (Soft Delete) |
| `archive_reason` | O | text | Begründung bei Archivierung/Storno |
| Änderungsverlauf | A | — | Keine Spalte; ergibt sich aus `audit_log` (entity_id = id) |

---

## 2. Wertpapier/Unternehmen (`securities`)

| Feld | Kl. | Typ | Bedeutung / Regeln |
|---|---|---|---|
| `id`, `user_id` | T | uuid | wie oben |
| `name` | P | text ≤ 200 | Anzeigename des Unternehmens; eindeutig je Nutzer (case-insensitive) |
| `ticker` | O | text ≤ 20 | Börsenkürzel, Großbuchstaben |
| `isin` | O | char(12) | Format + Luhn-Prüfziffer (clientseitig); eindeutig je Nutzer |
| `wkn` | O | char(6) | Deutsche Wertpapierkennnummer |
| `country` | O | char(2) | ISO 3166-1 alpha-2 (Sitzland) |
| `sector` | O | text | Branche (Freitext mit Vorschlagsliste) |
| `currency` | O | char(3) | Übliche Ausschüttungswährung (nur Anzeige/Vorbelegung) |
| `note` | O | text ≤ 5000 | Persönliche Notiz |
| `data_quality` | T/A | enum | `ok` · `incomplete` (z. B. per Import ohne ISIN angelegt) · `needs_review` (z. B. Namenskonflikt beim Import); vom System gesetzt, vom Nutzer auf `ok` setzbar |
| `default_depot_id` | O | uuid → depots | Unverbindlicher Vorschlag für das Depot-Feld beim Anlegen eines Dividendeneingangs und beim Excel-Import (Namensabgleich); keine 1:1-Bindung, jede Zahlung wählt ihr Depot weiterhin unabhängig (D-035) |
| `payout_months` | O | smallint[] (1..12) | Geplante Ausschüttungsmonate. Leer = kein Plan. Steuert die Zuordnung einer Zahlung zum effektiven Monat in allen Auswertungen und der Eingangsliste (nächstliegender Monat inkl. Jahresverschiebung, CALCULATION_RULES.md §10). Ändert das echte `pay_date` der Zahlungen nicht |
| `created_at`, `updated_at`, `archived_at` | T | timestamptz | wie oben |
| Abgeleitet (nie gespeichert) | A | — | Summe je Jahr/Monat, Ø-Zahlung, Anzahl Zahlungen, Steuersummen, Anteil am Gesamteinkommen — Formeln in CALCULATION_RULES.md §6 |

## 3. Depot (`depots`)

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `id`, `user_id` | T | uuid | |
| `name` | P | text ≤ 100 | Eindeutig je Nutzer |
| `broker` | O | text ≤ 100 | |
| `base_currency` | P (Default EUR) | char(3) | Kontowährung des Depots (informativ; Beträge werden stets in Profil-Basiswährung geführt) |
| `portfolio_id` | O | uuid → portfolios | Optionale Gruppierung |
| `note` | O | text ≤ 2000 | |
| `created_at`, `updated_at`, `archived_at` | T | | |
| Abgeleitet | A | — | Zahlungen je Depot, Jahres-/Monatssummen, Anteil am Dividendeneinkommen |

## 4. Portfolio (`portfolios`)

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `id`, `user_id` | T | uuid | |
| `name` | P | text ≤ 100 | Eindeutig je Nutzer |
| `note` | O | text ≤ 2000 | |
| `created_at`, `updated_at`, `archived_at` | T | | |

## 5. Import (`imports`)

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `id`, `user_id` | T | | |
| `file_name` | T | text | Originaldateiname |
| `file_hash` | T | char(64) | SHA-256 der Rohdatei (Stufe-1-Duplikate) |
| `file_size_bytes` | T | bigint | |
| `file_type` | T | enum-Check | `csv` · `xlsx` · `xls` |
| `sheet_name` | T | text | Gewähltes Tabellenblatt (nur Excel) |
| `status` | T | import_status | Lebenszyklus, siehe IMPORT_SPEC.md §6 |
| `column_mapping` | T | jsonb | Endgültige Spaltenzuordnung inkl. manueller Eingriffe |
| `detected_formats` | T | jsonb | Encoding, Trennzeichen, Datums-/Zahlenformat, Kopfzeile |
| `row_balance` | T | jsonb | Importbilanz (Zeilenklassifikation, IMPORT_SPEC.md §8) |
| `row_report` | T | jsonb | Je Zeile: Nummer, Klassifikation, Grund, Fingerprint |
| `checksums` | T | jsonb | Kontrollsummen (Σ brutto, Σ netto, Anzahl) |
| `created_at`, `committed_at`, `rolled_back_at` | T | timestamptz | |

## 6. Ziel (`goals`)

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `id`, `user_id` | T | | |
| `goal_type` | P | enum | `net_year` · `gross_year` · `rolling_12m` · `avg_month_net` · `long_term` |
| `year` | P bei Jahreszielen | int | Kalenderjahr des Ziels |
| `target_year` | P bei `long_term` | int | Zieljahr des Langfristziels |
| `target_amount` | P | numeric(14,2) | Zielbetrag > 0 |
| `currency` | T (=Basiswährung) | char(3) | |
| `note` | O | text | |
| Zielerreichung | A | — | Berechnung in CALCULATION_RULES.md §6.20; nie gespeichert |

## 7. Profil (`profiles`)

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `id` | T | uuid | = auth.users.id |
| `base_currency` | P (Default EUR) | char(3) | Basiswährung aller Auswertungen; nur bei leerem Datenbestand änderbar |
| `locale` | P (Default de-DE) | text | Formatierung |
| `theme` | O | text | light/dark/system |
| `backup_reminder_days` | P (Default 30) | int | Erinnerungsintervall |
| `last_backup_at` | T | timestamptz | Letztes erfolgreiches Backup |

## 8. Audit-Eintrag (`audit_log`)

| Feld | Kl. | Typ | Bedeutung |
|---|---|---|---|
| `id` | T | bigint | fortlaufend |
| `user_id` | T | uuid | Verursacher = Eigentümer |
| `entity_type`, `entity_id` | T | | Betroffene Entität |
| `action` | T | enum | insert · update · archive · unarchive · import_commit · import_rollback · restore |
| `old_values`, `new_values` | T | jsonb | Diff der fachlichen Felder; Ausschlussliste in SECURITY_MODEL.md §8 |
| `origin` | T | enum | ui · import · rollback · restore · migration |
| `created_at` | T | timestamptz | |

---

## 9. Felder im manuellen Erfassungsformular (Stand: vereinfachtes Formular)

Das aktuelle manuelle Erfassungsformular (`src/features/payments/NewPaymentPage.tsx`) fragt
nach einer Vereinfachung auf Nutzerwunsch nur noch vier Felder ab:

1. Depot (`depot_id`) — ggf. vorbelegt aus dem Standard-Depot des gewählten Unternehmens
   (`securities.default_depot_id`, siehe §2, D-035)
2. Wertpapier (`security_id`)
3. Zahlungsdatum (`pay_date`)
4. Nettobetrag (`net_amount`) — Eingabe im deutschen Zahlenformat mit Komma als
   Dezimaltrennzeichen, wird intern auf das kanonische Punkt-Format normalisiert

Alle übrigen Spalten dieser Tabelle (Bruttobetrag, Steuern, Fremdwährungsfelder, Stückzahl,
Zahlungsart, Notiz) bleiben Teil des Datenbankschemas (siehe §1) und werden vom manuellen
Formular programmatisch belegt, nicht abgefragt: `gross_amount` = `net_amount`,
`withholding_tax`/`domestic_tax` = 0, übrige Steuer-/Fremdwährungsfelder = `null`,
`original_currency` = Basiswährung des gewählten Depots, `payment_type` = `'regular'`. Diese
Felder bleiben nur über den Excel-/CSV-Import oder direkte Datenbankzugriffe befüllbar.
Fehlende Steuerdetails setzen den Eingang **nicht** auf schlechtere Datenqualität (Steuern = 0
ist ein gültiger Zustand, z. B. Freistellungsauftrag).

---

## Phase 4 — Import (neue Felder/Tabellen)

- `securities.created_by_import_id` uuid → imports(id), null bei manuell/regulär angelegten. Zusammen mit `archived_at is not null` ⇒ Anzeige „Historisch – durch Import erstellt".
- `depots.created_by_import_id` uuid → imports(id).
- `security_aliases(alias_normalized, security_id, source_import_id)` — bestätigte Namenszuordnung; `alias_normalized` = `normalizeCompareName(Quellname)` (NFC, lower, Whitespace/Apostroph/Bindestrich vereinheitlicht).
- `import_rows(import_id, source_row_number, payment_id, classification, raw, normalized, warnings)` — Herkunft je Quellzeile. `classification ∈ {imported, excluded, duplicate_skipped, invalid}`. `raw`/`normalized` sind jsonb der Original- bzw. normalisierten Werte.
- `imports.checksums` (jsonb, nach Commit gefüllt): `{ row_count, total_net, min_date, max_date, by_year:{<jahr>:{count,sum}}, by_broker:{<name>:{count}} }`.
- Beträge des historischen Imports: `net_amount = gross_amount` (EUR), Steuern 0, `original_currency='EUR'`, `original_gross/net/fx_rate/quantity/amount_per_share = null` (keine erfundenen Werte).

## Dashboard-abgeleitete Werte (Phase 5A)

Das Dashboard führt **keine neuen Spalten oder Tabellen** ein; alle Kennzahlen werden zur
Laufzeit aus `dividend_payments` abgeleitet (Analytics-Schicht `lib/statistics`). Begriffe:

- **Aktiver Eingang** — `dividend_payments.archived_at is null`. Basis aller Dashboard-Kennzahlen.
  Stornierte und über `rollback_import()` zurückgerollte Zeilen sind archiviert und damit
  ausgeschlossen.
- **Zeitraum-Nettosumme** — `Σ net_amount` über aktive Eingänge im gewählten Zeitraum
  (Datumsdimension `pay_date`).
- **Historische Gesamtsumme** — `Σ net_amount` über **alle** aktiven Eingänge, unabhängig von der
  Jahresauswahl.
- **Archivstatus (Anzeige)** — `securities.archived_at` / `depots.archived_at ≠ null` liefern das
  „Archiviert"-Label; die zugehörigen aktiven Zahlungen bleiben in allen Kennzahlen enthalten.
- **`DashboardPaymentRow`** — reduzierte Projektion (`id, pay_date, net_amount, gross_amount,
  security_id, depot_id, payment_type, source, created_at`) für die einmalige Übertragung.

## Statistik-abgeleitete Werte (Phase 5B)

Der Statistikbereich führt **keine neuen Spalten oder Tabellen** ein; alle Werte werden zur
Laufzeit aus `dividend_payments` (aktive Eingänge, effektiver Monat §10) über die Analytics-Schicht
`lib/statistics` abgeleitet. Datenbasis und Archivregeln wie oben (Phase 5A). Begriffe:

- **Durchschnittliche Zahlung** — `Σ net_amount ÷ Anzahl Zahlungen` (`averagePayment`).
- **Durchschnittlicher Monat** — `Σ net_amount ÷ Anzahl aktiver Monate`, wobei ein aktiver Monat ein
  Kalendermonat (Jahr+Monat) mit ≥ 1 Zahlung ist (`averagePerActiveMonth`, `activeMonthCount`).
- **Bester/Schwächster Monat** — Kalendermonat mit maximaler/minimaler Nettosumme; „schwächster"
  nur unter Monaten mit Zahlungen (`bestMonthInYear`/`worstMonthInYear`).
- **Bestes Jahr** — Kalenderjahr mit maximaler Nettosumme (`bestYear`).
- **Größte Einzelzahlung** — `max net_amount` je Unternehmen (`largestPayment`).
- **Veränderung zum Vorjahr** — Vergleich der Jahressummen (`comparePeriods`, §6.4); „kein
  Vergleich", wenn das Vorjahr in der Datenbasis fehlt.
- **Statistikfilter** — kombinierbare, URL-serialisierte Kriterien (`StatisticsFilter`): `year`
  (effektives Kalenderjahr), `securityId`, `depotId`, `source` (= `dividend_payments.source`),
  `paymentType` (= `dividend_payments.payment_type`). `null` = keine Einschränkung.
- **Entwicklung über die Jahre / Monate** — Zeitreihen je Unternehmen/Depot/Monat
  (`yearlyBuckets`, `calendarMonthBuckets`, `monthlyBuckets`), rein aus aktiven Eingängen.

## Phase 6

- **Status (Oberfläche):** `archived_at is null` → „Aktiv", sonst „Storniert".
  Die Begriffe „Stornieren/Reaktivieren/Stornogrund" bezeichnen den
  `archived_at`/`archive_reason`-Mechanismus (D-6-2); technische Feldnamen
  bleiben unverändert.
- **Datenquelle (`source`):** `manual` → „Manuell", `csv_import` → „CSV-Import",
  `excel_import` → „Excel-Import", `restore` → „Wiederhergestellt".
- **`note`:** optionale Notiz (≤ 5000 Zeichen), im Anlege-/Bearbeitungsformular
  editierbar, durchsuchbar.
- **`duplicate_dismissals.pair_key`:** `min(id):max(id)` der beiden als „keine
  Dublette" markierten Zahlungen.
