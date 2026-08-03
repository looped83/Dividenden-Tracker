# DivvyDiary — Datenabbildung, Kennungen und Datenhoheit (Phase B0)

**Stand:** 2026-08-03 · **Status:** Analyse, nichts davon ist umgesetzt

Ergänzt den [Discovery-Bericht](./divvydiary-api-discovery.md) um die
Feldebene. Die Verfügbarkeitsangaben tragen durchgehend eine Belegstärke:

| Kürzel | Bedeutung |
|---|---|
| **belegt** | in offenem, produktivem Fremdcode nachgelesen (Portfolio Performance) |
| **belegt (Eingabe)** | DivvyDiary **nimmt** das Feld entgegen — dass es zurückgeliefert wird, ist damit nicht gesagt |
| **unbekannt** | keine Quelle; weder bestätigt noch widerlegt |
| **berechenbar** | nicht von der Quelle nötig, aus vorhandenen Feldern ableitbar |
| **anderswo** | existiert bereits in der Anwendung, aus einer anderen Quelle |

**Kein Feld wird erfunden und keines aus ungeeigneten Daten abgeleitet.** Wo die
Quelle schweigt, bleibt die Oberfläche leer.

---

## 1. Feldmatrix Depot

| Gewünschtes Feld | Vorhanden | API-Feld | Datentyp | Optional | Zuverlässigkeit | Hinweise |
|---|---|---|---|---|---|---|
| externe Depot-ID | **belegt** | `portfolios[].id` | Ganzzahl | nein | hoch | einzige stabile Depotkennung; als `text` speichern (Zielarchitektur §2.1) |
| Depotname | **belegt** | `portfolios[].name` | Zeichenkette | nein | mittel | vom Nutzer vergeben und änderbar — Anzeige, kein Schlüssel |
| Depotwährung | unbekannt | — | — | — | — | ohne sie ist eine Gesamtsumme über gemischte Währungen nicht bildbar |
| Gesamtwert | unbekannt | — | — | — | — | ersatzweise aus Positionen summierbar, **falls** Marktwerte kommen |
| Einstandswert | unbekannt | — | — | — | — | wie oben |
| Gewinn/Verlust absolut | **berechenbar** | — | — | — | — | Gesamtwert − Einstand; als Berechnung kennzeichnen |
| Gewinn/Verlust prozentual | **berechenbar** | — | — | — | — | wie oben |
| erwartete Jahresdividende | unbekannt | — | — | — | — | ersatzweise aus `/symbols/{ISIN}` **berechenbar** — dann eigene Schätzung, klar so zu benennen |
| Ø Dividendenrendite | **berechenbar** | — | — | — | — | Jahresdividende ÷ Marktwert |
| Ø Yield on Cost | **berechenbar** | — | — | — | — | Jahresdividende ÷ Einstand |
| Anzahl Positionen | **berechenbar** | — | — | — | — | aus dem Cache |
| Zeitpunkt der Datenberechnung | unbekannt | — | — | — | — | ohne ihn ist unklar, wie alt Kurse sind |
| Zeitpunkt der letzten Aktualisierung | **anderswo** | — | — | — | hoch | eigener Lauf: `portfolio_syncs.finished_at` |

**Fazit Depot: zwei von dreizehn Feldern belegt.** Beide betreffen die
Identität, keines den Wert.

---

## 2. Feldmatrix Position

| Gewünschtes Feld | Vorhanden | API-Feld | Datentyp | Optional | Zuverlässigkeit | Hinweise |
|---|---|---|---|---|---|---|
| externe Positions-ID | unbekannt | — | — | — | — | ohne sie dient die ISIN als Upsert-Schlüssel |
| externe Wertpapier-ID | unbekannt | — | — | — | — | wäre die stabilste Zuordnung überhaupt |
| Name | **belegt** (`/symbols`) | `name` | Zeichenkette | nein | hoch | nur Anzeige — **nie** zur automatischen Zuordnung |
| ISIN | **belegt** (`/symbols`), **belegt (Eingabe)** | `isin` | 12 Zeichen | nein | hoch | **das Kernfeld** dieser Integration |
| WKN | **belegt** (`/symbols`) | `wkn` | 6 Zeichen | ja | mittel | nur deutschsprachiger Raum |
| Ticker | **belegt** (`/symbols`) | `symbol` | Zeichenkette | ja | mittel | ohne Börsensuffix; Portfolio Performance ergänzt es selbst aus dem MIC |
| Börse | **belegt** (`/symbols`) | `exchange` | 4 Zeichen (ISO-MIC) | ja | hoch | maschinenlesbar — brauchbar |
| Wertpapierart | unbekannt | — | — | — | — | Aktie/ETF/REIT lässt sich nicht raten |
| **Stückzahl** | **belegt (Eingabe)** | `quantity` | Zahl | nein | — | **entscheidend; lesend unbelegt** |
| Währung | **belegt** (`/symbols`) | `currency`, `dividendCurrency` | 3 Zeichen | ja | hoch | zwei getrennte Währungen — wichtig |
| Ø Einstandskurs | **belegt (Eingabe)** | `buyin.price` | Zahl | ja | — | lesend unbelegt |
| Einstandswert gesamt | unbekannt | — | — | — | — | **nicht** aus Kurs × Stück errechnen: Gebühren und Teilverkäufe |
| aktueller Kurs | unbekannt | — | — | — | — | — |
| Kurszeitpunkt | unbekannt | — | — | — | — | ein Kurs ohne Zeitpunkt ist nicht darstellbar |
| Marktwert | unbekannt | — | — | — | — | — |
| Gewinn/Verlust absolut | **berechenbar** | — | — | — | — | Marktwert − Einstand |
| prozentuale Performance | **berechenbar** | — | — | — | — | — |
| Depotgewicht | **berechenbar** | — | — | — | — | hängt von der Ansicht ab; nicht speichern |
| aktuelle Dividendenrendite | unbekannt / **berechenbar** | — | — | — | — | aus Jahresdividende und Marktwert |
| Yield on Cost | unbekannt / **berechenbar** | — | — | — | — | aus Jahresdividende und Einstand |
| erwartete Jahresdividende | unbekannt | — | — | — | — | aus `/symbols` **schätzbar** (Frequenz × letzte Zahlung) — dann als Schätzung kennzeichnen |
| erwartete Dividende je Anteil | **belegt** (`/symbols`) | `dividends[].amount` (historisch) | Zahl | nein | mittel | historisch belegt, künftig nicht |
| Sektor | unbekannt | — | — | — | — | in `securities.sector` bereits vorhanden |
| Branche | unbekannt | — | — | — | — | im eigenen Modell nicht vorgesehen |
| Land | unbekannt | — | — | — | — | in `securities.country` vorhanden |
| Region | unbekannt | — | — | — | — | wäre aus dem Land ableitbar — eigene Logik, keine Quellenangabe |
| Ausschüttungsfrequenz | **belegt** (`/symbols`) | `dividendFrequency` | Zeichenkette | ja | mittel | Wertebereich unbekannt |
| nächste Ausschüttung | **anderswo** | — | — | — | hoch | `dividend_calendar_events` |
| Ex-Dividenden-Datum | **belegt** (historisch) / **anderswo** | `dividends[].exDate` | ISO-Datum | nein | hoch | künftige Termine kommen aus dem Kalender |
| Zahltag | **belegt** (historisch) / **anderswo** | `dividends[].payDate` | ISO-Datum | nein | hoch | wie oben |
| Datenstatus (bestätigt/prognostiziert) | unbekannt | — | — | — | — | ohne dieses Feld darf keine Prognose als Tatsache erscheinen |

**Fazit Position: kein einziges Bestandsfeld ist lesend belegt.** Belegt sind
Wertpapierstammdaten und Dividendenhistorie — wertvoll, aber etwas anderes.

### 2.1 Zwei Beobachtungen mit Folgen für die Umsetzung

**Beträge sind Zeichenketten, keine Zahlen.** `dividends[].amount` kommt als
JSON-Zahl. In Portfolio Performance ist dokumentiert, dass dabei
Nachkommastellen verlorengehen können (Issue #4112). Für dieses Projekt heißt
das: Der Rohtext der Antwort wird gelesen, Beträge werden als kanonische
Dezimalzeichenkette weitergereicht, in `numeric` gespeichert und mit
`decimal.js` verrechnet — nie über `Number`/`parseFloat` (CALCULATION_RULES.md
§8, per ESLint erzwungen).

**Zwei Währungen je Wertpapier.** `currency` (Notierung) und `dividendCurrency`
(Ausschüttung) können auseinanderfallen — eine in USD zahlende Aktie, die in EUR
notiert. Beide Felder sind getrennt zu führen; eine Umrechnung findet nicht
statt.

---

## 3. Identifikatoren und Zuordnung

### 3.1 Bewertung der Kennungen

| # | Kennung | In DivvyDiary | Im eigenen Modell | Eindeutig | Bewertung |
|---|---|---|---|---|---|
| 1 | **ISIN** | belegt, Pflichtfeld beim Import | `securities.isin`, eindeutiger Teilindex je Nutzer | weltweit je Wertpapier | **erste Wahl** |
| 2 | **externe Wertpapier-ID** | unbekannt | müsste neu | wäre absolut | erste Wahl, **sobald** vorhanden |
| 3 | **WKN** | belegt | `securities.wkn`, **nicht** eindeutig indiziert | im dt. Raum | zweite Wahl |
| 4 | **Ticker + MIC** | belegt (`symbol`, `exchange`) | `securities.ticker`, kein MIC-Feld | nur zusammen | dritte Wahl, mit Vorsicht |
| 5 | **Name** | belegt | `securities.name`, eindeutig je Nutzer (kleingeschrieben) | nein | **nie automatisch** |

### 3.2 Empfohlene Reihenfolge

1. **Bestätigte Zuordnung** aus `external_security_mappings` — was der Nutzer
   einmal entschieden hat, gilt und wird nicht überschrieben.
2. **Exakte ISIN** gegen `securities.isin` (nicht archiviert). Genau ein
   Treffer → automatisch, `method = 'isin'`.
3. **Externe Wertpapier-ID**, sobald die API eine liefert.
4. **Exakte WKN**, aber **nur bei genau einem** nicht archivierten Treffer.
5. **Ticker + Börse**, nur bei genau einem Treffer, und nur als **Vorschlag** —
   nicht automatisch.
6. **Manuelle Zuordnung** durch den Nutzer.

**Ausgeschlossen: automatische Zuordnung über den Namen — auch nicht bei exakter
Übereinstimmung, auch nicht bei hoher Ähnlichkeit.** Der Importassistent hält
diese Linie bereits (`src/lib/import/matchCompany.ts`: Ähnlichkeit erzeugt einen
Hinweis, nie eine Zuordnung); eine zweite, laxere Regel für dieselbe Fachfrage
wäre ein Widerspruch im eigenen Haus.

Bleibt eine Position ohne Zuordnung, ist das **kein Fehler**: Sie wird
gespeichert, angezeigt und im Bereich „Zuordnung erforderlich" gesammelt.

### 3.3 Problematische Fälle

| Fall | Wirkung | Umgang |
|---|---|---|
| **Verschiedene Aktiengattungen** (Vorzug/Stamm) | eigene ISIN je Gattung | unkritisch — die ISIN trennt sauber |
| **ADR vs. Originalaktie** | verschiedene ISIN, sehr ähnlicher Name, andere Dividendenwährung | ISIN entscheidet; niemals über den Namen zusammenführen |
| **Mehrere Börsenlistings** | eine ISIN, mehrere MIC und Ticker | ISIN entscheidet; MIC nur als Zusatzangabe |
| **Gleicher Ticker an verschiedenen Börsen** | `BMW` ist nicht eindeutig | Ticker nur **zusammen** mit MIC, und nur als Vorschlag |
| **ETF-Namensvarianten** | „iShares Core MSCI World UCITS ETF USD (Acc)" in fünf Schreibweisen | ISIN entscheidet — hier zeigt sich, warum Namensabgleich untauglich ist |
| **Fusion** | zwei ISIN → eine | die alte Position verschwindet aus der Quelle → `is_active = false`; die neue erscheint als unzugeordnet. **Manuelle** Entscheidung |
| **Spin-off** | neue ISIN taucht auf | neue Position, unzugeordnet, manuell zu verknüpfen |
| **Umbenennung** | Name ändert sich, ISIN bleibt | unkritisch; der eigene `securities.name` bleibt führend |
| **Delisting** | Position verschwindet | `is_active = false`, nie gelöscht — die erhaltenen Dividenden bleiben unberührt |
| **Bruchstücke** | 0,3421 Stück | `numeric(20,8)`, niemals ganzzahlig runden |
| **Position mit 0 Stück** | Restzeile in der Quelle | speichern, als geschlossen darstellen, nicht in Summen zählen |
| **Geschlossene Position** | fehlt in der Antwort | deaktivieren, nicht löschen |
| **Verschiedene Währungen** | Summe nicht bildbar | nicht umrechnen; „verschiedene Währungen" ausweisen (wie in `CalendarSummary`) |
| **Dasselbe Papier in zwei Depots** | zwei Einstände | zwei Zeilen; Anzeige summiert sichtbar, das Modell nicht |
| **Archiviertes Unternehmen** | ISIN-Treffer auf eine archivierte Zeile | kein automatischer Treffer; als Vorschlag anbieten (der eindeutige Index gilt nur für nicht archivierte Zeilen) |

---

## 4. Datenhoheit und Source of Truth

### 4.1 Wer ist wofür führend

| Datenart | Führend | Warum |
|---|---|---|
| tatsächlich erhaltene Dividenden | **Supabase** | Kern der Anwendung; DivvyDiary kennt sie nicht in dieser Genauigkeit |
| Nettobeträge, Steuern, Gebühren | **Supabase** | steht in keiner externen Quelle |
| Buchungsdatum, manuelle Korrekturen | **Supabase** | Nutzerwissen |
| historische Auswertungen, Ziele, Notizen | **Supabase** | daraus abgeleitet |
| Unternehmen/Wertpapiere und ihre internen Kennungen | **Supabase** | alle Fremdschlüssel hängen daran |
| Depots (Broker-Konten) | **Supabase** | selbst gepflegt, mit Zahlungen verknüpft |
| **aktueller Bestand, Stückzahlen** | *DivvyDiary* | dort gepflegt bzw. vom Broker importiert |
| **externer Depotname, Depotwert** | *DivvyDiary* | Eigenschaft des externen Depots |
| **aktueller Kurs, Marktwert, Gewichtung** | *DivvyDiary* | Kursversorgung ist nicht Aufgabe dieser Anwendung |
| **erwartete Brutto-Jahresdividende, Renditen** | *DivvyDiary* | dort berechnet — **soweit geliefert** |
| Wertpapierstammdaten (Börse, Frequenz, Dividendenwährung) | *DivvyDiary* als **Ergänzung** | `securities` bleibt führend; Fremdangaben werden nie stillschweigend überschrieben |
| kommende Termine (Ex-Tag, Zahltag) | **bestehender Kalender-Feed** | bereits umgesetzt; keine zweite Logik |

Kursiv = extern; die Anwendung hält davon nur einen **Cache**, kein Eigentum.

### 4.2 Regeln bei Überschneidung

1. **Erhaltene Dividenden schlagen alles.** Kein externer Wert verändert,
   ergänzt oder ersetzt eine Zeile in `dividend_payments`. Der Bestand darf
   danebenstehen, nie darin.
2. **`securities` wird nie automatisch überschrieben.** Weicht die
   DivvyDiary-Angabe zu Sektor, Land oder Währung von der eigenen ab, ist das
   ein **Hinweis** in der Detailansicht, kein Schreibvorgang. Die Übernahme ist
   ein Klick des Nutzers.
3. **Termine kommen aus dem Kalender.** Liefert die Bestandsantwort ein
   Ex-Datum, wird es **nicht** gespeichert. Doppelte Kalenderlogik ist
   ausgeschlossen (Auftrag §9).
4. **Bei Widerspruch entscheidet die Herkunft der Frage**, nicht das jüngere
   Datum: Was der Nutzer erhalten hat, weiß Supabase; was heute im Depot liegt,
   weiß DivvyDiary. Ein Konflikt zwischen beiden ist meist gar keiner.
5. **Jede angezeigte Zahl nennt ihre Quelle und ihren Stand.** „Marktwert
   1.234,56 € · DivvyDiary, Stand 3. Aug. 2026, 08:12" — das ist der Unterschied
   zwischen einer nachvollziehbaren und einer beliebigen Zahl.

### 4.3 Was sich dadurch **nicht** ändert

Die bestehende Anwendung bleibt vollständig funktionsfähig, wenn DivvyDiary
ausfällt, der Schlüssel abläuft oder die Integration nie gebaut wird. Bestand
und Kurse sind **Zusatz**, keine Grundlage: Kein bestehendes Feature hängt an
ihnen, keine Statistik, kein Ziel, keine Auswertung. Das ist beabsichtigt — und
zugleich das stärkste Argument dafür, die Integration nur unter den Bedingungen
aus [§21 des Berichts](./divvydiary-api-discovery.md#21-empfehlung-conditional-go)
zu bauen.
