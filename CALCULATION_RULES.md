# CALCULATION_RULES.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliche Berechnungs- und Rundungsregeln (Planungsphase)

Dieses Dokument ist die **einzige Quelle** für Geldarithmetik, Rundung und Kennzahldefinitionen.
Client (`lib/money`, `lib/statistics`) und Datenbank-Views implementieren exakt diese Regeln;
Abweichungen sind Fehler (Testabgleich: TEST_STRATEGY.md §4).

---

## 1. Grundprinzip

1. **Niemals** IEEE-754-Gleitkommazahlen für finanzielle Werte: kein `parseFloat`, kein `+`
   auf Beträgen, keine `number`-Beträge in Zustand oder API-Payloads. Beträge wandern als
   **Strings** zwischen UI, Client-Logik und Postgres.
2. Client-Arithmetik ausschließlich über Decimal.js; Persistenz ausschließlich `numeric`.
3. Gerundet wird **nur an fachlich definierten Stellen** (§3). Zwischenwerte bleiben ungerundet.
4. ESLint-Regel (eigene Rule/Verbotliste) verhindert `parseFloat`, `Number(...)` und
   arithmetische Operatoren auf als Geld getypten Werten (`Money`-Branded-Type in TypeScript).

## 2. Datentypen

| Wert | Postgres | Client (Decimal.js) | Skala |
|---|---|---|---|
| Beträge in Basiswährung (brutto, netto, Steuern, Gebühren) | `numeric(14,2)` | Decimal | exakt 2 Nachkommastellen (final gerundet) |
| Originalbeträge (Fremdwährung) | `numeric(18,6)` | Decimal | bis 6 Nachkommastellen, wie Quelle |
| Dividende je Aktie | `numeric(18,8)` | Decimal | bis 8 Nachkommastellen |
| Stückzahl | `numeric(18,6)` | Decimal | Bruchteile (Sparpläne) |
| Wechselkurs | `numeric(18,8)` | Decimal | bis 8 Nachkommastellen |
| Prozentwerte (Anzeige) | — (abgeleitet) | Decimal | Anzeige 1 Nachkommastelle |

Decimal.js-Konfiguration: `precision: 30`, `rounding: ROUND_HALF_UP`, `toExpNeg/-Pos` so, dass
nie Exponentialschreibweise entsteht. Ein dünner Wrapper `Money`/`Qty`/`Rate` kapselt Decimal
und erzwingt Währungs- und Skalenkontext im Typsystem.

## 3. Rundungsregeln (R-Regeln)

| Regel | Wo wird gerundet | Verfahren |
|---|---|---|
| **R-1 Basisbeträge** | Genau einmal: beim Festschreiben eines Eingangs (manuell/Import/Umrechnung) auf 2 Nachkommastellen | ROUND_HALF_UP (kaufmännisch) |
| **R-2 Währungsumrechnung** | `basis = original × fx_rate`, danach R-1. Konvention: `fx_rate` = Einheiten Basiswährung je 1 Einheit Originalwährung (z. B. USD→EUR: 0,92). Das Formular zeigt die Umrechnung vor dem Speichern zur Bestätigung | ROUND_HALF_UP auf 2 Stellen |
| **R-3 Summen** | Summen über gespeicherte 2-Stellen-Beträge sind exakt; **keine erneute Rundung** | — |
| **R-4 Durchschnitte/Quoten** | Erst am Ende der Berechnung für die Anzeige: Beträge auf 2 Stellen, Prozentwerte auf 1 Stelle | ROUND_HALF_UP |
| **R-5 Anzeige** | `Intl.NumberFormat('de-DE', {currency})` ausschließlich zur Formatierung bereits gerundeter Werte; Formatierung rundet nie selbst (Skala stimmt bereits) | — |
| **R-6 Export** | Exporte enthalten die gespeicherten Werte in voller Skala (2 bzw. 6/8 Stellen), Dezimalpunkt-Notation in der Sicherung und in CSV, echte Zahlen und Datumswerte in Excel | — |
| **R-7 Dividende je Aktie (Anzeige-Ableitung)** | `original_gross ÷ quantity`, Anzeige auf max. 6 Stellen | ROUND_HALF_UP |

Es gibt **keine** Bankers-Rundung (HALF_EVEN): deutsche Abrechnungen runden kaufmännisch;
Konsistenz mit Broker-Belegen hat Vorrang (DECISIONS.md D-004).

## 4. Betragsinvariante je Eingang

```
net_amount = gross_amount
           − withholding_tax − domestic_tax
           − coalesce(solidarity_surcharge,0) − coalesce(church_tax,0)
           − coalesce(fees,0)                          [± 0,02 Toleranz]
```

- Toleranz 0,02 in Basiswährung deckt Rundungsdifferenzen der Quelle (Broker) ab.
- Verletzung: **Warnung** mit Anzeige der Differenz; Speichern nur nach ausdrücklicher
  Bestätigung („Differenz 0,03 € akzeptieren") — niemals stilles Anpassen eines Wertes.
- Für `payment_type in ('correction','cancellation')` gilt die Invariante mit Vorzeichen
  analog; für `refund` gilt: `gross_amount = net_amount + …` kann entfallen (reine
  Steuererstattung: brutto = netto, Steuerfelder negativ zulässig? **Nein** — Erstattungen
  werden als positiver Netto-Eingang mit `payment_type='refund'` und Steuerfeldern = 0 erfasst;
  die Herkunft gehört in die Notiz. Siehe DECISIONS.md D-005).
- Als CHECK-Constraint in Postgres hinterlegt (Toleranzform). Eine clientseitige
  Vorabprüfung gibt es nicht: Die App erfasst keine Steuerfelder (brutto = netto), die
  Invariante kann aus ihren Eingaben nicht verletzt werden.

## 5. Fingerprint-Berechnung (normativ)

> Seit Migration 0038 (ADR-009) speichert die Datenbank keine Fingerprints mehr. Der
> Zeilen-Fingerprint wird nur noch im Import-Assistenten berechnet.

`business_fingerprint = sha256(join(US,
  user_id,
  pay_date (ISO),
  securityKey,          -- ISIN, sonst Ticker, sonst lower(NFC(name)) ohne Mehrfach-Whitespace
  amount,               -- net_amount, wenn vorhanden, sonst gross_amount; Format "-?d+.dd"
  original_currency,
  depot_id ))`

`US` = Unit Separator (\x1F). Serverseitig per Trigger berechnet; der Client berechnet ihn
nur für die Import-Vorprüfung mit identischer Spezifikation (Testvektoren in
TEST_STRATEGY.md §2 stellen Gleichheit sicher).

`row_fingerprint = sha256(join(US, …alle gemappten, normalisierten Zellwerte in fester
Zielfeld-Reihenfolge…))` — unabhängig von Quellformatierung (Excel vs. CSV desselben Inhalts
ergibt denselben Fingerprint erst auf Stufe 3, nicht notwendig auf Stufe 2).

## 6. Kennzahldefinitionen

### Gemeinsame Basisregeln (gelten für ALLE Kennzahlen, Abweichungen je Kennzahl vermerkt)

| Aspekt | Basisregel |
|---|---|
| Datenbasis | Nur aktive Eingänge (`archived_at is null`). Stornierte/archivierte Zahlungen fließen **nie** in Statistiken ein; `cancellation`-Gegenbuchungen (als aktive negative Eingänge) fließen ein und neutralisieren die Ursprungszahlung |
| Felder | `net_amount` bzw. `gross_amount` in Basiswährung; Datumsdimension = `pay_date` (Kalenderjahr/-monat) |
| Zahlungsarten | Alle Typen inkl. `special`, `correction`, `refund`, `other` — Korrekturen mit Vorzeichen (können Summen senken). Separate Kennzahlen weisen `special`/`correction` einzeln aus |
| Filterverhalten | Global gesetzte Filter (Depot, Unternehmen, Währung, Zahlungsart, Zeitraum) wirken auf **alle** Kennzahlen der jeweiligen Ansicht gleichzeitig; die Drill-down-Liste trägt exakt dieselben Filter |
| Rundung | R-3/R-4: Summen exakt, Durchschnitte/Prozente erst zur Anzeige |
| Nullwerte | Monate/Jahre ohne Zahlungen zählen als 0 (werden in Zeitreihen ausgewiesen, nicht ausgelassen); Division durch 0 → Kennzahl „—" (nicht 0, nicht ∞) |
| Negative Korrekturen | Fließen vorzeichenrichtig ein; eine Monats-/Jahressumme kann negativ sein und wird so angezeigt |
| Teiljahre | Kein Hochrechnen. Laufende Zeiträume sind über die Beschriftung der Kennzahl erkennbar (z. B. „Aktueller Monat (Juli 2026)", „Dividenden 2026"); Durchschnitte über Monate zählen nur Monate ≤ aktueller Monat (laufendes Jahr) bzw. alle 12 (abgeschlossene Jahre) |
| Fehlende Vorjahresdaten | Vergleichswert „—", prozentuale Veränderung „—" (nie 0 % oder ∞); Hinweis „keine Vorjahresdaten" |

### Einzeldefinitionen

| # | Kennzahl | Formel (auf Basis aktiver Eingänge, Basiswährung) |
|---|---|---|
| 6.1 | Netto pro Monat | `Σ net_amount` gruppiert nach (Jahr, Monat aus `pay_date`) |
| 6.2 | Brutto pro Monat | `Σ gross_amount` je (Jahr, Monat) |
| 6.3 | Netto pro Jahr | `Σ net_amount` je Jahr |
| 6.4 | Brutto pro Jahr | `Σ gross_amount` je Jahr |
| 6.5 | YTD (netto/brutto) | Σ über `pay_date ∈ [01.01.J, heute]` |
| 6.6 | Vorjahresvergleich (gleicher Zeitraum) | Vergleichssumme über `[01.01.(J−1), gleicher Kalendertag (J−1)]`; 29.02. wird auf 28.02. abgebildet. Absolute Veränderung `YTD_J − YTD_{J−1}`; prozentual `(YTD_J − YTD_{J−1}) ÷ |YTD_{J−1}| × 100`, „—" wenn Nenner 0 |
| 6.7 | Rollierende 12-Monats-Summe | Σ über die letzten 12 Kalendermonate **einschließlich** des laufenden (angeschnittenen) Monats: `pay_date ∈ [Monatsanfang(heute) − 11 Monate, heute]`; als Zeitreihe je Monat analog über abgeschlossene Monatsfenster |
| 6.8 | Ø monatliche Dividende (gesamt) | `Σ net_amount ÷ Anzahl Monate von erster aktiver Zahlung bis heute` (angebrochene Monate zählen voll); „—" ohne Zahlungen |
| 6.9 | Ø Monatswert je Jahr | abgeschlossenes Jahr: `Jahressumme ÷ 12`; laufendes Jahr: `YTD ÷ Anzahl begonnener Monate` mit Kennzeichnung „laufend" |
| 6.10 | Bestes Jahr | Jahr mit max. Nettosumme (nur abgeschlossene Jahre; laufendes Jahr separat als „auf Kurs zu…" nur, wenn YTD bereits über Bestwert — kein Hochrechnen) |
| 6.11 | Stärkster/schwächster Monat | Monat (Jahr+Monat) mit max./min. Nettosumme im gewählten Zeitraum; Monate mit 0 zählen beim „schwächsten Monat" nur innerhalb der aktiven Historie (ab erster Zahlung) |
| 6.12 | Letzter Eingang | Aktiver Eingang mit max. `pay_date` (bei Gleichstand max. `created_at`) |
| 6.13 | Anzahl Eingänge | `count(*)` aktiver Eingänge im Zeitraum; Korrekturen zählen als eigene Eingänge und werden zusätzlich separat ausgewiesen |
| 6.14 | Top-Zahler | Ranking `Σ net_amount` je Wertpapier, Top N=10, Rest als „übrige" |
| 6.15 | Konzentration | Anteil je Wertpapier `Σ net je Papier ÷ Σ net gesamt × 100`; zusätzlich Top-1/Top-5-Anteil |
| 6.16 | Aufteilung Land/Branche/Währung/Depot | `Σ net` je Dimension ÷ Gesamtsumme; Land/Branche `unbekannt`-Kategorie für Wertpapiere ohne Stammdatum (nie stilles Weglassen); Währungsaufteilung nach `original_currency` |
| 6.17 | Quellensteuer / inländische Steuern | `Σ withholding_tax` bzw. `Σ domestic_tax + Σ coalesce(solidarity_surcharge,0) + Σ coalesce(church_tax,0)` je Zeitraum |
| 6.18 | Effektive Steuerquote | `(Σ gross − Σ net) ÷ Σ gross × 100` über den Zeitraum (enthält damit auch Gebühren; zusätzlich reine Steuerquote ohne Gebühren ausgewiesen); „—" wenn `Σ gross ≤ 0` |
| 6.19 | Sonderdividenden / Korrekturbuchungen | Σ und Anzahl je Zeitraum, gefiltert auf `payment_type='special'` bzw. `∈('correction','cancellation')` |
| 6.20 | Zielerreichung | Jahresziel: `YTD-Wert ÷ target_amount × 100` (netto bzw. brutto je Zieltyp), Kappung der Balkenanzeige bei 100 %, Zahl läuft weiter (z. B. „104 %"); rolling_12m-Ziel: Kennzahl 6.7 ÷ Ziel; avg_month_net-Ziel: 6.9 (laufendes Jahr) ÷ Ziel; long_term: YTD des Zieljahres bzw. letztes volles Jahr ÷ Ziel, mit Angabe „Stand JJJJ". Keine Prognose, keine „erwartete Zielerreichung" |

### Drill-down-Garantie

Jede Kennzahl definiert implizit eine Filtermenge; die UI navigiert zu „Dividendeneingänge" mit
genau dieser Filtermenge. Testregel: `Kennzahl == aggregate(gefilterte Liste)` (Property-Test in
TEST_STRATEGY.md §2). Client und `v_stats_*`-Views verwenden dieselben Definitionen.

## 7. Parsing-Regeln für Zahlen und Daten (Import & Formulare)

- Zahlen: Erkennung je **Spalte** (nicht je Zelle). Deutsch: `.`=Tausender, `,`=Dezimal;
  Englisch umgekehrt; neutral: nur `.` als Dezimal ohne Tausender. Mehrdeutige Spalten
  (alle Werte ohne Trennzeichen-Konflikt) → Format der Mehrheit der eindeutigen Werte, sonst
  Nutzerentscheidung. Apostroph-Tausender (`1'234.56`, CH) wird unterstützt.
- Formularfelder akzeptieren `de-DE`-Eingabe (`1.234,56` und `1234,56`) sowie `1234.56`;
  Anzeige normalisiert auf `de-DE`.
- Datumsformate: siehe IMPORT_SPEC.md Schritt 10; im Formular Datepicker (ISO intern).
- Währungseingabe: ISO-Code-Auswahl; freie Texteingabe nur im Import-Mapping mit
  Symbolauflösung.

## 8. Verbotsliste (Lint-geprüft)

- `parseFloat`, `Number()` auf Geldstrings, `+`/`-`/`*`//` auf `Money`-Werten
- `toFixed()` für Rundung (nur Decimal-Rundung, `toFixed` allenfalls auf bereits gerundeten Decimals zur String-Ausgabe)
- `JSON.parse` von Beträgen in `number` (Supabase-Client: `numeric` wird als String transportiert; Typen-Generierung wird entsprechend konfiguriert und getestet)
- Aggregation im UI-Code vorbei an `lib/statistics`

**Eine begründete Ausnahme:** `Money.toChartNumber()` liefert eine `number` **ausschließlich** für die visuelle Balkenhöhe von Diagrammen (recharts erfordert `number`). Sie darf niemals für Arithmetik oder für angezeigte Beträge verwendet werden — angezeigte Werte laufen über `formatMoney`, Aggregate über `Money`/Decimal.

---

## 9. Dashboard-Zeitraum- und Vergleichslogik (Phase 5A)

Verbindliche Definition der Dashboard-Kennzahlen. Implementiert in `src/lib/statistics`
(reine, decimal-sichere Funktionen; einzige Quelle aller Dashboard-Werte). Client-UI ruft
ausschließlich diese Schicht auf; keine Aggregation in React-Komponenten.

### 9.1 Datenbasis (Storno & Archiv)

- Datenbasis sind **aktive Eingänge** (`archived_at is null`). Stornierte Zahlungen sind als
  archivierte Zeilen modelliert und damit standardmäßig ausgeschlossen; ebenso zurückgerollte
  Importe (der Rollback archiviert die Zeilen, siehe `rollback_import()` 0016 §6a).
- Die **Archivierung eines Unternehmens oder Depots** (`securities.archived_at` /
  `depots.archived_at`) entfernt deren historische Zahlungen **nicht**: solange die Zahlung
  selbst aktiv ist, zählt sie voll mit. Archivierte Stammdaten werden in der UI sachlich als
  „Archiviert" gekennzeichnet, aber nie ausgeschlossen.

### 9.2 Zeiträume

| Auswahl | „Ausgewählter Zeitraum" | Vergleichszeitraum |
|---|---|---|
| Laufendes Jahr `J` (= aktuelles Jahr) | `[01.01.J, heute]` (YTD) | `[01.01.(J−1), entsprechender Kalendertag (J−1)]` |
| Abgeschlossenes Jahr `J` (< aktuelles Jahr) | `[01.01.J, 31.12.J]` | `[01.01.(J−1), 31.12.(J−1)]` |
| Alle Jahre | gesamte aktive Historie | — (kein Vorjahresvergleich) |

- Ein Jahr gilt als **abgeschlossen**, wenn es nicht das aktuelle Kalenderjahr ist.
- Entsprechender Kalendertag im Vorjahr: gleicher Monat/Tag, `29.02.` → `28.02.` im
  Nicht-Schaltjahr (Kappung auf den letzten gültigen Monatstag).
- Mit Ausschüttungsplan (§10) gehört eine Zahlung zum Jahr ihres **effektiven** Datums;
  „bis heute" bzw. „bis zum entsprechenden Kalendertag" grenzt im laufenden Jahr dagegen nach
  dem **tatsächlichen** Zahlungsdatum ab. Der Vergleichswert des laufenden Jahres ist damit
  genau die angezeigte Jahressumme — auch wenn eine vorgezogene Zahlung effektiv erst im
  kommenden Monat steht —, und das Vorjahr zählt nach derselben Regel.

### 9.3 Aktueller Monat (§5.2/§6.3)

- Aktuell: `[erster Tag des aktuellen Monats, heute]`.
- **Sichtbar nur, wenn der laufende Monat im gewählten Zeitraum liegt** — also im laufenden Jahr
  und bei „Alle Jahre". In einem anderen Jahr stünde das Feld für einen Zeitraum, den die Seite
  gerade nicht zeigt; dieselbe Regel gilt für die Ziele der Übersicht (§9.6).
- Vergleich: gleicher Monat im Vorjahr `[01., entsprechender Kalendertag]`; besitzt der
  Vorjahresmonat weniger Tage, wird auf den letzten gültigen Kalendertag gekappt.

### 9.4 Prozentuale Veränderung (§6.4)

Der Kennzahlkopf der Übersicht nennt die prozentuale Veränderung als Marke neben der Summe und
die absolute in der Zeile darunter („+203,24 € ggü. Vorjahreszeitraum", in einem abgeschlossenen
Jahr „ggü. Vorjahr"); der vollständige Satz steht im Titel der Marke („gegenüber dem gleichen
Zeitraum des Vorjahres"). Das Feld des laufenden Monats trägt die Kurzform „+65,0 % ggü. Vj.",
sofern kein Monatsziel gesetzt ist. Die Kurzformen halten die Zeilen auf dem iPhone einzeilig.

`(aktuell − vergleich) ÷ vergleich × 100`, nur wenn `vergleich > 0`. Sonst:

| Fall | Anzeige |
|---|---|
| `vergleich = 0`, `aktuell > 0` | „Neu gegenüber Vorjahr" (kein ∞) |
| `vergleich = 0` und `aktuell = 0` | „Keine Zahlungen in beiden Zeiträumen" |
| kein Vergleichszeitraum (Alle Jahre / negativer Vergleichswert) | „Kein Vergleichswert verfügbar" |

Prozentwerte werden erst zur Anzeige auf 1 Nachkommastelle gerundet (R-4); die absolute
Differenz stammt aus `Money.subtract` (exakt, R-3).

### 9.5 Weitere Dashboard-Kennzahlen

- **Durchschnitt pro Monat (§5.4):** laufendes Jahr `YTD ÷ begonnene Monate` (inkl. aktuellem);
  abgeschlossenes Jahr `Jahressumme ÷ 12`; bei „Alle Jahre" nicht ausgewiesen. Als begonnen zählt
  außerdem jeder Monat, dem bereits eine Zahlung zugeordnet ist (vorgezogene Zahlung, §10.3).
- **Bester Monat (§5.5):** Kalendermonat mit maximaler Nettosumme im Zeitraum; bei Gleichstand
  gewinnt der **aktuellere** Monat.
- **Top-Unternehmen / Depotverteilung (§9/§10):** `Σ net` je Wertpapier/Depot; Anteil
  `= Teilsumme ÷ Zeitraum-Gesamtsumme`, „—" wenn Gesamtsumme ≤ 0. Sortierung: Nettosumme ↓,
  dann Anzahl ↓, dann Name alphabetisch (de).
- **Monatszeitreihe (§7):** zwölf Monate; zukünftige **zahlungsfreie** Monate des laufenden Jahres
  werden **nicht** als 0 dargestellt, sondern als Lücke „noch nicht begonnen" (keine Prognose).
  Enthält ein künftiger Monat bereits Zahlungen (vorgezogene Ausschüttung, §10.3), wird er normal
  dargestellt. In abgeschlossenen Jahren dürfen zahlungsfreie Monate 0 € sein.
- **Historische Gesamtsumme (§5.3/§12):** immer über die gesamte aktive Historie, unabhängig von
  der Jahresauswahl; als historischer Gesamtwert gekennzeichnet.
- **Zahlungen im Zeitraum:** Anzahl der Eingänge des gewählten Zeitraums, mit Anzahl der
  ausschüttenden Unternehmen als Zusatz — in der Leiste des Kennzahlkopfs, sobald das Feld des
  laufenden Monats entfällt (anderes Jahr) oder bei „Alle Jahre". Die reine Zahl ausschüttender
  Unternehmen stand vorher allein — sie sagte nichts über das Jahr aus.
- **Reihenfolge im Kennzahlkopf:** Hauptzahl gewählter Zeitraum → Leiste laufender Monat →
  Ø pro Monat → bester Monat (in einem anderen Jahr: Ø pro Monat → Zahlungen → bester Monat;
  bei „Alle Jahre": laufender Monat → Zahlungen → bester Monat). Vom Zeitraum, den die Seite
  zeigt, zu dem, was ihn einordnet.
- **Letzte Dividendeneingänge:** die fünf jüngsten der gesamten Historie (unabhängig von der
  Jahresauswahl), mit Weg zur vollständigen Liste. Die Übersicht zeigt den letzten Stand, sie
  ersetzt die Liste nicht.

### 9.6 Ziele auf der Übersicht

Gezeigt wird ausschließlich, was zum gewählten Jahr gehört: das **Jahresziel dieses Jahres** und —
nur im laufenden Jahr — das **Monatsziel des laufenden Monats**. Ein Monatsziel gehört zu einem
Monat eines Jahres; neben einem anderen Jahr stünde es für einen Zeitraum, den die Seite gerade
nicht zeigt. Bei „Alle Jahre" entfällt beides: Ziele sind an einen Zeitraum gebunden, „alle
Jahre" ist keiner.

Beide stehen im Kennzahlkopf bei der Zahl, auf die sie sich beziehen: das Jahresziel als Balken
unter der Jahressumme (erreichter Anteil, Zielbetrag, Restbetrag bzw. Ergebnis), das Monatsziel als
„19 % vom Ziel" im Feld des laufenden Monats. Alle Werte stammen aus `computeGoalProgress` — es ist
dieselbe Rechnung wie auf der Zielseite (Ist = effektive Monatszuordnung, §10).

### 9.7 Prognose zum Jahresende (`yearEndForecast`, seit 1.7.0)

Im **laufenden Jahr** steht neben einem aktiven Jahresziel eine Prognose:

`Prognose = eingegangen bis heute + angekündigt (bis T) + Vorjahreszahlungen nach T im Vorjahr`

- *Eingegangen bis heute* ist genau die Jahressumme im Kopf (`selectedYearComparison`,
  §9.2): effektives Jahr (§10), abgegrenzt nach dem tatsächlichen Eingang.
- *Angekündigt:* Zahltage des Dividendenkalenders **nach heute** und höchstens 30 Tage voraus
  (`announcedForForecast`), nur im laufenden Jahr, nicht abgesagt, mit Betrag in Euro. Die
  Beträge der Quelle sind Nettobeträge (bestätigt für DivvyDiary) und werden unverändert
  übernommen; andere Währungen bleiben außen vor statt zu einem erfundenen Kurs umgerechnet zu
  werden. `T` ist der **letzte angekündigte Tag**; gibt es keine Ankündigung, ist `T` heute.
- *Rest des Vorjahres:* Zahlungen mit effektivem Jahr = Vorjahr, deren tatsächlicher Eingang
  **nach** dem gleichen Kalendertag wie `T` im Vorjahr liegt (`priorYearSameDay`, 29.02. →
  28.02.). Ohne Ankündigungen ergibt Vorjahr bis heute plus Rest genau das volle Vorjahr.
- Grenzen: Zahlungen zwischen heute und `T`, die die Quelle (noch) nicht ankündigt, fehlen;
  Käufe, Verkäufe und Kürzungen nach `T` kennt die Regel nicht. Angezeigt wird sie deshalb als
  „Prognose", nie als Zielstand; die Bildschirmansage nennt den angekündigten Anteil.
- Sie ist **kein Teil des Zielfortschritts**: `computeGoalProgress` (§13) bleibt frei von
  erwarteten Beträgen; Status, Prozent und Restbetrag eines Ziels ändern sich durch die Prognose
  nicht. Angezeigt nur, solange das Ziel `active` ist.

---

## 10. Effektiver Ausschüttungsmonat (Ausschüttungsplan je Unternehmen)

Hintergrund: Dividenden treffen manchmal später ein als geplant (z. B. eine für März
erwartete Quartalsdividende landet am 2. April). Damit die Auswertungen dem geplanten Rhythmus
folgen, kann je Unternehmen ein **Ausschüttungsplan** hinterlegt werden: die Menge der geplanten
Zahlungsmonate (`securities.payout_months`, Werte 1..12). Aus diesem Plan und dem echten
Zahlungsdatum wird ein **effektives Datum** berechnet, das die Datumsdimension **aller**
Auswertungen bildet.

### 10.1 Zuordnungsregel (implementiert in `lib/statistics/effectiveMonth.ts`)

- **Ohne Plan** (`payout_months` leer): das echte `pay_date` bleibt maßgeblich.
- **Zahlungsmonat selbst geplant:** dieser Monat bleibt (Normalfall).
- **Verspätete Zahlung (Regelfall):** die Zahlung wird dem **letzten fälligen geplanten Monat am
  oder vor** dem Zahlungsmonat zugeordnet (größter geplanter Monatsindex ≤ Zahlungsmonat). Die
  geplanten Monate sind damit **maßgebend**: eine später als geplant eingetroffene Dividende zählt
  zu dem Monat, für den sie fällig war. Beispiel Quartalsplan Mär/Jun/Sep/Dez: Zahlung 2. April
  → März.
- **Vorgezogene Zahlung:** liegt der letzte fällige geplante Monat **mehr als einen Monat** zurück
  und ist der **unmittelbar folgende** Monat geplant, zählt die Zahlung zu diesem geplanten Monat.
  Beispiel Plan Jan/Apr/Jul/Okt: Zahlung im Juni → Juli (nicht April). Beispiel Plan Mär/Jun:
  Zahlung 28. Mai → Juni. Weiter als einen Monat wird **nicht** vorgezogen (Plan Jul, Zahlung im
  Mai → Juli des Vorjahres), denn Zahlungen treffen häufiger spät als früh ein.
- **Gleichstand:** sind der fällige und der folgende geplante Monat gleich weit entfernt, gewinnt
  der frühere (fällige) Monat. Beispiel Plan Mär/Mai: Zahlung im April → März.
- **Jahreswechsel:** die Zuordnung darf das Jahr in beide Richtungen verschieben; geprüft werden
  die geplanten Monate der Jahre `J−1`, `J` und `J+1`. Beispiele: Januar bei Dezember-Plan →
  Dezember des Vorjahres; Dezember bei Plan Jan/Apr/Jul/Okt → Januar des Folgejahres.
- Der Tag des effektiven Datums ist bei einer **verspäteten** Zahlung der **Monatsletzte** des
  geplanten Monats (z. B. Zahlung 02.10. bei Plan September → 30.09.; geplanter Februar →
  28./29.02.). Das Geld kam erst nach Monatsende; so steht die Zahlung als **letzte Buchung** ihres
  Monats und zählt in Zeiträumen „bis heute" des Vorjahres (§6) nicht früher als nötig. Bei einer
  **vorgezogenen** Zahlung ist es der **1. des geplanten Monats**, damit bereits erhaltenes Geld in
  Zeiträumen „bis heute" (Monat bzw. Jahr bis heute, §5.2/§6) ab Monatsbeginn zählt und nicht erst
  am Zahltag auftaucht. Der Tag dient nur der Datumsdarstellung und Sortierung, nicht der
  Zuordnung.

### 10.2 Geltungsbereich

Der effektive Monat ersetzt das echte Datum in **allen** Auswertungen und in der Eingangsliste
(Filter nach Jahr/Monat, Sortierung, angezeigter Monat). Das echte Zahlungsdatum bleibt
gespeichert (`pay_date`) und wird dort, wo es abweicht, zusätzlich ausgewiesen
(„tatsächlich TT.MM.JJJJ"). Die Berechnung ist rein clientseitig; es findet keine
Gleitkomma-Geldarithmetik statt.

### 10.3 Randfälle

- Mehrere Zahlungen können auf denselben effektiven Monat fallen (Nachzahlung, Korrektur) —
  sie summieren sich dort erwartungsgemäß.
- Der effektive Monat kann **einen Monat in der Zukunft** liegen (vorgezogene Zahlung im
  laufenden Monat für den kommenden geplanten Monat). Auswertungen behandeln einen solchen Monat
  deshalb **nicht** als „noch nicht begonnen": im Monatsdiagramm (§7) gilt ein künftiger Monat nur
  ohne Zahlungen als Lücke, und der Ø pro Monat (§5.4) teilt durch die begonnenen Monate
  **mindestens bis zum letzten Monat mit Zahlungen**. Der ausgewählte Zeitraum (§5.1) und der
  Jahresvergleich (§6) folgen dagegen unverändert dem effektiven Datum: Geld, das laut Plan erst
  im kommenden Monat fällig ist, zählt auch erst dort — das ist die gewollte Folge einer
  Auswertung nach Ausschüttungsplan statt nach Kalender. Nur die Grenze „bis heute" des
  Jahresvergleichs im laufenden Jahr folgt dem tatsächlichen Eingang (§9.2), damit Jahressumme
  und Veränderung zueinander passen.
- Eine mehr als einen Monat zu früh eingetroffene Zahlung wird weiterhin dem vorherigen fälligen
  geplanten Monat zugerechnet (kein Vorziehen über mehr als einen Monat).

---

## 11. Statistikbereich (Phase 5B)

Verbindliche Definition der Statistik-Kennzahlen. Sie werden **ausschließlich** in der
Analytics-Schicht `src/lib/statistics` berechnet (reine, decimal-sichere Funktionen), sind die
einzige Quelle aller Statistikwerte und werden Dashboard-übergreifend wiederverwendet. Keine
Aggregation, Rundung oder Sortierung nach Betrag/Datum in React-Komponenten oder Diagrammen.

Datenbasis und Storno-/Archivregeln entsprechen §9.1: aktive Eingänge (`archived_at is null`);
archivierte Unternehmen/Depots bleiben über ihre aktiven Zahlungen enthalten. Datumsdimension
ist durchgängig der **effektive Monat** (§10). Der Statistikbereich zeigt ausschließlich
**historische** Auswertungen — keine Prognosen, erwarteten Dividenden, Kurse oder Depotwerte
(PRODUCT_SPEC.md Grundsatz 8).

### 11.1 Übersicht (`overviewStatistics`)

Über die gefilterte Historie: historische Gesamtsumme (`Σ net`), Anzahl Zahlungen, Anzahl
Unternehmen und Depots (distinct), erstes/letztes effektives Zahlungsdatum, bester Monat (§5.5),
bestes Jahr (Kalenderjahr mit maximaler Nettosumme; bei Gleichstand das aktuellere), sowie die
beiden Durchschnitte aus §11.2.

### 11.2 Durchschnitte

- **Durchschnittliche Zahlung** (`averagePayment`): `Σ net ÷ Anzahl Zahlungen` (0 € ohne
  Zahlungen). Division über Decimal, Rundung erst am Ende auf 2 Stellen (R-4).
- **Durchschnittlicher Monat** (`averagePerActiveMonth`): `Σ net ÷ Anzahl aktiver Monate`, wobei
  ein „aktiver Monat" ein Kalendermonat (Jahr+Monat) mit mindestens einer Zahlung ist. Zahlungsfreie
  Monate zählen bewusst **nicht** als Divisor (keine künstliche Verwässerung; unterscheidet sich
  vom Dashboard-`averagePerMonth` §5.4, das auf ein Einzeljahr bezogen ist).

### 11.3 Jahresstatistik (`yearStatistics`)

Ein Eintrag je Kalenderjahr, **neueste Jahre zuerst**. Je Jahr: Dividendensumme, Anzahl
Zahlungen, Anzahl Unternehmen/Depots (distinct), Durchschnittszahlung (§11.2), bester Monat
(§5.5) und **schwächster Monat** (Minimum der Monatssummen unter den Monaten **mit** Zahlungen;
bei Gleichstand der ältere Monat), sowie die Veränderung zum vorhergehenden Kalenderjahr
(`comparePeriods` §6.4 auf den Jahressummen). Fehlt das Vorjahr in der Datenbasis, gilt „Kein
Vergleichswert".

Das **laufende Jahr** vergleicht wie die Übersicht (§6.6) und die Matrix (§11.10) den Ausschnitt
`1.1.` bis Stichtag mit demselben Ausschnitt des Vorjahres (`selectedYearComparison`) und ist als
„läuft" gekennzeichnet. Gegen das volle Vorjahr stand es bis in den Dezember hinein im Minus — rot,
obwohl es im gleichen Zeitraum vorn lag; dieselbe Zahl hieß auf der Übersicht „+11,6 %" und in der
Jahresstatistik „−2,6 %".

### 11.4 Monatsstatistik (`monthAcrossYearsStatistics`)

Genau zwölf Einträge (Kalendermonate 1..12) **über alle Jahre**. Je Monat: Dividendensumme,
Anzahl Zahlungen, Durchschnittszahlung (§11.2) und die Entwicklung über die Jahre
(`yearlyBuckets` des Monats, aufsteigend).


### 11.5 Unternehmensstatistik (`securityStatistics` + `sortSecurityStatistics`)

Je Unternehmen (auch archivierte): Gesamtsumme, Anzahl Zahlungen, erstes/letztes effektives
Datum, Durchschnittszahlung, größte Einzelzahlung (`max net`), Summe je Jahr und Entwicklung über
die Jahre. Sortierbar nach **Summe** (↓, Tiebreak Anzahl ↓, dann Name), **Anzahl Zahlungen**
(↓, Tiebreak Summe ↓, dann Name), **Alphabet** (Name, de) und **letzter Zahlung** (Datum ↓,
fehlende zuletzt, Tiebreak Name).

### 11.6 Depotstatistik (`depotStatistics`)

Je Depot (auch archivierte): Dividendensumme, Anzahl Zahlungen, Anzahl Unternehmen (distinct),
Entwicklung je Jahr (`yearlyBuckets`) und je Kalendermonat über alle Jahre
(`calendarMonthBuckets`, zwölf Eimer). Grundordnung: Summe ↓, dann Anzahl ↓.

### 11.7 Diagramme und Tönung der Matrix

- Die frühere **Heatmap** ist in der Matrix Jahre × Monate aufgegangen (§11.12): In der Ansicht
  „Summe je Monat" ist jede Zelle nach der Höhe ihres Betrags getönt. Die Tönung ist rein
  visuell (Wurzelskalierung der Nettosumme, höchstens 40 % Deckkraft); Betrag und Anzahl stehen
  als Text in der Zelle.
- Alle Diagramme (Jahres-/Monatsentwicklung, Unternehmen nach Summe, Depotverteilung) erhalten
  die aggregierten Werte fertig aus der Analytics-Schicht und enthalten **keine** eigene
  Berechnung. Balkenhöhen/Zelltönungen nutzen `Money.toChartNumber()` ausschließlich visuell
  (§1/§8); alle angezeigten Beträge stammen aus `formatMoney` bzw. — in der gedrehten Matrix
  des iPhones, deren Währung einmal darunter steht — aus `formatAmount`.

### 11.8 Filter (`filterPayments`)

Kombinierbarer Filter über **Jahr** (effektives Kalenderjahr), **Unternehmen** und **Depot** —
genau die drei Kriterien, die auch die Zahlungsliste kennt. Reine UND-Verknüpfung als Vorstufe
der Aggregation; `null` bedeutet je Kriterium „keine Einschränkung". Der Filter ist
URL-serialisiert (`?year=&security=&depot=`) und bleibt nach Reload sowie über
Browser-Zurück/-Vorwärts erhalten.

Datenquelle (`source`) und Zahlungsart (`payment_type`) waren einmal Teil dieses Filters und sind
entfallen: Die Zahlungsliste kann beide nicht filtern, sodass ein Drill-down aus einer so
eingeschränkten Kennzahl in eine Liste mit **mehr** Zahlungen führte, als die Zahl behauptete —
ein Bruch der Drill-down-Zusage (§13). Alte Adressen mit `source=`/`type=` bleiben gültig, die
Parameter wirken nur nicht mehr.

### 11.9 Drill-down-Garantie

Jede Kennzahl, jeder Diagrammbalken, jede Matrixzelle und jede Tabellenzeile navigiert in die
gefilterte Zahlungsliste (`/eingaenge`) bzw. — bei „Jahr → Monate dieses Jahres" — in den
Verlauf nach Monaten (`/statistiken/verlauf?nach=monate`) mit gesetztem Jahresfilter. Der aktive Statistikfilter (Unternehmen/Depot/Jahr)
wird dabei mit dem konkreten Drill-Kriterium zusammengeführt, sodass die Zielliste dieselbe
Teilmenge zeigt (Grundsatz 6). `source`/`payment_type` sind in der Zahlungsliste nicht filterbar
und bleiben beim Drill-down unberücksichtigt.

### 11.10 Zeitraumvergleich (`compareYears`, `compareRollingTwelveMonths`)

Gegenüberstellung zweier Zeiträume im Unterbereich `/statistiken/vergleich`.

- **Gleicher Ausschnitt auf beiden Seiten — die tragende Regel.** Ist eines der beiden
  Kalenderjahre das **laufende**, werden **beide** Seiten am Referenztag gekappt: `1.1.` bis
  heute gegen `1.1.` bis zum selben Tag des anderen Jahres. Auch der umgekehrte Fall zählt (ein
  abgeschlossenes Jahr als Vordergrund, das laufende als Vergleich). Sind beide Jahre
  abgeschlossen, zählt jeweils das volle Jahr. Ohne diese Kappung stünde ein angefangenes gegen
  ein volles Jahr — eine systematische Untertreibung, die plausibel aussieht und deshalb nicht
  auffällt.
- **Schaltjahr.** Hat der Referenzmonat im Zieljahr weniger Tage (29.02. gegen ein
  Nicht-Schaltjahr), wird auf dessen letzten Tag abgebildet (28.02.), nie auf ein ungültiges
  Datum.
- **Rollierender Zwölfmonatsvergleich.** Die letzten zwölf Monate gegen die zwölf davor. Beide
  Fenster sind exakt zwölf Monate lang und enden am selben Kalendertag (`1.8.2025–29.7.2026`
  gegen `1.8.2024–29.7.2025`). Er hängt nicht am Jahreswechsel, an dem ein Jahresvergleich fast
  nichts mehr aussagt.
- **Monatsvergleich** (`compareMonths`). Derselbe Kalendermonat zweier Jahre (`Mai 2026` gegen
  `Mai 2025`) — **nicht** der Vormonat: Dividenden sind saisonal, ein März gegen einen April
  verglichen ergäbe eine beliebige Zahl. Läuft der Monat noch, enden **beide** Seiten am
  Referenztag; ist er abgeschlossen, zählen beide Monate vollständig. Ein Monat, der noch nicht
  begonnen hat, ist nicht wählbar — „0 € gegen 280 €" wäre kein Rückgang, sondern eine
  Falschaussage. Aufgeschlüsselt wird **nach Unternehmen** (ein Monat lässt sich nicht in Monate
  zerlegen): alle Unternehmen mit Zahlungen auf einer der beiden Seiten, absteigend nach
  aktuellem Betrag. Wer nur im Vergleichsmonat vorkommt, bleibt sichtbar — ein Ausfall ist der
  wichtigste Teil der Antwort.
- **Kennzahlen.** Je Seite Nettosumme (§9.1, effektiver Monat §10) und Anzahl Zahlungen; die
  Veränderung über `comparePeriods` (§6.4). Je Monat beide Monatswerte, ihre Differenz und die
  laufende Summe seit Beginn des Zeitraums. Die letzte laufende Summe entspricht per Konstruktion
  der Periodensumme, und die Summe der Monatswerte ebenfalls — die Kurve kann der Kennzahl
  darüber nicht widersprechen.
- **Keine Prognose, keine Hochrechnung** (PRODUCT_SPEC.md Grundsatz 8): Es werden ausschließlich
  vorhandene Zahlungen summiert; ein Teiljahr wird nicht auf ein volles Jahr skaliert.
- **Darstellung.** Der Stichtag steht nicht als eigener Hinweis über der Auswertung, sondern
  dort, wo er wirkt: am angeschnittenen Monat der Aufschlüsselung (`420,00 € *` samt Fußnote
  „nur bis zum Stichtag gerechnet"), der aus demselben Grund nicht verlinkt ist. Die Kennzahlen
  nennen je Seite nur Summe und Anzahl — die Datumsspanne darunter wiederholte, was die
  Überschrift bereits sagt. Die Aufschlüsselung (Monate bzw. Unternehmen) ist ab `md` eine Tabelle,
  darunter eine Liste mit denselben Zahlen untereinander. Monate ohne Zahlungen auf beiden
  Seiten stehen dort einzeilig als „keine Zahlungen" — drei Zeilen Gedankenstriche wären
  Rauschen.
- **Drill-down (§11.9) nur, wo er trägt.** Die Zahlungsliste filtert auf Jahr und Monat, nicht
  auf einen Tag. Der am Stichtag **angeschnittene** Monat wird deshalb nicht verlinkt und in der
  Tabelle als solcher gekennzeichnet; alle vollständigen Monate verlinken wie gewohnt. Ein Link,
  der mehr zeigt als die Zahl daneben, beschädigt das Vertrauen in beide.
- **Filter.** Unternehmen und Depot wirken wie überall; der
  **Jahresfilter** wirkt in diesem Unterbereich nicht (er reduzierte die Datenbasis auf ein Jahr
  und ließe die Vergleichsseite grundsätzlich leer). Sein Regler wird deshalb hier ausgeblendet:
  Ein Bedienelement ohne Wirkung ist schlimmer als keines. Ein aus einem anderen Unterbereich
  mitgebrachter Jahresfilter bleibt in der URL, wird aber benannt und lässt sich über „Filter
  zurücksetzen" räumen. Die verglichenen Zeiträume liegen unter eigenen URL-Schlüsseln
  (`?modus=&basis=&referenz=&monat=`).

## 11.11 Vorjahresvergleich je Zahlung (Dividendenliste)

Jede Zahlung in `/eingaenge` trägt einen Indikator, wie sie zur Zahlung desselben
**effektiven Ausschüttungsmonats** im Vorjahr steht (implementiert in
`features/payments/yearOverYear.ts`):

- **Bezug:** je Unternehmen, **depotübergreifend**. Verglichen wird die Zahlung im Monat
  `(Jahr − 1, gleicher Monat)` des effektiven Zahlungsdatums (§10). Der effektive Monat ist
  kein bloßer Kalendermonat: Bei hinterlegtem Ausschüttungsplan zählt die Zahlung zu ihrem
  *geplanten* Monat, auch über den Jahreswechsel — der Monat ist damit der Ausschüttungs-Slot
  und über Jahre stabil.
- **Warum nicht die Reihenfolge im Jahr:** Fällt eine Zahlung aus, verschöbe sie jeden
  folgenden Vergleich des Jahres (aus einem ausgesetzten Märzquartal würden drei falsche
  Vergleiche). Über den Monat bleibt der Fehler an der einen Zahlung.
- **Vergleichswert:** `net_amount` beider Zahlungen — der Betrag, den die Liste zeigt. Kein
  Vergleich je Aktie: `quantity`/`amount_per_share` sind bei manuell erfassten Eingängen leer,
  ein Zukauf hebt den Betrag also ohne Dividendenerhöhung.
- **Bewertung:** größer → „mehr", kleiner → „weniger", **centgenau gleich** → „unverändert".
  Keine Toleranzschwelle.
- **Kein Indikator**, wenn keine eindeutige Zuordnung möglich ist:
  - im Vorjahresmonat steht keine Zahlung (erstes Jahr, neue Position, ausgesetzte Dividende,
    oder verschobener Termin ohne gepflegten Ausschüttungsplan),
  - auf einer der beiden Seiten fallen mehrere Zahlungen in denselben Monat (Nachzahlung,
    Sonderdividende — §10.3),
  - die Währungen der beteiligten Depots unterscheiden sich (ohne Kurs zum Zahlungszeitpunkt
    wäre jeder Vergleich geraten, R-2).
- **Stornierte Zahlungen** (§9.1) zählen weder als Bezug noch erhalten sie einen Indikator;
  sie machen einen Monat auch nicht mehrdeutig.
- Filter der Liste (Depot, Jahr, Monat) verändern den Bezug **nicht** — gerechnet wird stets
  über den gesamten aktiven Bestand.
- Der Indikator nennt in Titel und Screenreader-Text Differenz, Betrag **und Datum** der
  Vergleichszahlung; damit bleibt nachprüfbar, worauf er sich stützt.

## 11.12 Breakdown — Jahre × Monate (`breakdownMatrix`)

Alle Jahre und Monate in **einer** Matrix (Statistik-Übersicht `/statistiken`; die frühere
Adresse `/statistiken/breakdown` leitet dorthin): eine Zeile je Kalenderjahr mit Zahlungen
(**absteigend**, neueste zuerst), eine Spalte je Kalendermonat (1..12). Zahlengetrieben, ohne
Diagramm — die Frage lautet „Wie steht dieser Monat gegenüber demselben Monat der Vorjahre?",
und darauf antwortet eine Tabelle genauer als eine Kurve. Auf dem iPhone steht dieselbe Matrix
gedreht (Monate als Zeilen, Jahre als Spalten); die Rechnung ist dieselbe.

**Jahre als Zeilen, nicht als Spalten.** Monate sind zwölf und bleiben zwölf; Jahre kommen
jedes Jahr eines dazu. Die Breite der Tabelle steht damit dauerhaft fest, sie wächst nur nach
unten — in die Richtung, in der ein Bildschirm nachgibt.

- **Je Zelle** (Jahr × Monat): Nettosumme, Anzahl Zahlungen, die **aufgelaufene Jahressumme**
  bis einschließlich dieses Monats sowie die Veränderung gegenüber demselben Monat des
  Vorjahres (`comparePeriods` §6.4).
- **Je Zeile** (Jahr): Jahressumme, Anzahl Zahlungen, Monate mit Zahlungen und die Veränderung
  der Jahressumme zum Vorjahr. **Je Spalte** (Monat): Summe und Anzahl über alle Jahre.
- **Laufender Monat und laufendes Jahr werden gekappt** — dieselbe tragende Regel wie §11.10:
  Der Vergleich des laufenden Monats endet auf **beiden** Seiten am Stichtag (bei kürzerem
  Vorjahresmonat an dessen letztem Tag, 29.02. → 28.02.), der Vergleich des laufenden Jahres
  läuft über `1.1.` bis Stichtag gegen denselben Ausschnitt des Vorjahres (§6.2). Angezeigt
  wird weiterhin der volle Monats- bzw. Jahreswert; die Oberfläche kennzeichnet ihn (`*`) und
  benennt den Stichtag.
- **Noch nicht erreichte Monate sind keine Nullmonate.** Ein Monat des laufenden Jahres nach
  dem Stichtagsmonat ohne Zahlungen trägt kein Ergebnis (`future`) und bleibt leer; ein
  „0,00 €"-Dezember im Juli wäre eine Falschaussage. Ein vergangener Monat ohne Zahlungen ist
  dagegen eine echte Null und steht als Gedankenstrich.
- **Fehlt das Vorjahr in der Datenbasis**, gilt „kein Vergleichswert" — nie eine gerechnete
  Prozentzahl ohne Grundlage (wie §11.3).
- **Ansichten** (URL-Schlüssel `?ansicht=`): Monatssumme (Vorgabe), Veränderung zum
  Vorjahresmonat, aufgelaufene Jahressumme. Sie wechseln ausschließlich den Inhalt der Zellen;
  der Rand — Jahressumme, Δ Vorjahr und die Monatssummen der Fußzeile — zeigt in jeder Ansicht
  dieselben absoluten Werte.
- **Drill-down (§11.9):** Jeder Monatsbetrag führt in die Zahlungsliste, gefiltert auf Jahr und
  Monat. Anders als beim Zeitraumvergleich ist auch der laufende Monat verlinkt — die Zelle
  enthält genau die Zahlungen dieses Monats, die Liste zeigt also nicht mehr als die Zahl daneben.
- **Filter.** Unternehmen und Depot wirken wie überall; der
  **Jahresfilter** wirkt hier nicht (er ließe eine einzige Zeile übrig und damit genau das, was
  „Monate" ohnehin zeigt). Sein Regler wird deshalb ausgeblendet, ein mitgebrachter Jahresfilter
  bleibt in der URL, wird aber benannt.
- **Keine Prognose, keine Hochrechnung** (PRODUCT_SPEC.md Grundsatz 8).

## 11.13 Monatsabschluss (`monthRecap`, Startseite, seit 2.19.0)

- **Zeitraum:** vom 1. bis 7. eines Monats der ganze Vormonat; nicht im Januar, dort steht der
  Jahresrückblick (bis 10.1.). Nur bei Auswahl des laufenden Jahres oder „Alle Jahre".
- **Erhalten:** Nettosumme des Vormonats (effektives Datum, §10), verglichen mit dem **ganzen**
  Vorjahresmonat über `comparePeriods` (§6.4).
- **Top-Zahler:** stärkstes Asset des Monats nach §9-Rangfolge (Summe aller Zahlungen des Assets).
- **Monatsziel:** Status und Erreichung aus der Zielschicht (§13), Anzeige mit einer Nachkommastelle;
  ohne Ziel stattdessen Zahl der Dividenden und Assets.
- Ein Monat ohne Zahlungen und ohne Ziel zeigt keinen Abschluss. Ausgeblendet bleibt er auf dem
  Gerät für diesen Monat weg.

## Phase 6 – Validierung und Datenqualität

**Zahlungsdatum.** Gültiges Kalenderdatum, ≥ 1970-01-01 und ≤ heute (lokal,
ohne Zeitzonenverschiebung; entspricht dem DB-CHECK `pay_date <= heute in Europe/Berlin`, 0032).
Zukünftige Zahlungsdaten werden abgelehnt.

**Nettobetrag.** Decimal-sicher (`lib/money`, keine JS-Float-Arithmetik):
gültige Zahl, echt > 0, höchstens 2 Nachkommastellen (`numeric(14,2)`), < 10^12.
Abgelehnt: leer, nicht-numerisch, NaN, Infinity, Exponentialschreibweise, ≤ 0,
> 2 Nachkommastellen, außerhalb des Bereichs.

**Dublettenerkennung** (`findDuplicatePairs`, rein/ableitend). Gruppierung nach
Unternehmen + Depot + tatsächlichem Zahlungsdatum (Nutzer implizit via RLS).
Innerhalb einer Gruppe: identischer Betrag + Währung → *hohe Wahrscheinlichkeit*;
abweichender Betrag → *mögliche Dublette* (legitime Tranchen bleiben erhalten,
D-007). Stornierte Zahlungen und als „keine Dublette" markierte Paare
(`duplicate_dismissals`) entfallen. Keine automatische Aktion.

**Auffälligkeiten** (`detectAnomalies`). Nullbetrag, negativer Betrag,
Zukunftsdatum, fehlende Zuordnung, importierte Zeile ohne Importreferenz,
ungewöhnlich hoher Betrag. Letzterer ist **relativ**: > `UNUSUALLY_HIGH_FACTOR`
(= 5) × Median der **benachbarten** aktiven Zahlungen desselben Assets (bis zu drei
davor und drei danach, zeitlich geordnet), erst ab 3 Vergleichszahlungen — keine
starre absolute Schwelle, nur ein Hinweis. Als Sonderdividende erfasste Zahlungen
sind ausgenommen. Bis 2026-10-14 galt der Median **aller** Zahlungen des Assets;
bei per Sparplan aufgebauten Positionen war damit jede neue Zahlung „auffällig“
(im echten Bestand 29 Hinweise, danach 10). Als geprüft markierte Befunde
(`anomaly_reviews`) erscheinen eingeklappt und lassen sich zurücknehmen.

---

## 13. Ziele und Fortschritt (Phase 7)

Die zentrale, typisierte Goal-Domain-Schicht (`src/lib/goals`) ist die **einzige**
Quelle aller Zielkennzahlen. Sie baut auf der Analytics-Schicht (§1–§12) auf; es
gibt keine parallele Berechnung in React-Komponenten, Karten, Diagrammen oder
Tooltips. Alle Beträge laufen decimal-sicher über `Money`/`Decimal`; gerundet
wird ausschließlich für die Anzeige (R-4/R-5).

**Datenbasis (§7).** Fortschritt zählt ausschließlich gültige, aktive
Dividendeneingänge (`archived_at is null`) des angemeldeten Nutzers — dieselbe
Datenbasis wie Dashboard und Statistik, inkl. **effektivem** Zahlungsdatum
(§10). Stornierte und dauerhaft gelöschte Zahlungen sind ausgeschlossen;
archivierte Unternehmen und Depots bleiben über ihre aktiven Zahlungen
enthalten. Keine erwarteten, geschätzten oder prognostizierten Beträge.

**Zielzeitraum (§2).**
- Jahresziel `annual`: 1. Januar – 31. Dezember des `year`.
- Monatsziel `monthly`: 1. – letzter Tag von `year`/`month` (Schaltjahr über
  `lastDayOfMonth`).

**Ist-Summe.** `aggregateInRange(payments, period).net` über das effektive
Zahlungsdatum — deckungsgleich mit dem Drill-down `/eingaenge?year=…[&month=…]`.

**Zielerreichung.** `Fortschritt = Ist / Ziel × 100` (Ziel > 0 garantiert durch
DB-Constraint). Der Balken ist visuell auf 0–100 % begrenzt; der textliche
Prozentwert wird auch über 100 % angezeigt.

**Verbleibend / Überschreitung (§11).** `remaining = max(0, Ziel − Ist)`,
`overshoot = max(0, Ist − Ziel)`. Kein negativer Restbetrag.

**Zielstatus (§6), rein abgeleitet, nie gespeichert.** In dieser Reihenfolge:
`upcoming` (Zeitraum nicht begonnen) → `exceeded` (Ist > Ziel) → `reached`
(Ist = Ziel) → `missed` (Zeitraum vorbei und Ziel verfehlt) → sonst `active`.

**Zeitfortschritt (§12), rein beschreibend.** Vergangene Kalendertage ÷ gesamte
Kalendertage des Zeitraums; der aktuelle Tag wird inklusiv gezählt (konsistent
zu den YTD-/Monatszeiträumen). Vor Beginn 0 %, nach Ende 100 %. Keine
Hochrechnung im Zeitfortschritt, kein voraussichtliches Erreichungsdatum. Die
Prognose auf der Übersicht (§9.7) und die Hochrechnung je Ziel (§13.1) sind
eigene, getrennt gerechnete Anzeigen daneben, kein Bestandteil des
Zielfortschritts.

**Dynamik (§28).** Da Zielstände aus den aktuellen Zahlungen abgeleitet werden,
aktualisiert jede Zahlungs-/Import-Mutation (Anlegen, Bearbeiten, Datum-/
Betragsänderung, Storno, Reaktivierung, Löschung, Import-Commit/-Rollback) über
die Invalidierung von `["payments"]` automatisch alle betroffenen Ziele,
Dashboard und Statistik. Es bleibt kein veralteter Zielstand zurück.

### 13.1 Hochrechnung je Ziel (`computeGoalCourse`, seit 2.31.0)

Wo landet ein Ziel bis zum Ende seines Zeitraums?

`Hochrechnung = erhalten (Ist, §13) + im Zeitraum noch erwartet`

- *Noch erwartet* ist der Rest der Jahresprognose (§9.7, `yearEndForecast`): für das Jahresziel
  `forecast − received`, für ein Monatsziel `restByMonth` seines Monats. Damit ist die
  Hochrechnung genau die Höhe der gestreiften „Erwartet"-Balken der Zielseite und dieselbe
  Prognose wie auf der Übersicht. Ein negativer Rest zählt nicht.
- Bewusst nicht die Prognose aus Bestand › Prognose (§14.1): Sie beginnt erst mit dem nächsten
  vollen Monat, ließe also den Rest des laufenden Monats aus, und braucht einen Depotstand.
- **Nur für Ziele des laufenden Jahres, die noch offen sind** (`active` oder `upcoming`): das
  Jahresziel dieses Jahres und Monatsziele ab dem laufenden Monat. Erreichte, übertroffene und
  vergangene Ziele haben ein Ergebnis; über das Jahr hinaus kennt die Prognose nichts.
- **Kurs:** *Im Plan* ab 100 % des Zielbetrags, *Knapp* ab 95 %, darunter *Unter Plan*. Das
  Etikett ersetzt „Aktiv"/„Bevorstehend" in Liste und Detailseite; Status, Prozent, Balken und
  Restbetrag des Ziels bleiben beim Ist.

### 13.2 Monatsziele aus dem Jahresziel (`deriveMonthlyGoals`, seit 2.34.0)

- **Monate:** im laufenden Jahr ab dem laufenden Monat, in einem späteren Jahr alle zwölf;
  vergangene Jahre nie. Monate mit eigenem Monatsziel bleiben unverändert.
- **Zu verteilen:** `Jahresziel − erhalten vor dem laufenden Monat − Ziele der vorhandenen
  Monatsziele in diesen Monaten`, auf volle Euro aufgerundet. Ist nichts mehr offen, gibt es nichts
  abzuleiten.
- **Muster:** je Monat erhalten plus noch erwartet des laufenden Jahres (§9.7, dieselben Balken wie
  „Monat für Monat"); für ein späteres Jahr dasselbe Muster. Monate ohne Erwartung bekommen kein
  Ziel; erwartet keiner etwas, wird gleichmäßig verteilt.
- **Rundung:** volle Euro, abgerundet, die übrigen Euro an die Monate mit dem größten Rest — die
  Summe trifft den Betrag genau. Angelegt wird erst nach Bestätigung, danach sind es gewöhnliche
  Monatsziele.

### 13.3 Lücke als Zukauf (`purchaseForGap`, seit 2.34.0)

- Nur für offene Ziele des laufenden Jahres auf *Knapp* oder *Unter Plan* (§13.1).
  `Lücke = Zielbetrag − Hochrechnung`.
- Je Asset der Prognose (§14.1) zählen die Zahlungen je Euro Marktwert in den Monaten des
  Zeitraums, **frühestens im übernächsten Monat** (den Ex-Tag des nächsten verpasst ein Kauf heute
  oft); beim Monatsziel nur sein Monat. Im Planer ausgeschlossene Assets fehlen.
- `Zukauf = Lücke ÷ Zahlungen je Euro`, auf volle 100 € aufgerundet; vorgeschlagen wird das Asset
  mit dem kleinsten Zukauf, höchstens bis zum Höchstbetrag des Nachkaufs. Der Knopf öffnet den
  Nachkauf mit diesem Betrag. Zahlt im Zeitraum kein Asset mehr, bleibt es bei der Lücke.

---

## 14. Prognose und Dividenden-Schneeball (Bestand › Prognose, seit 1.44.0)

Seit 2.20.0 stehen Monatslücken (§14.3) und Schneeball (§14.2) im Planer; Bestand › Prognose
zeigt nur noch die nächsten zwölf Monate (§14.1). Die Regeln sind unverändert.

Beide Anzeigen sind **Schätzungen**. Sie werden beim Anzeigen gerechnet und nie gespeichert;
gespeichert sind nur die Annahmen des Schneeballs (`profiles.forecast_settings`, Migration
0034). Sie fließen weder in Statistik noch in Ziele (PRODUCT_SPEC.md Grundsatz 8).

### 14.1 Nächste 12 Monate (`forecastTwelveMonths`)

- **Fenster:** die zwölf vollen Monate nach dem laufenden (am 21.10.2026: Nov 2026 – Okt 2027).
- **Netto-Quote** (`netRatio`): Summe netto ÷ Summe brutto der Zahlungen der zwölf Monate bis
  heute (tatsächliches Eingangsdatum, nur EUR), höchstens 1. Ohne Zahlungen wird brutto
  gerechnet und so beschriftet. **Je Land** (seit 2.22.0, `netRatioByCountry`): Hat das Land
  eines Assets mindestens drei Zahlungen in dem Zeitraum, gilt dessen Quote (Quellensteuer);
  sonst die gesamte. Bewusst nicht je Asset: Der Freistellungsauftrag ist am Jahresanfang
  verbraucht, ein Asset, das nur im Januar zahlt, sähe sonst steuerfrei aus.
- **Geschätzt:** je gehaltener Position des jüngsten Depotstands die erwartete Jahresdividende
  (brutto) × Netto-Quote ÷ Anzahl Zahlmonate, in jedem Zahlmonat. Zahlmonate in dieser
  Rangfolge (`payoutMonthsOf`): gepflegte Ausschüttungsmonate, Monate der Zahlungen der letzten
  zwölf Monate (effektiver Monat §10), Rhythmus des Exports ab `next_pay_date`, sonst
  gleichmäßig über zwölf Monate. „Keine Ausschüttung" und Positionen ohne oder mit 0 €
  Jahresdividende tragen nichts bei.
- **Kein Kalenderabgleich:** Der Dividendenkalender reicht nur ein, zwei Monate voraus und
  fließt deshalb nicht ein; die Reihe ist durchgehend geschätzt.
- **Vergleich im Kopf:** erhaltene Nettosumme der zwölf Monate bis heute.

### 14.2 Schneeball (`projectSnowball`)

- **Start:** Jahresdividende (brutto) des jüngsten Stands. **Vorbelegung** (`depotAssumptions`):
  Wachstum = mit der Jahresdividende gewichtete `dividend_cagr`, begrenzt auf 0–8 % (ohne
  Angabe 5 %); Rendite neuer Käufe = Jahresdividende ÷ Depotwert, begrenzt auf 0,5–10 % (ohne
  Angabe 3 %).
- **Monatsschritt:** Nettodividende = Jahresdividende × Netto-Quote ÷ 12; investiert wird die
  Sparrate, bei Reinvestition zuzüglich dieser Nettodividende; jeder investierte Euro erhöht die
  Jahresdividende um die Rendite neuer Käufe. **Jahresende:** Jahresdividende × (1 + Wachstum).
- **Inflation:** Werte des Jahres *n* geteilt durch (1 + Inflation)^n (heutige Kaufkraft).
- **Szenarien:** vorsichtig und optimistisch mit 2 Prozentpunkten weniger (nie unter 0 %) bzw.
  mehr Wachstum; im Diagramm als Band, im Kopf mit der jeweils gerechneten CAGR beschriftet.
- **Ziel und Meilensteine:** Kalenderjahr des ersten Monats, in dem die monatliche
  Nettodividende das Ziel erreicht (Horizont 30 Jahre; Inflation dabei je Monat
  `(1 + Inflation)^(1/12)`, an jedem Jahrestag genau `(1 + Inflation)^n`). Seit 2.36.0 monatsgenau:
  Bis 2.35 zählte der erste Jahrestag ab heute, ein Ziel im Dezember rutschte so ins Folgejahr.
- **Punkte im Diagramm** (seit 2.36.0): je Jahresende (Dezember); „Heute“ im Kopf ist der Stand des
  laufenden Monats. Ein Ziel im Jahr J heißt: Punkt J liegt darüber, Punkt J − 1 darunter. Kursgewinne fließen nicht ein. Gerechnet wird mit Decimal, angezeigt in
  vollen Euro.
- **Bisheriger Weg** (`snowballHistory`, seit 2.32.0): je abgeschlossenem Kalenderjahr vor dem
  laufenden die erhaltene Nettodividende (aktive Eingänge, effektives Datum §10) ÷ 12, vom ersten
  Jahr mit einer Zahlung an; Jahre ohne Zahlung dazwischen zählen 0. In **Nennwerten** (keine
  Inflationsbereinigung: es ist, was ankam). Im Diagramm durchgezogen bis heute, die Hochrechnung
  ab heute gestrichelt; unter „Heute“ steht das erste Jahr mit seinem Wert („2019: 12 €“).
- **Diagrammlänge** (`snowballChartEndYear`, seit 2.32.0): bis drei Jahre nach dem Zieljahr des
  vorsichtigen Szenarios, mindestens zehn Jahre ab heute, höchstens 30; ohne erreichtes Ziel
  (vorsichtig) der ganze Horizont. Meilensteine und Kopf rechnen weiter über 30 Jahre.
- **Zeitraum** (seit 2.36.0): „Max | 20 J. | 10 J.“ über dem Diagramm. 20 und 10 Jahre zeigen
  zuerst die Hochrechnung bis zum Diagrammende und füllen den Rest mit dem bisherigen Weg; eine
  Stufe erscheint nur, wenn sie kürzer ist als der ganze Verlauf. Vorgewählt ist seit 2.37.2 „10 J.“
  (Zukunftsblick), ohne diese Stufe „Max“. Ohne Legende (Tooltip und
  Datentabelle nennen die Reihen).

### 14.3 Monatslücken (`monthGaps`, seit 2.13.0; Planer › Optimierungen)

- **Lücke:** jeder Monat der Prognose (§14.1) unter ihrem Ø-Monat (`Summe ÷ 12`);
  `Lücke = Ø − Monat`. Reihenfolge wie die Prognose.
- **Füller:** unter den Positionen, die in dem Monat zahlen, nur solche mit weniger als zwölf
  Zahlungen im Jahr (ein Monatszahler hebt alle Monate gleich) und mit Marktwert > 0. Zukauf
  `= Lücke × Marktwert ÷ Betrag je Zahlung` (netto, wie in der Prognose), auf volle 100 €
  aufgerundet. Gezeigt werden bis zu drei Füller (seit 2.15.0), geordnet wie unten
  (bei Gleichstand mehr je 1.000 €, dann Name), je mit dem, was 1.000 € Zukauf in dem Monat
  bringen (`1.000 × Betrag je Zahlung ÷ Marktwert`). Die Zeile nennt nur ihre Anzahl („3 Assets
  zum Auffüllen“), alle klappen erst auf Klick auf (seit 2.17.0). Nur Positionen aus dem eigenen
  Bestand; ohne passende Position „Kein passendes Asset im Bestand“.
- Der Zukauf hebt auch die übrigen Zahlmonate der Position; er ist eine Orientierung, keine
  Kaufempfehlung, und wird nicht gespeichert.
- Im Planer ausgeschlossene Assets (§16) sind keine Füller (seit 2.20.0). Kein Füller wächst über
  seine Gewichtung (§16, seit 2.22.0): Passt der ganze Zukauf nicht darunter, gilt seit 2.27.0 der
  größte, der passt (`x ≤ (g·D − W) ÷ (1 − g)`, auf volle 100 € abgerundet), mit dem Betrag, den
  er von der Lücke schließt („3.000 € bis zur Gewichtung schließen 22 €“); unter 100 € Platz fällt
  er weg (bis 2.26 fiel jeder Füller weg, dessen ganzer Zukauf nicht passte). Geordnet nach
  geschlossenem Betrag, dann kleinster Zukauf.

### 14.4 Ziel-Zeit (`monthsToTarget`, `monthsEarlier`, seit 2.32.0)

- **Monate bis zum Ziel:** dieselbe Rechnung wie §14.2 im Basisszenario, aber nach jedem Monat
  geprüft (Inflation je Monat `(1 + Inflation)^(1/12)`, Wachstum weiter am Jahresende); 0 = schon
  erreicht, ohne Ziel oder nach 30 Jahren nicht erreicht = unbekannt. Seit 2.33.1 anteilig im
  Monat des Erreichens (linear zwischen Vor- und Zielmonat, real), sonst ergab ein kleiner Kauf
  ohne Reinvestieren „0 Monate“.
- **Früher am Ziel** = Monate ohne − Monate mit dem Zusatz; „ohne“ wird bis 60 Jahre gerechnet
  (ohne Sparpläne liegt das Ziel oft hinter dem Horizont, gerade dann zählt der Abstand). Annahmen wie im Schneeball:
  Einmalkäufe plus Summe der Sparpläne (§17).
  - **Nachkauf:** Zusatz = Mehr im Jahr netto des Plans ab heute (über die Netto-Quote in brutto
    zurückgerechnet).
  - **Sparpläne:** mit gegen ohne die aktiven Pläne (nur die Einmalkäufe des Schneeballs).
- Gezeigt ab einem Tag (seit 2.33.1; davor ab einem Monat), ab einem Monat in ganzen Monaten,
  darunter in Wochen oder Tagen („2 Wochen früher am Ziel“), unter der Hauptzahl in einer Zeile („4 Monate früher am Ziel“, seit
  2.33.0; das Ziel nennt der Link für Screenreader, er führt zum Schneeball). Nicht gezeigt, wenn das Ziel schon erreicht ist, mit dem
  Zusatz nicht in 30 oder ohne ihn nicht in 60 Jahren.

---

## 15. Fortschritt (seit 2.12.0)

Abgeleitet aus derselben Datenbasis wie die Ziele (§13, effektives Zahlungsdatum, netto). Nichts
davon wird gespeichert außer den Fixkosten selbst (`profiles.fixed_costs`, Migration 0041).

### 15.1 Was deine Dividenden bezahlen (`coverFixedCosts`)

- **Rhythmus** (seit 2.34.0): monatlich, vierteljährlich, halbjährlich oder jährlich. Gespeichert
  ist der Betrag je Fälligkeit; gerechnet wird mit `Betrag ÷ Monate`, auf Cent gerundet. „Im Jahr"
  kommt aus dem Betrag je Fälligkeit (`Betrag × 12 ÷ Monate`), nicht aus dem gerundeten Monat.
- **Basis:** Ø-Monat = Nettosumme der letzten zwölf Monate ÷ 12 (`trailingMonthlyAverage`,
  dieselbe Zahl wie im Kopf des Fortschritts).
- **Reihenfolge:** günstigste Position zuerst (bei Gleichstand nach Name). Jede Position, die der
  verbleibende Betrag ganz deckt, gilt als **gedeckt** und wird abgezogen.
- **Nächste:** die erste nicht gedeckte Position; der Rest zählt anteilig
  (`Rest ÷ Betrag × 100`), `noch = Betrag − Rest`. Alle weiteren sind **offen**, auch wenn eine
  spätere zufällig in den Rest passte — die Leiter wird der Reihe nach erklommen.
- **Anteil gesamt:** `min(Ø-Monat, Summe) ÷ Summe × 100`, also höchstens 100 %.

### 15.2 Meilensteine (`milestoneOverview`)

Zahlungen chronologisch (effektives Datum, dann `created_at`). Jede Schwelle gilt als erreicht am
Datum der Zahlung, mit der der Stand sie erstmals erreicht; danach nie wieder aberkannt.

| Art | Stand | Schwellen |
| --- | --- | --- |
| Erste Dividende | erste Zahlung | – |
| Insgesamt erhalten | laufende Summe | ab 1.000 €, je Zehnerpotenz 1 · 1,5 · 2 · 3 · 4 · 5 · 7,5 |
| Bestes Jahr | Summe des Kalenderjahres | ab 500 €, dieselben Stufen |
| Bester Monat | Summe des Kalendermonats | ab 100 €, dieselben Stufen |
| Monate in Folge | lückenlose Kalendermonate mit Zahlung | 3, 6, 12, 24, 36, 48, 60, danach +12 |

Die Zahl verschiedener Zahler ist seit 2.15.0 kein Meilenstein mehr: Mehr Positionen sind kein Ziel
an sich.

**Nächster Meilenstein** je Art: die erste noch nicht erreichte Schwelle mit dem heutigen Stand
(bestes Jahr bzw. bester Monat bisher; bei der Serie die laufende Serie — sie läuft weiter, solange
der laufende oder der Vormonat eine Zahlung hat). Fortschritt `Stand ÷ Schwelle`, auf 0–100 %
begrenzt.

### 15.4 Termine (`progressEtas`, seit 2.34.0)

Wann fällt der nächste Meilenstein, ab wann ist eine offene Fixkostenposition gedeckt? Eine
Schätzung wie der Schneeball (§14), nie gespeichert; ohne Depotstand gibt es keine Termine.

- **Künftige Monate:** derselbe Kalendermonat der zwölf vollen Monate vor dem laufenden, mal dem
  **Wachstum** des Schneeballs gegenüber heute (§14.2 im Basisszenario, Einmalkäufe plus aktive
  Sparpläne wie §14.4, in **Nennwerten** ohne Inflation, `projectMonthlyNet`). Nur das Wachstum
  kommt aus dem Depotstand, die Höhe aus dem Erhaltenen: Der Depotstand kennt nicht jede Zahlung.
  Ein Monat ohne Zahlung bleibt ohne Zahlung; ohne Zahlungen in diesen zwölf Monaten gibt es keine
  Termine. Der laufende Monat bringt nichts mehr hinzu.
- **Meilensteine** (§15.2) mit der Reihe fortgeschrieben: *Insgesamt* die laufende Summe, *Bestes
  Jahr* die Summe des Kalenderjahres (das laufende ab dem Erhaltenen), *Bester Monat* der einzelne
  Monat, *Monate in Folge* die Serie (der laufende Monat zählt mit, wenn er laut Muster zahlt).
- **Fixkosten** (§15.1): eine offene Position ist gedeckt, sobald der Ø der zwölf Monate bis dahin
  (erhalten, dann geschätzt) sie und alle günstigeren trägt.
- Horizont 30 Jahre; gezeigt als Monat („≈ Mai 2027", „ab Mai 2027").

### 15.3 Kaufpreis zurückverdient (`paybackOverview`, seit 2.18.0)

- **Positionen:** die Zeilen des jüngsten Depotstands mit Einstand (`buyin_total` > 0) in Euro. Andere
  Währungen fallen weg, statt zu einem erfundenen Kurs gerechnet zu werden.
- **Erhalten:** Nettosumme aller Zahlungen des Assets, gleich wann (auch vor einem Nachkauf);
  nie unter 0. Zahlungen verkaufter Assets zählen nicht.
- **Anteil:** `Erhalten ÷ Einstand × 100`, nicht begrenzt. Ab 100 % **ganz zurück**, ab 50 % **über
  die Hälfte**, sonst **unter der Hälfte**; `noch = max(0, Einstand − Erhalten)`.
- **Als Nächstes:** das Asset mit dem höchsten Anteil unter 100 %.
- **Insgesamt:** Summe Erhalten ÷ Summe Einstand über dieselben Positionen.

Der Einstand ist der heutige Durchschnitt der Quelle: Ein Nachkauf erhöht ihn und senkt den Anteil.
Deshalb gibt es dafür keine Meilensteine, die einmal erreicht nie wieder aberkannt würden (§15.2).

---

## 16. Nachkauf-Planer (Planer › Nachkauf, seit 2.20.0)

Eine Rechnung beim Anzeigen (`planPurchase`), keine Kaufempfehlung. Gespeichert wird kein Plan;
die Eingaben stehen in der Adresse (`?modus=sparplan&betrag=1000&fokus=monate&anzahl=3`).

- **Kandidaten** (`purchaseCandidates`): Positionen der Prognose (§14.1) mit Marktwert > 0 und
  Betrag > 0, ohne ausgeschlossene Assets. Ertrag je Zahlung und Euro = Betrag je Zahlung der
  Prognose (netto) ÷ Marktwert; Zahlmonate wie in der Prognose. Neue Assets außerhalb des Bestands
  gehen nicht (dafür fehlen Kurs und Dividende).
- **Betrag:** Schritte zu 50 €, mindestens 100 € je Kauf, 1–5 Käufe (Standard 3, vorbelegt
  3.000 €). Bis 2.32 gab es daneben einen Modus Sparpläne (Monatsrate, zwölf Raten); seit 2.33.0
  stehen Sparpläne nur unter §17. Höchstens 200 Schritte: Größere
  Beträge verteilen in einem Vielfachen der Schrittweite. Weniger Käufe, wenn der Betrag für den
  Mindestbetrag je Kauf nicht reicht; der Rest unter einem Schritt geht an den größten Kauf.
- **Mehr Dividende:** die Kandidaten mit dem höchsten Ertrag je Euro im Jahr, zu gleichen Teilen.
- **Dividendenwachstum:** wie oben, gereiht nach Ertrag × (1 + CAGR)⁵, CAGR auf 0–15 % begrenzt
  (ohne Angabe 0 %).
- **Monate glätten:** Schritt für Schritt an den Kandidaten, der die Summe der Abstände aller Monate
  unter ihrem Ø am stärksten verringert (bei Gleichstand der höhere Ertrag). Sind so viele Assets
  gewählt wie Käufe erlaubt, gehen weitere Schritte nur an diese. Käufe unter dem Mindestbetrag
  werden auf den größten umgelegt.
- **Ergebnis:** mehr netto im Jahr, Ertrag des Plans (÷ investiert), Ø-Monat und schwächster Monat
  vorher und nachher, je Kauf ungefähre Stückzahl zum letzten Kurs des Depotstands.
- **Ausschließen:** bis zu 30 Assets, gespeichert mit den Schneeball-Annahmen in
  `profiles.forecast_settings.excluded` (nicht in der Datensicherung). Sie zählen weiter in der
  Prognose, werden aber weder im Nachkauf noch als Füller der Monatslücken vorgeschlagen.
- **Gewichtung** (seit 2.22.0 als „Positionsgrenze“, seit 2.24.0 so benannt): Keine Position wächst über diesen Anteil am Depot nach dem
  Kauf (Marktwert aller Positionen + investiert). Die Grenze
  wählst du **je Asset** auf seiner Seite (0,5–50 % auf eine Nachkommastelle, seit 2.24.0; zuvor ganze
  Werte 2–50 %; `profiles.position_caps`, Migration 0043, nicht
  in der Datensicherung); ohne eigene gilt 0 %: Das Asset wird nicht vorgeschlagen (seit 2.25.0; 2.24.0 fest 1 %, 2.23.1 fest 8 %, zuvor ein einstellbarer Standard
  im Nachkauf). Gilt auch bei den Monatslücken. Positionen ohne
  Platz für den Mindestbetrag fallen weg; ist eine gewählte voll, bekommen die übrigen mehr. Die
  gewählte Zahl der Käufe bleibt; was darin keinen Platz findet, nennt der Plan.
- **Streuung nach dem Kauf:** größte Position, Branche und Land nach Marktwert plus Kauf; eine
  Position über der Grenze ist hervorgehoben. Assets ohne Branche oder Land bilden keine Gruppe.

## 17. Sparpläne (Planer › Sparpläne und Seite des Assets, seit 2.21.0)

Von Hand gepflegte Stammdaten, keine Buchungen: Sparpläne erzeugen keine Eingänge und ändern weder
Bestand noch Prognose.

- **Speicher:** `profiles.savings_plans` (Migration 0042), eine jsonb-Liste wie die Fixkosten,
  höchstens 30 Pläne (die Spalte fasst 8 KB, rund 37 Pläne); nicht in der Datensicherung. Je Plan: Asset, Rate (> 0, bis
  100.000 €), Rhythmus monatlich oder wöchentlich, optional Depot, ein Ausführungsdatum als Anker
  und „pausiert". Ein ungültiger Eintrag fällt beim Lesen weg, statt die Liste zu verwerfen.
- **Monatsbetrag:** monatlich die Rate, wöchentlich Rate × 52 ÷ 12.
- **Nächste Ausführung:** der Anker, im Rhythmus fortgeschrieben, bis er nicht vor heute liegt.
  Monatlich bleibt der Tag des Ankers, am Monatsende gekürzt (31. → 28.02.).
- **Wirkung** (`savingsPlanOverview`): zwölf Monatsbeträge je aktivem Plan mal Ertrag je Euro und
  Zahlmonate des Kandidaten aus §16 (ohne Ausschlüsse). Ein Asset ohne Kandidat (nicht im
  Depotstand, ohne Dividende) zählt in der Summe der Raten, aber nicht in der Dividende. Ertrag =
  mehr netto im Jahr ÷ zwölf Monatssummen. Pausierte Pläne zählen nirgends. Das Diagramm zählt
  im k-ten Monat k Raten (Hochlauf). Die Liste steht alphabetisch
  nach Name des Assets (seit 2.21.1).
- **Schneeball:** rechnet mit den Einmalkäufen (Feld im Schneeball) **plus** der gerundeten
  Monatssumme der aktiven Pläne und nennt beides unter den Annahmen (seit 2.33.0; bis 2.32 galten
  die Pläne nur bei leerem Feld).
- **Tipps** (seit 2.26.0, `savingsPlanTips`): Abgleich mit den Gewichtungen (§16) beim
  Depotstand, Kurse unverändert. Erstens aktive Pläne, deren Asset schon über seiner Gewichtung
  liegt oder sie in höchstens 24 Monaten erreicht: n = ⌈(g·D − W) ÷ (r − g·R)⌉ mit Gewichtung g,
  Depotwert D, Marktwert W, Monatsrate r des Assets und Summe R aller aktiven Raten (das Depot
  wächst mit). Zweitens aktive Pläne auf Assets ohne Gewichtung. Drittens höchstens drei gehaltene
  Assets mit Gewichtung, ohne Plan (auch keinen pausierten) und nicht ausgeschlossen, mit dem
  meisten Platz bis zur Gewichtung (mindestens 12 × 25 €). Ohne Befund fehlt der Abschnitt.
