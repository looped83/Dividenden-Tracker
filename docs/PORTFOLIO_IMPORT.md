# Depotstand (DivvyDiary-Portfolio-Export)

Der Bereich **Unternehmen** (`/#/unternehmen`) kann den Portfolio-Export von DivvyDiary
einlesen und je Position einen **Depotstand zu einem Stichtag** speichern. Damit bekommt
die App zum ersten Mal einen Blick auf das, was ein Papier heute wert ist und was es
künftig ausschütten soll — ohne dass die erfassten, tatsächlich erhaltenen Dividenden
davon berührt werden.

## 1. Zweck und Abgrenzung

| | Dividendeneingänge (`/#/eingaenge`) | Depotstände (`/#/unternehmen`) |
|---|---|---|
| Inhalt | tatsächlich erhaltene Zahlungen | Bestand, Kurs, **erwartete** Ausschüttung |
| Herkunft | manuell, CSV-/Excel-Import, Wiederherstellung | DivvyDiary-Portfolio-CSV |
| Zeitbezug | Zahltag | **Stichtag** des Exports |
| Tabelle | `dividend_payments` | `security_snapshots` |

Beide Datenarten bleiben getrennt (PRODUCT_SPEC.md Grundsatz 8):

- Aus dieser Datei entsteht **nie** ein Dividendeneingang.
- Kein Marktwert und keine erwartete Ausschüttung geht in Statistik, Ziele oder
  Dividendenhistorie ein.
- Die einzige Verbindung ist `security_id` — dasselbe Unternehmen, zwei Blickrichtungen.

Der Dividendenkalender (docs/CALENDAR_INTEGRATION.md) bleibt die Quelle für angekündigte
Termine. `next_ex_date`/`next_pay_date` werden zwar gespeichert, aber **nicht angezeigt**:
Derselbe Termin an zwei Stellen mit zwei Aktualisierungszyklen wäre eine Fehlerquelle.

## 2. Aufbau

```
DivvyDiary-Portfolio-CSV (lokale Datei)
        ↓  im Browser gelesen, die Datei verlässt ihn nicht (ARCHITECTURE.md §5)
features/securities/divvydiaryCsv.ts   Spalten, Zahlen, Platzhalter
        ↓
features/securities/portfolioMatch.ts  Zuordnung + Stammdaten-Vorschläge
        ↓
Supabase  security_snapshot_runs + security_snapshots (RLS, eigene Zeilen)
        ↓
Kacheln (/unternehmen) · Positionskarte (Detailseite) · Statistik „Entwicklung"
```

| Datei | Rolle |
|---|---|
| `supabase/migrations/0029_security_snapshots.sql` | Tabellen, Enums, Indizes, RLS, Eigentumsprüfung |
| `src/features/securities/divvydiaryCsv.ts` | Einlesen und Normalisieren der CSV |
| `src/features/securities/portfolioMatch.ts` | Zuordnung zu den eigenen Unternehmen |
| `src/features/securities/snapshots.ts` | Auswertung (jüngster Stand, Summen, Rendite, Zeitreihe) |
| `src/features/statistics/DevelopmentTab.tsx` | Unterbereich „Entwicklung" |
| `src/features/securities/PortfolioImportDialog.tsx` | Assistent |
| `src/features/securities/PortfolioSummary.tsx` | Kennzahlkacheln |
| `src/features/securities/PositionCard.tsx` | Position auf der Detailseite |
| `src/lib/supabase/repositories/securitySnapshots.ts` | Lesen und Schreiben |

## 3. Vier Eigenheiten der Quelle

Sie bestimmen den Parser; ein naiver Import scheitert an jeder einzelnen.

**`currency` ist nicht die Währung des Wertpapiers.** Die Spalte trägt die Depotwährung
und steht im Export durchgehend auf `EUR`. Die übliche Ausschüttungswährung — das, was
`securities.currency` laut DATA_DICTIONARY.md meint — steht in
`originalDividendCurrency`. Wer die naheliegende Spalte nimmt, schreibt bei jeder Zeile
`EUR` und macht den Bestand ärmer statt reicher.

**`country` und `sector` enthalten `"mixed"`.** Bei Fonds und ETFs ist das die ehrliche
Antwort der Quelle, aber weder ein Land noch eine Branche. `securities.country` ist
`char(2)` und wiese den Wert ohnehin ab; als Branche stünde „mixed" künftig als größter
Sektor in der Statistik. Beides wird verworfen, nicht verbogen.

**Leer ist nicht null.** Bei Zeilen ohne Bestand lässt die Quelle `gain` und `gainRel`
leer, weil es keinen Gewinn zu berechnen gibt. Eine 0 stünde dort als Aussage, wo die
Quelle bewusst schweigt — die Spalten bleiben deshalb `null`, und Summen zählen solche
Zeilen nicht mit (`counted` weist die Lücke aus).

**Der Stichtag steht nicht in der Datei.** DivvyDiary hängt den Exportzeitpunkt als
Millisekunden an den Dateinamen (`divvydiaryportfolio1785790381565.csv`). Er wird daraus
gelesen und im Assistenten **zur Bestätigung vorgelegt**; ein umbenannter Dateiname führt
zum heutigen Datum, nie zu einem geratenen.

Gerechnet wird beim Einlesen nichts: Jede Zahl geht über `parseAmount(…, "de")` in einen
kanonischen Dezimalstring und wird erst in der App über `lib/money` (Decimal) verrechnet,
nie als Fließkommazahl (CALCULATION_RULES.md §8). Das Zahlenformat ist **fest** auf
deutsch gesetzt statt erraten — bei `"auto"` wäre `1,234` nicht von Tausendern zu
unterscheiden, und ein falsch gelesenes Trennzeichen macht aus 1.234,56 € stillschweigend
1,23 €.

## 4. Nur Positionen mit Bestand

Der Export enthält auch Beobachtungswerte und verkaufte Papiere (`quantity = 0`). Sie
werden gezählt, aber **nicht importiert**: Ein Beobachtungswert ist kein Depotstand.

Daraus folgt eine Regel, die die App ableitet statt sie zu speichern:

> Die Datei ist der vollständige Depotstand ihres Tages. Hat ein Unternehmen Stände, aber
> keinen am jüngsten Stichtag, wird die Position nicht mehr gehalten.

Die Detailseite zeigt dann „Letzter bekannter Bestand" statt eines Bestands, den es nicht
mehr gibt. Ohne diese Unterscheidung bliebe eine verkaufte Position dauerhaft mit ihrem
letzten Stand stehen — still falsch, und das ist die schlimmste Art falsch.

## 5. Zuordnung und Stammdaten

Zuordnung strikt nach IMPORT_SPEC.md §4: **ISIN → WKN → Ticker → Name**. Die ersten drei
sind Kennungen und damit eindeutig; ist eine davon mehrfach aktiv vergeben, bleibt sie
ungenutzt (mehrdeutig ist nicht zugeordnet). Beim Namen übernimmt `matchCompany` die
vorhandene Zurückhaltung: exakte Treffer und beim Import bestätigte Schreibweisen
(`security_aliases`) ordnen automatisch zu, nur ähnliche Namen nie.

Stammdaten werden **vorgeschlagen, nicht überschrieben**:

- Abwählbar je Feld (ISIN, Ticker, WKN, Land, Branche, Währung) — nicht je Zeile. Bei 54
  Positionen wären über 300 Kästchen keine Kontrolle, sondern eine Zumutung.
- Es wird nur **gefüllt und berichtigt**, nie geleert: Schweigt die Quelle zu einem Feld,
  bleibt der vorhandene Wert unangetastet.
- Die **ISIN wird nur gefüllt, nie geändert**. Sie ist die Identität des Papiers: Sie
  trägt die Zuordnung dieses Imports, die Namensangleichung des Kalenders und einen
  eindeutigen Index in der Datenbank. Eine leere ISIN zu ergänzen ist eine
  Vervollständigung; eine vorhandene zu ersetzen hieße „das ist ein anderes Wertpapier" —
  das gehört ins Bearbeitungsformular, nicht in einen Sammelschalter.
- Der **Name** wird nie zur Änderung vorgeschlagen. Im Bestand steht die gewachsene
  Schreibweise, an der auch die Namensangleichung des Kalenders hängt
  (`lib/calendar/companyNames.ts`); die Quelle schreibt ETFs in voller Länge aus.

## 6. Datenmodell

`security_snapshot_runs` — ein Upload je Zeile, eindeutig über `(user_id, source, as_of)`.
Ohne diesen Satz ließe sich „an diesem Tag kein Upload" nicht von „an diesem Tag keine
Positionen" unterscheiden; eine Verlaufskurve zeichnete eine fehlende Datei als Depotwert 0.
Die Bilanz ist als Constraint hinterlegt: `rows_total = imported + skipped + invalid`
(IMPORT_SPEC.md §8).

`security_snapshots` — eine Zeile je Unternehmen **und Stichtag**, eindeutig über
`(user_id, security_id, as_of)`.

| Gruppe | Spalten |
|---|---|
| Position | `quantity`, `buyin_per_share`, `buyin_total`, `price`, `market_value`, `gain_absolute`, `gain_relative`, `allocation` |
| Dividende | `dividend_yield`, `dividend_yield_on_buyin`, `annual_dividend_total`, `dividend_per_share`, `dividend_frequency`, `dividend_cagr`, `dividend_cagr_period` |
| Termine | `next_ex_date`, `next_pay_date` (gespeichert, nicht angezeigt) |
| Herkunft | `asset_type`, `currency`, `run_id`, `as_of` |

Der Stichtag steht **doppelt** — am Lauf und an jeder Zeile. Das ist Absicht: Jede
Auswertung liest nach Stichtag, und ein Join auf den Lauf bei jeder Abfrage wäre dafür zu
teuer. Damit die Doppelung nicht auseinanderlaufen kann, zeigt der Fremdschlüssel auf
**beide** Spalten des Laufs (`(run_id, as_of) → (id, as_of)`) — ein Snapshot mit fremdem
Stichtag ist damit nicht speicherbar, nicht nur unerwünscht.

## 7. Sicherheit

- **Row Level Security**: `select`, `insert` und `delete` nur auf eigenen Zeilen. Anders
  als beim Kalender schreibt hier der Client — es gibt kein Secret und keine Edge
  Function, die Datei wird im Browser gelesen.
- **Kein UPDATE**, für keine der beiden Tabellen. Ein Stichtag wird als Ganzes ersetzt
  (löschen und neu schreiben). Eine einzelne nachträglich geänderte Zeile wäre eine Zahl,
  die in keiner Datei je stand.
- **`enforce_user_id`** setzt `user_id` aus `auth.uid()` und verbietet fremde Kennungen.
- **`enforce_own_security`** stellt sicher, dass das referenzierte Unternehmen dem
  Schreibenden gehört. Der Fremdschlüssel allein prüft nur die Existenz; ohne diese
  Prüfung risse das Löschen eines fremden Unternehmens einen eigenen Stand kaskadierend
  mit. Die Funktion läuft bewusst ohne `security definer` — dadurch erledigt die RLS von
  `securities` die eigentliche Arbeit.
- Geprüft in `tests/integration/portfolioSnapshots.test.ts`.

Dieselbe Prüfung gilt seit Migration 0030 auch für `dividend_payments.security_id` und
`.depot_id` (siehe SECURITY_MODEL.md §3.5).

## 8. Was die Oberfläche zeigt

**`/#/unternehmen`** — vier Kennzahlkacheln unter der Kopfzeile, an derselben Stelle wie in
jedem anderen Bereich: Depotwert (mit Stand), erwartete Jahresdividende, Rendite und
Anzahl Positionen. Die Verwaltungsliste darunter bleibt unverändert — sie hat bereits acht
Spalten und scrollt auf dem Telefon seitlich; drei Zahlenspalten mehr hätten sie
unbrauchbar gemacht.

Die Rendite ist **Summe durch Summe**, nicht der Mittelwert der Einzelrenditen. Der
Mittelwert gewichtet eine 43-€-Position genauso wie eine mit 26.000 € und ergibt eine Zahl,
die zu keinem Depot gehört (in der Kontrollmenge 4,56 % statt korrekt 3,95 %).

**Detailseite eines Unternehmens** — die Karte „Position" mit Stückzahl, Kurs, Marktwert,
Einstand, Gewinn, Rendite, Rendite auf Einstand, Dividende je Aktie, Rhythmus und
Wachstum. Darunter die erwartete Jahresausschüttung neben dem, was im letzten
**abgeschlossenen** Kalenderjahr tatsächlich eingegangen ist. Bewusst nicht gegen das
laufende Jahr: Die Erwartung gilt für zwölf Monate, ein angebrochenes Jahr ließe sie
zwangsläufig zu hoch aussehen.

**`/#/statistiken/entwicklung`** — der Unterbereich, der aus den Ständen eine Zeitreihe
macht: vier Kacheln (erwartet p. a., erhalten in den zwölf Monaten bis zum Stichtag, der
Zuwachs, Rendite auf den Einstand), der Verlauf beider Größen über die Stichtage, die
Gegenüberstellung je Unternehmen und die Aufteilung nach Branche und Land.

Die Differenz wird als **Zuwachs** gerechnet — erwartet minus erhalten —, nicht als
Abweichung. „Erwartet p. a." ist kein Ziel, das verfehlt werden könnte, sondern die
Ertragskraft des heutigen Depots; wer weiter investiert, hat sie zwangsläufig über dem,
was zwölf Monate davor mit kleinerem Bestand hereinkam. Andersherum stünde dort dauerhaft
eine rote Zahl für genau den Vorgang, der gut läuft. Die Wachstumsrate misst sich am
**Erhaltenen**, denn eine Rate bezieht sich auf den Wert, aus dem gewachsen wurde. Fällt
der Zuwachs negativ aus — Verkäufe, gekürzte Dividenden, eine Sonderausschüttung im
Vorjahr —, ist das ein echter Rückgang und bleibt rot.

Je Unternehmen sind drei Fälle zu unterscheiden: **gehalten mit Betrag** (Zuwachs =
erwartet − erhalten), **nicht mehr gehalten** (trägt künftig nichts bei, der Zuwachs ist
der Wegfall des Erhaltenen) und **gehalten, aber ohne Betrag der Quelle** (unbekannt, kein
Wert). Dafür führt die Zeitreihe `heldSecurityIds` mit: Ohne diese Unterscheidung würde
das Schweigen der Quelle als Null gelesen.

Verglichen werden **zwei Zwölfmonatszeiträume** (`trailingYearRange`). Die Erwartung gilt
für zwölf Monate nach vorn; ihr Gegenstück sind die zwölf Monate, die am Stichtag enden.
Ein Kalenderjahr taugt dafür nicht: Ein angebrochenes ließe die Erwartung zwangsläufig zu
hoch aussehen, ein abgeschlossenes hinkte bis zu zwölf Monate hinterher.

Die Daten kommen als **Domänentyp** `PortfolioSeries` über den Statistik-Kontext, nicht als
Snapshot-Zeilen — so bleibt der Kontext frei von Datenbanktypen und die Unterbereiche
weiterhin ohne Datenzugriffsschicht testbar. Die Aufteilung nutzt für alle Stichtage die
**heutige** Branche und das heutige Land: Eine mitwandernde Einordnung machte den Vergleich
zweier Zeitpunkte unmöglich. Fehlt beides — bei ETFs, weil „mixed" beim Import verworfen
wird —, sammelt sie ein sichtbarer Eimer „ohne Angabe"; ohne ihn addierten sich die Anteile
nicht zu hundert Prozent.

**`/#/statistiken/unternehmen`** — die Spalte „Erwartet p. a." neben den erhaltenen Summen.
Sie erscheint nur, wenn ein Depotstand importiert ist; eine Spalte voller Gedankenstriche
wäre nichts als verbrauchte Breite. Die Zahl kommt über den Statistik-Kontext, damit die
Unterbereiche wie bisher ohne Datenzugriffsschicht gerendert (und getestet) werden können.

## 9. Verhalten bei Störungen

| Situation | Verhalten |
|---|---|
| Fremde CSV | Abbruch mit Nennung der fehlenden Spalten, bevor irgendetwas geschrieben wird |
| Datei ohne Position mit Bestand | Hinweis, kein leerer Stichtag in der Datenbank |
| Einzelne Zeile ohne Name oder mit ungültiger ISIN | Zeile wird ausgewiesen, der Rest läuft durch; die Bilanz nennt sie |
| Zweiter Upload desselben Tages | Der vorhandene Stand wird ersetzt, nicht verdoppelt |
| Abbruch nach dem Lauf, vor den Zeilen | Ein Lauf ohne Zeilen bleibt sichtbar und lässt sich entfernen — PostgREST kennt keine Transaktion über mehrere Anfragen |
| Verkauftes Papier | Fehlt im jüngsten Stand; die Detailseite sagt „Letzter bekannter Bestand" |
| Verschiedene Währungen im Stand | Es wird **nicht** addiert; die Kachel weist „verschiedene Währungen" aus |

## 10. Tests

```bash
npm test                  # Parser, Zuordnung, Auswertung
npm run test:integration  # RLS, Grants, Eindeutigkeit, Bilanz, Eigentumsprüfung
```

Die Testdaten sind **erfunden** — Struktur und Schreibweisen entsprechen einem echten
Export, Stückzahlen und Beträge nicht. Ein realer Depotbestand gehört nicht in ein
Repository, auch nicht in ein privates.

## 11. Was bewusst offen bleibt

- **`payout_months` wird nicht abgeleitet.** Aus Rhythmus und nächstem Zahltag ließen sich
  die Ausschüttungsmonate rechnerisch bestimmen. Sie steuern aber die Monatszuordnung nach
  CALCULATION_RULES.md §10 — ein falscher Wert verschiebt still Zahlungen in falsche Monate.
  Die bessere Quelle liegt ohnehin im Haus: die eigene Zahlungshistorie.
- **Keine Performance-Kennzahl** (TWR/IRR). Dafür bräuchte es einzelne Transaktionen mit
  Datum und Betrag; die CSV nennt nur deren Anzahl.
- **Keine Standsverwaltung in der Oberfläche.** `security_snapshot_runs` trägt alles dafür
  Nötige; eine Liste zum Entfernen einzelner Stichtage fehlt noch.
