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
| **R-6 Export** | Exporte enthalten die gespeicherten Werte in voller Skala (2 bzw. 6/8 Stellen), Dezimalpunkt-Notation im JSON, konfigurierbares Format in CSV/Excel | — |
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
- Als CHECK-Constraint in Postgres hinterlegt (Toleranzform), zusätzlich Zod-seitig geprüft.

## 5. Fingerprint-Berechnung (normativ)

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
| Teiljahre | Kein Hochrechnen. YTD-Werte sind als „bis TT.MM." gekennzeichnet; Durchschnitte über Monate zählen nur Monate ≤ aktueller Monat (laufendes Jahr) bzw. alle 12 (abgeschlossene Jahre) |
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

### 9.3 Aktueller Monat (§5.2/§6.3)

- Aktuell: `[erster Tag des aktuellen Monats, heute]` (unabhängig von der Jahresauswahl).
- Vergleich: gleicher Monat im Vorjahr `[01., entsprechender Kalendertag]`; besitzt der
  Vorjahresmonat weniger Tage, wird auf den letzten gültigen Kalendertag gekappt.

### 9.4 Prozentuale Veränderung (§6.4)

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
  abgeschlossenes Jahr `Jahressumme ÷ 12`; bei „Alle Jahre" nicht ausgewiesen.
- **Bester Monat (§5.5):** Kalendermonat mit maximaler Nettosumme im Zeitraum; bei Gleichstand
  gewinnt der **aktuellere** Monat.
- **Top-Unternehmen / Depotverteilung (§9/§10):** `Σ net` je Wertpapier/Depot; Anteil
  `= Teilsumme ÷ Zeitraum-Gesamtsumme`, „—" wenn Gesamtsumme ≤ 0. Sortierung: Nettosumme ↓,
  dann Anzahl ↓, dann Name alphabetisch (de).
- **Monatszeitreihe (§7):** zwölf Monate; zukünftige Monate des laufenden Jahres werden **nicht**
  als 0 dargestellt, sondern als Lücke „noch nicht begonnen" (keine Prognose). In abgeschlossenen
  Jahren dürfen zahlungsfreie Monate 0 € sein.
- **Historische Gesamtsumme (§5.3/§12):** immer über die gesamte aktive Historie, unabhängig von
  der Jahresauswahl; als historischer Gesamtwert gekennzeichnet.

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
- **Mit Plan:** die Zahlung wird dem **letzten fälligen geplanten Monat am oder vor** dem
  Zahlungsmonat zugeordnet (größter geplanter Monatsindex ≤ Zahlungsmonat), geprüft über die
  geplanten Monate der Jahre `J−1` und `J`. Die geplanten Monate sind damit **maßgebend**: eine
  später als geplant eingetroffene Dividende zählt zu dem Monat, für den sie fällig war — nicht
  zum bloß nächstgelegenen. Beispiel Quartalsplan Mär/Jun/Sep/Dez: Zahlung 2. April → März;
  Zahlung 28. Mai → ebenfalls März (nicht Juni).
- **Jahreswechsel:** die Zuordnung darf das Jahr zurück verschieben. Eine Zahlung vor dem ersten
  geplanten Monat des Jahres zählt zum letzten geplanten Monat des Vorjahres (z. B. Februar bei
  Plan Mär/Jun/Sep/Dez → Dezember des Vorjahres; Januar bei Dezember-Plan → Dezember des Vorjahres).
- Fällt der Zahlungsmonat selbst auf einen geplanten Monat, bleibt dieser.
- Der Tag des effektiven Datums ist der echte Zahltag, begrenzt auf die Länge des Zielmonats
  (z. B. 31.03. → geplanter Februar → 28./29.02.). Er dient nur der internen Datumsdarstellung,
  nicht der Zuordnung.

### 10.2 Geltungsbereich

Der effektive Monat ersetzt das echte Datum in **allen** Auswertungen und in der Eingangsliste
(Filter nach Jahr/Monat, Sortierung, angezeigter Monat). Das echte Zahlungsdatum bleibt
gespeichert (`pay_date`) und wird dort, wo es abweicht, zusätzlich ausgewiesen
(„tatsächlich TT.MM.JJJJ"). Die Berechnung ist rein clientseitig; es findet keine
Gleitkomma-Geldarithmetik statt.

### 10.3 Randfälle

- Mehrere Zahlungen können auf denselben effektiven Monat fallen (Nachzahlung, Korrektur) —
  sie summieren sich dort erwartungsgemäß.
- Eine ausnahmsweise **vor** dem geplanten Monat eingetroffene Zahlung wird dem vorherigen
  geplanten Monat zugerechnet (die Regel geht von „später als geplant" aus). Kein Vorziehen in
  einen künftigen geplanten Monat.

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

### 11.7 Heatmap und Diagramme

- **Heatmap** (`heatmapByYearMonth`): eine Zeile je Jahr (neueste zuerst), je zwölf
  Monatseimer (`monthlyBuckets`). Die Farbintensität ist rein visuell (Wurzelskalierung der
  Nettosumme); Betrag und Anzahl je Zelle sind zusätzlich als Text (Titel/Screenreader) verfügbar.
- Alle Diagramme (Jahres-/Monatsentwicklung, Unternehmen nach Summe, Depotverteilung, Heatmap)
  erhalten die aggregierten Werte fertig aus der Analytics-Schicht und enthalten **keine** eigene
  Berechnung. Balkenhöhen/Zellintensitäten nutzen `Money.toChartNumber()` ausschließlich visuell
  (§1/§8); alle angezeigten Beträge stammen aus `formatMoney`.

### 11.8 Filter (`filterPayments`)

Kombinierbarer Filter über Jahr (effektives Kalenderjahr), Unternehmen, Depot, Datenquelle
(`source`) und Zahlungsart (`payment_type`). Reine UND-Verknüpfung als Vorstufe der Aggregation;
`null` bedeutet je Kriterium „keine Einschränkung". Der Filter ist URL-serialisiert
(`?year=&security=&depot=&source=&type=`) und bleibt nach Reload sowie über Browser-Zurück/-Vorwärts
erhalten.

### 11.9 Drill-down-Garantie

Jede Kennzahl, jeder Diagrammbalken, jede Heatmap-Zelle und jede Tabellenzeile navigiert in die
gefilterte Zahlungsliste (`/eingaenge`) bzw. — bei „Jahr → Monate dieses Jahres" — in den
Monats-Unterbereich mit gesetztem Jahresfilter. Der aktive Statistikfilter (Unternehmen/Depot/Jahr)
wird dabei mit dem konkreten Drill-Kriterium zusammengeführt, sodass die Zielliste dieselbe
Teilmenge zeigt (Grundsatz 6). `source`/`payment_type` sind in der Zahlungsliste nicht filterbar
und bleiben beim Drill-down unberücksichtigt.

## Phase 6 – Validierung und Datenqualität

**Zahlungsdatum.** Gültiges Kalenderdatum, ≥ 1970-01-01 und ≤ heute (lokal,
ohne Zeitzonenverschiebung; entspricht dem DB-CHECK `pay_date <= current_date`).
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
(= 5) × Median der übrigen aktiven Zahlungen desselben Unternehmens, erst ab
3 Vergleichszahlungen — keine starre absolute Schwelle, nur ein Hinweis.

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
zu den YTD-/Monatszeiträumen). Vor Beginn 0 %, nach Ende 100 %. **Keine**
Hochrechnung, keine erwartete Zielerreichung, kein voraussichtliches
Erreichungsdatum.

**Dynamik (§28).** Da Zielstände aus den aktuellen Zahlungen abgeleitet werden,
aktualisiert jede Zahlungs-/Import-Mutation (Anlegen, Bearbeiten, Datum-/
Betragsänderung, Storno, Reaktivierung, Löschung, Import-Commit/-Rollback) über
die Invalidierung von `["payments"]` automatisch alle betroffenen Ziele,
Dashboard und Statistik. Es bleibt kein veralteter Zielstand zurück.
