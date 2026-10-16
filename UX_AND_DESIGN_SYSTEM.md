# UX_AND_DESIGN_SYSTEM.md — Dividend Tracker

Stand: 2026-10-15 · Status: Verbindliches UX- und Designsystem (Planungsphase)

Designhaltung: **modern, hochwertig, ruhig, vertrauenswürdig, datenorientiert, klar.**
Nicht verspielt, kein generisches Admin-Dashboard. Die App soll sich anfühlen wie ein
präzises Finanzjournal: viel Weißraum, starke Typografie für Zahlen, wenige, bedeutungsvolle
Farben.

Vermieden werden ausdrücklich: übermäßige Farbverläufe, unnötige Animationen, dekorativer
Glassmorphism, niedrige Kontraste, zu viele gleichwertige Kennzahlen, unübersichtliche
Diagramme, reine Desktop-Layouts auf dem iPhone.

---

## 1. Design-Tokens

Umsetzung als CSS-Variablen (Tailwind-4-`@theme`), Hell- und Dunkelmodus über
`prefers-color-scheme` + manueller Umschalter (Einstellung `theme`).

### Farben (semantisch, keine dekorativen Paletten)

| Token | Verwendung | Hell | Dunkel |
|---|---|---|---|
| `--background` | Seitenfläche | Weiß | reines Schwarz (`#000000`, OLED) |
| `--card` / `--muted` | erhobene Flächen | Weiß / sehr helles Grau | gestuft über Schwarz (`#121417` / `#1e1f22`) |
| `--input` | Rahmen von Bedienelementen | Grau ≥ 3:1 gegen jede Nachbarfläche | dito, heller gesetzt |
| `--foreground` | Text | fast Schwarz | helles Grau |
| `--muted-foreground` | Sekundärtext, Labels | Grau ≥ 4,5:1 Kontrast | dito |
| `--primary` | Aktionen: Erfassen, Schaltflächen, Links | leuchtendes Orange `#c84f00` (4,6:1 auf Weiß) | gesättigtes Orange `#fd7920`, dunkle Schrift darauf (7,1:1) |
| `--accent` | Hover, aktive Navigation (mit halbfetter Schrift) | neutrales Hellgrau | neutrale Stufe über der Karte |
| `--positive` | Zuwächse, Dividenden | gedecktes Grün | angepasst, Kontrast AA |
| `--negative` | Korrekturen, Rückgänge, Fehler | gedecktes Rot | angepasst |
| `--warning` | Warnungen, mögliche Duplikate | Gelb (seit 1.11.0, zuvor Bernstein — zu nah am Orange) | angepasst |

Regeln: Bedeutung nie durch Farbe allein (immer Text/Symbol dazu, z. B. Vorzeichen);
alle Text-/Hintergrund-Paare ≥ WCAG AA (4,5:1; große Zahlen 3:1).

**Schwarz für Daten, Orange für Aktionen, Grün/Rot für Veränderung** (seit 1.7.0; Orange seit
1.11.0, zuvor Blau). Die Neutraltöne tragen keinen Blaustich mehr (Chroma ≤ 0,006). Orange
steht nur dort, wo etwas passiert — der aktive Navigationspunkt ist ein Ort und wird über
Vordergrundfarbe und Gewicht markiert, nicht über die Akzentfarbe. Die Warnfarbe ist deshalb
Gelb statt Bernstein: Neben dem Orange sähe „Storniert" sonst wie eine Aktion aus. Einzige Ausnahme
von „Orange heißt Aktion": das Diagramm der Übersicht — die Linie des aktuellen Zeitraums ist
die Hauptaussage der Seite und trägt die Markenfarbe, das Vorjahr bleibt grau. Gemessen hell: Vordergrund 18,1:1 auf der Seite,
Sekundärtext 6,0:1 auf der Seite und 5,1:1 auf dem Akzent, `--input` ≥ 3,1:1 gegen jede
Nachbarfläche.

#### 1a Diagrammfarben

Eine kategoriale Palette gibt es nicht mehr (seit 1.18.0 entfernt): Kein Diagramm zeigt mehr
als zwei Reihen. Braucht eines künftig mehr, wird zusammengefasst („Sonstige") oder in
kleine Einzeldiagramme aufgeteilt, bevor eine Palette zurückkommt.

**Ein- und Zweireihendiagramme sind monochrom** (Kopf der Übersicht seit 1.7.0, alle
übrigen seit 1.9.0): eine Reihe in Vordergrundfarbe; zwei Reihen (aktuell ↔ Referenz)
als Vordergrundfarbe gegen `--series-prior` (neutrales Grau, 3,6:1 hell / 3,5:1 dunkel
gegen die Seite), die Referenz zusätzlich gestrichelt und benannt (Legende). Farbe meint
damit auf jeder Seite nur Veränderung; der Helligkeitsabstand trennt stärker als zwei
Farbtöne gleicher Helligkeit. Dasselbe gilt für Rangbalken, Anteilsbalken, Zielbalken und
die Tönung der Matrix Jahre × Monate (Vordergrundfarbe mit höchstens 22 % Deckkraft).
Ausnahme seit 1.11.0/1.12.0: Zeitverläufe des aktuellen Zeitraums — Kopf der Übersicht,
Statistik › Verlauf (Balken) und der kumulierte Vergleich (Linie) — stehen in der
Akzentfarbe Orange; Ranglisten und Anteile bleiben in Vordergrundfarbe.

Die Statusfarben (`--positive`, `--negative`, `--warning`) sind reserviert und werden nie
als Serienfarbe benutzt — auch dann nicht, wenn ein Farbton ähnlich aussieht.

### Typografie

- UI-Schrift: Systemstack (`-apple-system, "SF Pro", Inter, sans-serif`) — nativ auf
  Apple-Geräten, keine externen Fonts (CSP).
- **Beträge immer in Tabellenziffern** (`font-variant-numeric: tabular-nums`), rechtsbündig
  in Tabellen; Minuswerte mit echtem Minuszeichen und `--negative`.
- **Jede angezeigte Zahl in deutscher Schreibweise mit Tausenderpunkt** (1.439 Dividenden,
  1.234,56 €) — Beträge und Prozentwerte über `formatMoney`/`formatPercent`, Anzahlen,
  Seiten- und Zeilenangaben über `formatCountNumber`/`formatCountNoun`
  (`lib/utils/formatNumber.ts`). Ausgenommen sind Jahreszahlen (2026, nicht 2.026).
- Skala: 12/13 (Meta) · 14/15 (Body/Tabellen) · 16 (Formulare mobil, verhindert iOS-Zoom) ·
  19 (Abschnittstitel) · 40, im Kopf der Übersicht ab `sm` 52 (Kennzahlwerte). Zeilenhöhe 1,5 für Fließtext.
- **Formularfelder unterhalb `sm` zwingend 16 px** (`text-base sm:text-sm` in `Input`,
  `Select`, `Textarea`, `Combobox`). iOS Safari zoomt die Seite, sobald ein Feld mit
  kleinerer Schrift den Fokus bekommt — und nach dem Zoom lässt sie sich seitlich
  verschieben. Der Pinch-Zoom bleibt dabei ausdrücklich erlaubt (kein `user-scalable=no`,
  kein `maximum-scale`): Wer Text vergrößern muss, darf das (WCAG 1.4.4). Gesichert durch
  `tests/e2e/mobile.spec.ts`.

### Abstände, Radien, Tiefe

- 4-px-Raster (4/8/12/16/24/32/48); Seitenränder: 24 px Desktop, 16 px iPhone.
- Karten tragen denselben Rand wie die Seite: 16 px unter `sm`, 24 px darüber; Kopf zu
  Inhalt 12 px bzw. 20 px. Der Wert steht in `components/ui/card.tsx`, nicht an der
  Aufrufstelle — wer ihn dort überschreibt, muss die `sm:`-Stufe mitsetzen.
- Seitenrhythmus: `space-y-6` zwischen Kopfzeile und Inhalt (auch im Ladegerüst, sonst
  springt der Inhalt); Raster `gap-3 sm:gap-4`.
- 44-px-Bedienelemente an einer Kante bekommen den negativen Rand ihres eigenen
  Innenabstands (`-mr-3` bei `size="sm"`, `-my-2` bei `size="icon"`): Sonst misst die
  Zeile mehr als der Text daneben und die Kachel wirkt unten schwerer als oben.
- Dasselbe in der **Kopfzeile einer Karte**: Die Höhe bestimmt die Überschrift, nicht das
  Bedienelement daneben — `-my-2` bei `size="sm"` (36 px), `sm:-my-3` bei einem Feld mit
  44 px. Ohne das saß die Überschrift einer Karte mit Schaltfläche 10 px tiefer als die der
  Karte daneben, mit Suchfeld 14 px.
- Radius 6 px für Eingabefelder, 16 px für Karten und gedämpfte Flächen, **Pillen für alle
  Schaltflächen** (seit 1.9.0), für Umschalter, Abzeichen und für Auswahlfelder in
  Filterleisten, Seiten- und Abschnittsköpfen (dieselbe Form wie die Jahresauswahl der
  Übersicht). Schatten nur eine dezente Stufe für schwebende
  Elemente (Dialoge, Popover) — Karten trennen sich per Haarlinie, nicht per Schatten.
- Animationen: nur funktionale Übergänge ≤ 200 ms (Panel auf/zu, Fokus); Diagramme ohne
  Intro-Animation — für alle, nicht nur bei `prefers-reduced-motion` (`CHART_SERIES_PROPS` in
  `chartTheme.ts`): Die Reihen wuchsen rund 1,5 s aus der Nulllinie, so lange stand ein leeres
  Diagramm auf der Seite. `prefers-reduced-motion` schaltet die übrigen Übergänge ab.

## 2. Komponentenbibliothek (shadcn/ui-Basis)

Verwendete Basiskomponenten (`components/ui`): Button, Input, Textarea, Select, Checkbox,
Label, Combobox, Dialog, Disclosure, Table, Badge, Card, Toast, Skeleton, Alert. Formulare
binden React Hook Form direkt an, ohne eigene Form-Hülle.

Die **Combobox** klappt ihre Vorschlagsliste nur auf ausdrückliche Absicht auf: Antippen,
Tippen, Pfeil-nach-unten. Der bloße Fokus genügt nicht — als erstes Feld eines Formulars
verdeckte die Liste sonst alles darunter, sobald der Fokus sie streifte, und beim Durchgehen
mit der Tabulatortaste ging sie ungefragt auf.

Eigene zusammengesetzte Komponenten (fachlich):

| Komponente | Zweck |
|---|---|
| `AmountText` | Betragsdarstellung: tabular-nums, Währung, Vorzeichen, Farbe (semantisch), niemals Rundung in der Komponente |
| `KpiHero` / `TrendPill` | **Ein** Kennzahlkopf für alle Bereiche (`components/domain/KpiHero.tsx`): **eine** Hauptzahl groß (32 px), daneben optional der Vergleich als Marke (`TrendPill`: Pfeil **und** Vorzeichen, Bedeutung im `title` und für Sprachausgaben), darunter eine Unterzeile, optional ein Zusatz (Zielbalken) und eine Leiste mit bis zu drei Nebenkennzahlen (`KpiStats`, auch einzeln im Kopf der Übersicht). Er ersetzt das frühere Raster gleich großer Kacheln (`StatCard`/`StatGrid`): Vier bis sechs Kacheln kosteten auf dem Telefon 300–700 px, bevor der Inhalt begann, und ließen offen, welche Zahl zählt. Jede Seite beantwortet zuerst **ihre** Frage — Übersicht: Dividenden des Zeitraums; Kalender: nächste 30 Tage; Depot: Depotwert; Statistik: Gesamtsumme; Vergleich: Veränderung; Entwicklung: erwartet p. a.; Assetseite: erhalten insgesamt. Ein Drill-down macht die **ganze Fläche** zur Tippfläche (Link auf dem Wert, per `::after` gedehnt; für die Hauptzahl der obere Teil, für jede Nebenkennzahl ihr Feld) und trägt einen sprechenden Namen (`drillLabel`). Ab 48rem eigener Breite (Container Query, nicht Fensterbreite) stehen Hauptzahl links und Leiste rechts nebeneinander (5:7), darunter untereinander. Ladegerüst in derselben Form: `KpiHeroSkeleton` |
| `ListGroup` / `ListRow` / `ListItemBody` / `ListSection` | **Eine Listenform** für Einträge (`components/ui/list.tsx`): Zeilen mit Trennlinien statt einzelner Karten, seit 1.9.0 überall ohne Rahmen (die frühere Fassung `inset` ist die einzige). Zeile 1 der Name (seit 1.11.0 **eine** Zeile, lange Namen laufen am Ende aus — `truncate-fade`; Abzeichen wie „Storniert" stehen deshalb in Zeile 2), Zeile 2 Angaben links und Wert rechts; `asChild` macht die ganze Zeile zur Tippfläche. `ListSection` gruppiert (Monat) mit Kennzahl im Kopf **Datenlisten ohne Pfeil am Rand und ohne Kalendersymbol vor dem Datum** (Dividenden, Termine, Assets, Statistik, Datenqualität): Beide standen in jeder Zeile, sagten nichts, was Tippfläche und Inhalt nicht schon sagen, und nahmen dem Depot die Breite („Trade Repub…"). `chevron` bleibt einzelnen Navigationszeilen („Gesamt seit März 2019") vorbehalten |
| `Section` / `SectionLink` | Abschnitt **ohne Kartenrahmen** (`components/ui/section.tsx`, seit 1.7.0): Überschrift 19 px, rechts höchstens eine Aktion — ein Textlink in der Akzentfarbe mit Pfeil (`SectionLink`, „Alle", „Kalender") oder ein Umschalter —, darunter optional eine Zeile Beschreibung. Abschnitte trennen sich durch Abstand (40 px, ab `lg` 48 px) und Überschrift, nicht durch Rahmen. **Wann Abschnitt, wann Karte:** Lese-Seiten gliedern mit Abschnitten (Übersicht, Statistik, Depot-Entwicklung, Assetseite, Ergebnisse des Zeitraumvergleichs). Seit 1.9.0 gliedern auch Einstellungen, Zeitraumvergleich und Detailseiten mit Abschnitten; Karten mit Rahmen bleiben Formularen in Dialogen, dem Import-Assistenten und den Dubletten-Paaren vorbehalten, gleichartige Kacheln (Ziele, „Mehr") stehen auf gedämpfter Fläche (siehe „Eine Linie für alle Seiten") |
| `PaymentListItem` | Eine Dividende als Zeile — dieselbe in Dividendenliste, Übersicht und Assetseite und seit 1.11.0 in der Form eines Kalendertermins: links das Datumsfeld (`ListDateTile`, Tag und Monat), daneben Name, darunter Wochentag · Depot und rechts der Betrag (Depot wird gekürzt, nie umbrochen). Ohne Monatsgruppen steht statt des Wochentags das Jahr; Sprachausgaben hören das vollständige Datum. Auf der Assetseite ist das Depot der Titel |
| Dividendenliste | Tabelle ab `md` (Aktionen je Zeile) bzw. `PaymentListItem`-Liste auf dem Telefon, nach Datum sortiert nach Monat gruppiert mit Monatssumme im Kopf; darüber Anzahl und Summe der Auswahl; „weitere laden" statt Blättern (die geladene Menge steht in der Adresse, der Weg zurück findet sie wieder) |
| `DetailHeader` | **Ein** Kopf für Dividende, Asset und Ziel: Rückweg links und Symbolaktionen rechts in einer Zeile, darunter Titel samt Zustand (nur der Sonderfall), Zusatzzeile und — wo es eine gibt — die Kennzahl (Betrag der Dividende). Bearbeiten, Stornieren/Archivieren, Löschen stehen hier und nicht in den Listen: Eine Zeile ist **eine** Tippfläche |
| `SegmentedControl` | Umschalter zwischen wenigen Zuständen (Erscheinungsbild, Kalenderansicht, Verlauf nach Jahren/Monaten) — immer Symbol **und** Text, als Optionsgruppe (`radiogroup`); auf dem Telefon in voller Breite. `variant="pill"` ist die leise Fassung für Abschnittsköpfe (Diagrammsicht, Assets/Depots): gedämpfte Fläche, 32 px hoch, Tippfläche per Pseudo-Element 44 px |
| `StatTable` | Statistiktabelle ab `md`; auf dem Telefon eine Liste (Name und Kennzahl oben, weitere Spalten beschriftet darunter, Sortierung als `FilterSort`). Nebenkennzahlen (`listHidden`) entfallen dort Ranglisten (Unternehmen, Depotkonten, Entwicklung je Asset) nutzen auf dem Telefon die **kompakte Zeile** (`listSummary`): Name und Kennzahl, optional ein Anteilsbalken mit Prozent am Ende, darunter **eine** Zusatzzeile („31 Dividenden · Ø 56,29 € · erw. 315,58 € p. a."). Der Name bleibt dort einzeilig, damit die Balken eine Treppe bilden; die Rangbalken-Karte darüber entfällt auf dem Telefon, ab `md` bleibt sie neben der Tabelle |
| `FilterBar` / `FilterField` / `FilterSort` / `FilterReset` | **Eine** Filterleiste für alle Bereiche (Dividenden, Depot, Statistik) — dieselben Bausteine, dieselben Abstände. Ab `sm` dauerhaft sichtbar, darunter eine aufklappbare Zeile mit der Zahl wirkender Filter. Regeln unten |
| `ComparisonBreakdown` | Gegenüberstellung Zeile für Zeile (Monate oder Unternehmen): ab `md` eine Tabelle mit vier Spalten, darunter eine Liste — je Zeile Name und Differenz, darunter beide Zeiträume. Vier Spalten passen bei 390 px nicht nebeneinander, und die Seite soll auf dem Telefon nicht seitlich verschiebbar sein |
| `EntitySelect` | **Die** Auswahlliste für Unternehmen und Depots — überall dieselbe: neutrale Auswahl („Alle Unternehmen"), darunter die Gruppen „Aktiv" und „Archiviert" (leere Gruppe entfällt), sortiert nach deutschem Alphabet. Archivierte bleiben wählbar, stehen aber nicht zwischen den aktiven. Neue Unternehmens-/Depotauswahlen in Filterleisten verwenden ausschließlich diese Komponente |
| `ImportWizard` | Schrittleiste, Rohdatenvorschau (Monospace-Grid), Mapping-Zeilen, Bilanzanzeige |
| `AuditTrail` | Änderungsverlauf als vertikale Liste: Zeitpunkt, Aktion, Feld-Diffs (alt → neu) |
| `EmptyState` | Illustration­sfrei: Icon, ein Satz, primäre Aktion („Erste Dividende erfassen", „Datei importieren") |
| `ConfirmDialog` / `ConfirmSummary` | **Ein** Bestätigungsdialog für Folgenreiches (Stornieren, Löschen; `components/ui/confirm-dialog.tsx`): Titel als Frage („Dividende stornieren?"), betroffene Daten auf gedämpfter Fläche, ein Satz zur Wirkung, optional Eingaben (Grund), dann „Abbrechen" und die benannte Aktion — nie ein generisches „OK" |
| `GoalProgress` | Zielfortschritt: Balken, „X von Y (Z %)", Kappung 100 % visuell |
| `ToastProvider` / `useToast` | Kurze Rückmeldung nach abgeschlossenen Aktionen (Speichern, Storno, Reaktivieren): `role="status"`, `aria-live="polite"`, 4 s sichtbar, von Hand schließbar, über der Bottom-Navigation. Nur Bestätigungen und beiläufige Fehler — alles Entscheidungspflichtige bleibt Dialog oder Feldfehler. **Sichtbar gestaltet (seit 1.13.0):** vollflächig grüne (bzw. bei Fehlern rote) Pille, so breit wie der Text, mit Symbol passend zum Ton (Haken bzw. Ausrufezeichen), kräftigem Schatten und kurzem Einblenden von unten (`motion-safe`, 200 ms). Kein Rahmen, kein Farbstreifen: In Kachel-Optik ging der Toast zwischen den Karten der Seite unter. Eine Rückmeldung, die man übersieht, ist keine — und ein Haken an einer Fehlermeldung ist eine falsche. **Deckend:** Der Toast schwebt über scrollendem Inhalt; ein Alpha-Tint ließ Tabellenzeilen und Diagramme durchscheinen. Inhalt mittig in der Zeile, damit der Text nicht über der 44-px-Schließen-Fläche klebt |

### Eine Linie für alle Seiten (seit 1.9.0)

Die Übersicht hat die Form vorgegeben; alle übrigen Seiten folgen ihr, damit keine Seite
anders gebaut wirkt als die nächste:

- **Abschnitte statt Karten.** Auch Einstellungen, Depotkonten, Import, Datensicherung,
  Dividenden- und Zieldetail gliedern mit `Section` (40 px Abstand, ab `lg` zwei Spalten wo
  es passt). Aktionen im Abschnittskopf sind Textaktionen in der Akzentfarbe — `SectionLink`
  zum Weitergehen, `SectionButton` zum Anlegen oder Aufklappen („Neues Depot",
  „Anzeigen"); eine gefüllte Schaltfläche je Abschnitt war lauter als die Überschrift.
- **Gedämpfte Flächen statt Rahmen** für Kennzahlen und gleichartige Kacheln:
  Zielkarten, Kacheln unter „Mehr", Kennzahlen der Position und der Datenqualität. Karten
  mit Rahmen bleiben für Formulare in Dialogen, den Import-Assistenten und die
  Dubletten-Paare.
- **Listen und Tabellen ohne Rahmen** (`ListGroup`, `Table`, `StatTable`, Ladegerüste):
  Haarlinien zwischen den Zeilen, erste und letzte Spalte bündig mit der Überschrift,
  Spaltenköpfe in gewöhnlicher Schreibung. Die Dividendentabelle gruppiert nach Datum
  sortiert wie die Liste nach Monat (Monatssumme in der Betragsspalte); Zeilenaktionen
  sind Symbole ohne Rahmen.
- **Reiter** (`TabNav`) markieren den aktiven Eintrag mit einer Linie in
  Vordergrundfarbe und halbfett — ein Ort, keine Aktion.
- **Umschalter** (`SegmentedControl`) haben in beiden Fassungen die Pillenform der
  Übersicht; im Dunkeln liegt die gewählte Pille auf der Akzentstufe.
- **Auswahl steht rechts im Kopf dessen, was sie steuert** — wie das Jahr auf der
  Übersicht. Ausnahme (seit 1.19.0): „Kumuliert | Monatlich" steht oben links im
  Diagramm selbst, wo die Ecke sonst leer bliebe; das Diagramm hält den Streifen frei. Seitenweit im Seitenkopf: Jahr (Übersicht), Darstellung
  Liste | Monat (Kalender), auf dem Telefon die Pille „Filter" (Dividenden, Statistik).
  Für einen Abschnitt in dessen Kopf: Jahre | Monate (Verlauf), Assets | Depots
  (Verteilung in Übersicht und Aufteilung), „Filter" der Assetliste im Depot. Ab `sm`
  stehen die Filterfelder als Zeile direkt darunter. Keine Umschalter als eigene Zeile
  über einem Abschnitt, keine Umschalter über die volle Breite. Sortierung über einer
  Liste auf dem Telefon steht rechts in Inhaltsbreite. Der Zeitraumvergleich ist eine
  Pillenzeile, die sich als Satz liest („Jahr gegen Jahr · 2026 · gegen 2025").
- **Gruppenüberschriften sind Abschnittsüberschriften** (`ListSection` = `Section`):
  Monate der Dividenden und des Kalenders stehen in 19 px, die Summe
  gedämpft rechts, 40 px zwischen den Gruppen. Am Desktop gruppiert die
  Dividendentabelle ebenso; ihre Spaltenköpfe sind nur für Hilfsmittel da.
- **Seitenkopf-Aktionen** sind Umriss-Pillen (Ziel anlegen, Datenqualität) in der Form der
  Jahresauswahl. Im Depot trägt der Kopf seit 1.11.0 den Filter des Reiters (Assets: Schalter,
  Entwicklung: Assetauswahl, `DepotHeaderActions`); „Neues Asset" steht neben der Überschrift
  der Assetliste; gefüllt ist allein das Erfassen der Navigation. Der
  Kalender heißt im Kopf „Kalender" wie in der Navigation; „Aktualisieren" steht in der
  Zeile mit dem Stand des Abgleichs.
- **Erfassen** steht nur in der Navigation, nicht zusätzlich im Kopf der Dividendenliste.
- **Detailkopf**: Der Betrag einer Dividende steht in der Größe der Hauptzahl (40 px).

### Filterleisten — verbindliche Regeln

Sie stehen auf drei Seiten nebeneinander im Gedächtnis; unterschiedliche Feldbreiten oder
ein anderer Platz fürs Zurücksetzen fallen beim Wechsel sofort auf.

- **Reihenfolge:** Filter → Sortierung → Zurücksetzen. Die Sortierung ist immer das letzte
  Feld, das Zurücksetzen immer das letzte Element und an der rechten Kante (`ml-auto`) —
  auch wenn es in eine zweite Zeile rutscht.
- **Breiten:** alle Felder einer Leiste gleich breit (`basis-40`, wachsend, höchstens
  18 rem). Das Sortierfeld ist genau um den Richtungsschalter breiter (`basis-53`,
  `max-w-85`), damit seine Auswahl so breit ist wie die Felder daneben.
- **Abstände:** 0,75 rem zwischen den Feldern, 0,5 rem zwischen Auswahl und
  Richtungsschalter (die beiden sind ein Bedienelement), 1 rem Innenabstand der Leiste.
  Jede Zeile endet bündig an der rechten Kante — ein Feld in Inhaltsbreite ließ dort früher
  rund 30 px offen.
- **Höhe:** alles 44 px (`h-11`), auch das Zurücksetzen — die Zeile darf keine zweite Höhe
  kennen.
- **Form:** ohne Rahmen um die Leiste, Felder und Schaltflächen als Pillen (seit 1.9.0).
  Auf dem Telefon ist die eingeklappte Leiste eine Pille „Filter" mit der Zahl wirkender
  Filter rechts im Kopf (`FilterToggle`, `useFilterDisclosure`); die Felder klappen
  darunter auf. Eine Leiste mit nur einem Feld (Entwicklung) braucht keinen Schalter.
- **Beschriftungen:** unsichtbar, aber vorhanden (`sr-only`). Jedes Feld benennt sich über
  seinen neutralen Wert selbst („Alle Jahre", „Alle Depots"); Sortieroptionen beginnen mit
  „Nach …" und nennen den Begriff, den die Seite selbst verwendet — kurz und ohne
  technische Zusätze („Nach Depot", nicht „Nach Standard-Depot").
- **Auf dem Telefon** steht ein Bedienelement je Zeile, in voller Breite — auch das
  Zurücksetzen.
- **Status ist ein Filter.** „Stornierte" (Dividenden) und „Archivierte" (Assets) stehen als
  Auswahl in der Leiste („Ohne Stornierte" / „Mit Stornierten" / „Nur Stornierte"), vor der
  Sortierung — nicht mehr als Kontrollkästchen am Seitenende unter der ganzen Liste.

## 3. Diagramm-Richtlinien

- Balken für Monats-/Jahresreihen (diskrete Zeiträume), Linie für rollierende 12-Monats-Reihen
  und laufende Jahressummen (Kopf der Übersicht); Aufteilungen als Rang- bzw. Anteilsbalken, kein Donut.
- Ein Diagramm beantwortet eine Frage; keine Doppelachsen, keine 3D, kein Dekor.
- Tooltip mit exakten Werten (`AmountText`); X-Achsen-Labels de-DE („Jan", „Feb", …).
- Vorjahresvergleich als gepaarte Balken oder dezente Vorjahr-Schattenbalken.
- Legende immer als `ChartLegend` **unter** dem Diagramm, mittig: eine Marke je Reihe
  (Vergleichsreihe gestrichelt) plus Beschriftung. Nicht die Legende von Recharts — die sitzt
  in der Zeichenfläche, nimmt ihr Platz weg und bringt die Schrift des SVG statt der der
  Anwendung mit. Farbe trägt die Unterscheidung nie allein (WCAG 1.4.1).
- Jede Grafik: Umschalter zur Datentabelle + textuelle Zusammenfassung (Screenreader). Die
  Datentabelle ist die **gewöhnliche** Tabelle der Anwendung (`components/ui/table`) — seit
  1.9.0 ohne Rahmen und graue Kopfzeile, sonst wie beschrieben —
  graue Kopfzeile, `px-4 py-3` je Zelle. Ein eigenes, engeres Muster ließ dieselbe Sache zwei
  Bildschirme weiter anders aussehen.
- **Ein Stil für alle Diagramme.** Achsen, Raster, Tooltip-Kasten, Höhe, Leerzustand und die
  aufklappbare Datentabelle kommen aus `components/charts/chart.tsx` bzw. `chartTheme.ts`.
  Recharts liest die Typen seiner Kinder — die gemeinsamen Achseneinstellungen sind deshalb
  Objekte zum Ausbreiten (`{...CHART_Y_AXIS_PROPS}`), keine Wrapper-Komponenten.
- Y-Achse ohne Währungszeichen, mit Tausenderpunkt, kompakt erst ab einer Million
  („1,5 Mio."). Mit „€" an jedem Strich wurde die Beschriftung breiter als ihre Spalte und
  brach zweizeilig um; die Währung nennen Titel, Tooltip und Datentabelle.

## 4. Layouts je Gerät

### Mac / großer Desktop (≥ 1024 px)

- Dauerhafte Sidebar (240 px) mit den sieben Bereichen; Inhalt max. 1200 px zentriert.
- Zeilenklick öffnet die Detailseite; „Neue Dividende" erscheint als Overlay über der
  aktuellen Seite.
- Sichtbare Filterleiste; Tastaturkürzel gibt es nicht.

### iPad (768–1024 px)

- Adaptive Sidebar: einklappbar auf Icon-Leiste (Querformat), als Overlay (Hochformat).
- Touch-optimierte Tabellen: 44-pt-Zeilenhöhe, horizontale Priorisierung (wichtige Spalten
  fix, weitere per Scroll); Detailansicht als Sheet.
- Vollständige Verwaltung möglich (Import, Bearbeitung, Backup) — keine abgespeckte Version;
  Dateiimport über Dateien-App; beide Orientierungen vollwertig.

### iPhone (< 768 px)

- Bottom Navigation (5 Slots): Übersicht · Dividenden · **＋ Erfassen** (zentral, als einziger
  gefüllter Kreis in Orange) · Statistiken · Mehr (Kalender, Depot, Ziele, Einstellungen).
  Erfassen sitzt in der Leiste statt darüber — der herausragende Knopf verdeckte beim Scrollen
  Inhalt. Die Leiste ist fast deckend (95 %, ohne Weichzeichner — der kostete auf iOS bei jedem Scrollbild Rechenzeit); aktiv ist ein Eintrag in Vordergrundfarbe und
  halbfett.
- Listen statt breiter Tabellen: je Dividende eine Zeile (`PaymentListItem`), nach Monat
  gruppiert mit Monatssumme; „weitere laden" statt Blättern. Tabellen der Statistik werden zu
  Listen (`StatTable`), die Matrix Jahre × Monate steht gedreht (Monate als Zeilen).
- Dialoge mittig mit 16 px Rand (seit 1.14.0, zuvor Sheet am unteren Rand): Eine aufgehende
  Tastatur verschiebt so nichts. Aktionen in voller Breite in einer Fußzeile, die beim
  Scrollen stehen bleibt; Schließen mit 44-px-Fläche.
- Unterbereiche hinter „Mehr" (Kalender, Depot, Ziele, Einstellungen) markieren „Mehr" in der
  Bottom-Navigation.
- Schnelle manuelle Erfassung: Formular als Overlay über der aktuellen Seite (auch Bearbeiten),
  sinnvolle Defaults (heutiges Datum; Depot ergibt sich aus dem Asset und wird nur bei
  Mehrdeutigkeit abgefragt), Asset-Suche ohne Tastaturvorschläge, nach der Wahl direkt zum
  Betrag mit numerischer Tastatur (`inputmode="decimal"`). Beim Bearbeiten wird kein Feld
  fokussiert oder markiert.
- Kompakte Statistiken: Kennzahlkopf (`KpiHero`), Diagramme volle Breite, vier Reiter
  (Übersicht, Verlauf, Vergleich, Aufteilung) — mehr passen bei 390 px nicht nebeneinander.
  „Aufteilung" fasst Unternehmen und Depotkonten zusammen (Umschalter auf der Seite, beide
  behalten ihre Adresse).
- Progressive Offenlegung komplexer Filter (FilterBar-Sheet); keine Hover-Abhängigkeiten
  (alle Aktionen tapbar, Kontextmenüs als Long-Press mit sichtbarer Alternative).
- Touch-Ziele ≥ 44×44 pt; Safe Areas (`env(safe-area-inset-*)`) für Notch/Home-Indicator;
  Hoch- und Querformat; Import möglich (Dateien-App), aber als sekundärer Fluss.

## 5. Zustände und Muster

| Zustand | Muster |
|---|---|
| Leer (neues Konto) | Onboarding-EmptyState: „Dividende erfassen" oder „Aus Numbers importieren" (Verweis Migration) |
| Laden | Skeletons in Karten-/Tabellenform; keine Spinner-Vollflächen und **keine Textzeile „Wird geladen …"**. Bausteine: `Skeleton` (Fläche, schaltet bei `prefers-reduced-motion` das Pulsieren ab), `SkeletonRows` (Listen und Tabellen), `PageSkeleton` (ganze Seite). Auch der Bereichswechsel: `PageSkeleton` statt einer Textzeile, Kopfzeilenhöhe vorweggenommen, damit nichts springt. Beim Reiterwechsel bleiben Kopfzeile und Reiter stehen (`header={false}`). Vor dem ersten Render von React zeigt `index.html` ein Startbild (Marke und Name, nur Inline-CSS): Ohne es blieb die Seite auf einem langsamen Telefon gut 4 s leer, mit ihm erscheint nach knapp 2 s etwas. Navigationspunkte laden ihren Bereich schon beim Zeigen vor, sodass der Zustand meist gar nicht erscheint (ARCHITECTURE.md §6.1) |
| Fehler | `Alert` mit Ursache + Aktion („Erneut versuchen"); Formularfehler feldnah + Zusammenfassung oben |
| Offline | Persistenter, dezenter Banner; Schreibaktionen deaktiviert mit Begründung |
| Warnung (Duplikate, Invariante) | `Alert` in Gelb, niemals blockierend ohne Erklärung, immer mit Detail-Link |
| Destruktiv-nahe Aktionen (Storno, Rollback, Voll-Restore) | Dialog mit Konsequenzbeschreibung in Zahlen („1.219 Dividenden werden archiviert"), über `ConfirmDialog` + explizite Bestätigung; bei Rollback/Restore zusätzlich Texteingabe „RÜCKGÄNGIG" ab > 100 betroffenen Datensätzen |
| Erfolg | Toast mit Kernzahl („Import abgeschlossen: 1.219 Dividenden") + Link zum Bericht |

## 6. Formulare

- React Hook Form + Zod; Validierung beim Verlassen des Feldes, Fehlertexte konkret
  („Datum liegt in der Zukunft"), keine reinen Farbmarkierungen.
- Beträge: Texteingabe mit `inputmode="decimal"`, akzeptiert Komma und Punkt
  (CALCULATION_RULES.md §7), Anzeige normalisiert beim Blur; Währungssuffix im Feld.
- Das manuelle Erfassungsformular für Dividendeneingänge ist bewusst auf vier Felder
  reduziert (Depot, Unternehmen, Zahlungsdatum, Nettobetrag) — kein Fremdwährungs-Umschalter,
  keine separaten Steuerfelder mehr im Formular (DATA_DICTIONARY.md §9, DECISIONS.md).
  Bruttobetrag, Steuern und Fremdwährung bleiben Datenbankfelder, werden aber programmatisch
  abgeleitet statt manuell abgefragt.
- Jedes Feld mit sichtbarem Label (keine Placeholder-als-Label), Pflichtfelder markiert.

## 7. Barrierefreiheit (verbindlich)

WCAG 2.2 AA als Zielniveau: vollständige Tastaturbedienung inkl. Import-Assistent,
Fokus-Management in Dialogen/Sheets (Trap + Rückgabe), Screenreader-Labels für alle
Icon-Buttons, Tabellen mit korrekten Headern, Live-Regions für asynchrone Ergebnisse
(Importanalyse fertig), Diagramm-Datentabellen, Reduced Motion, 200-%-Zoom, Touch-Ziele.
Prüfverfahren: TEST_STRATEGY.md §9.

**Nicht-Text-Kontrast (1.4.11).** Der Rahmen von Eingabefeldern, Auswahllisten,
Kontrollkästchen und Umriss-Schaltflächen (`--input`) hält 3:1 gegen *jede* Fläche, an
die er grenzt — Seite, Karte, gedämpfte Fläche, Akzent im Hover, Meldungsflächen. Bei
einem leeren Feld ist dieser Rahmen das einzige, was das Bedienelement sichtbar macht.
Strukturlinien (`--border`: Karten, Tabellen, Trenner) fallen nicht darunter und bleiben
bewusst zurückhaltend; ein Element, das nur durch eine solche Linie erkennbar wäre,
bekommt stattdessen `--input`.

## 8. Dark Mode

Vollständig gleichwertig (kein „nachgereichtes" Theme): eigene Chart- und Statusfarben,
Kontrastprüfung beider Modi in CI (axe), `theme-color` pro Modus, Umschalter in
Einstellungen (hell/dunkel/System).

**Die Seitenfläche ist reines Schwarz.** Auf OLED-Geräten (iPhone, iPad Pro) bleiben die
Pixel dort aus: kein Grauschleier im Dunkeln, weniger Verbrauch. Die Tiefenwirkung trägt
deshalb nicht der Hintergrund, sondern die Staffelung darüber — Karte `L 0.19`, gedämpfte
Fläche `L 0.24`, Akzent `L 0.29`, Rahmen `L 0.30`. Jede Fläche in der Oberfläche ist eine
dieser Stufen; `--background` bleibt der Grund und wird nie als erhobenes Element benutzt
(eine schwarze Fläche auf grauem Grund liest sich als Loch, nicht als Auswahl).

Die Tönung ist nahezu neutral (Chroma ≤ 0.008): Neben reinem Schwarz wirkt ein Blaustich
in den Flächen schmutzig statt kühl. Der Text bleibt bei `L 0.94` statt reinem Weiß —
maximaler Kontrast auf Schwarz lässt Schrift auf OLED ausfransen.

## Dashboard (Phase 5A)

**Aufbau (von oben):** Seitenüberschrift mit Jahres-Pille → Kopf (`DashboardHero`: Hauptzahl,
Veränderung, Jahresziel, Diagramm, Kennzahlen) → „Demnächst" (nur laufendes Jahr und „Alle
Jahre") → „Verteilung" (Assets/Depots umschaltbar) → letzte Dividenden → Summe seit Beginn. Alle
Abschnitte ohne Kartenrahmen (`Section`). **Ab `lg` zwei Spalten:** links Kopf und letzte
Dividenden, rechts (352 px) Demnächst, Verteilung, Summe. Ruhig, datenorientiert; keine
dekorativen Visualisierungen, keine 3D-Diagramme, keine dauerhafte grün/rot-Bewertung
saisonaler Schwankungen.

**Kopf (seit 1.7.0, ohne Kartenrahmen):** Drei Ebenen tragen die Rangfolge — Hauptzahl 40 px
(52 px ab `sm`), Abschnitte, Zeilen. Unter der Zahl die Veränderung als Pfeil und Prozent in
Grün/Rot, daneben gedämpft der Betrag und der Bezug („+92,20 € ggü. Vorjahreszeitraum"). Darunter
das **Jahresziel** als 4-px-Balken mit Zeile „40,4 % vom Ziel 3.200,00 €"; rechts im
laufenden Jahr die **Prognose** (gestrichelte Verlängerung des Balkens, CALCULATION_RULES.md
§9.7), sonst Restbetrag bzw. Ergebnis. Führt zur Zieldetailseite; ohne Ziel „Jahresziel für 2026
festlegen". Dann das Diagramm und eine gedämpfte Fläche mit drei Kennzahlen ohne Trennlinien:
laufender Monat (mit Monatsziel „17 % vom Ziel" — die Kachel trägt den Monat als Überschrift,
„vom Monatsziel" brach um —, sonst Vorjahresvergleich), Ø pro Monat, bester Monat; außerhalb des
laufenden Jahres statt des Monats die Zahl der Dividenden samt Breite.

**Diagramm im Kopf:** ein eigenes SVG (`HeroChart`) statt Recharts — es steht im ersten
Bildschirm, die Übersicht lädt Recharts damit gar nicht mehr. Ein Jahr hat zwei Sichten
(Umschalter „Kumuliert | Monatlich" oben links im Diagramm, Voreinstellung kumuliert): die laufende Jahressumme als
Linie in Orange gegen das Vorjahr (grau gestrichelt; im laufenden Jahr endet die Linie heute) oder die
Monatssummen als Linie gegen das Vorjahr (seit 1.12.0, zuvor Balkenpaare; ein Punkt je Monat). „Alle Jahre" zeigt den Verlauf der Jahressummen als Linie (seit 1.11.0; fünfzehn Säulen
wurden auf dem Telefon zu Strichen), beschriftet ist jedes Jahr, für das Platz ist, das
laufende immer. **Wischen statt Tooltip:**
Fahren oder Wischen wählt einen Punkt, der Kopf zeigt dann dessen Stand samt Vergleich („Dividenden bis September 2026",
„+3.059,15 € ggü. 2025" — kurz, damit die Zeile auf dem Telefon nicht umbricht), und der
Betrag führt zu diesen Dividenden. Mit der Maus endet die Auswahl beim Verlassen und ein Klick
öffnet die Dividenden; mit dem Finger bleibt sie stehen, bis man den Punkt erneut antippt.
Eine Legende steht seit 1.12.0 nicht mehr daneben: Die Vorjahreslinie trägt ihr Jahr am Ende,
der Kopf nennt beim Wischen beide Jahre.
Tastatur: Das Diagramm ist ein Schieberegler (`role="slider"`, Pfeiltasten, Pos1/Ende, Enter
öffnet, Escape setzt zurück), der Stand wird über `aria-valuetext` angesagt. Eine Datentabelle
steht darunter seit 1.11.0 nicht mehr: Jeder Punkt ist ansteuerbar, die Statistik führt dieselben
Zahlen als Tabelle.

**Verteilung:** die fünf stärksten Assets des Zeitraums als schmale Balken in Vordergrundfarbe
mit Anteil, darunter „Alle 12 Assets" zur Statistik; umschaltbar auf die Depots. Beide
beantworten dieselbe Frage, früher standen sie als zwei Karten nebeneinander. Mit nur einem
Depot entfällt der Umschalter, der Abschnitt heißt „Top-Assets".

**Demnächst:** die nächsten drei angekündigten Zahltage aus dem Kalender und die erwartete Summe
der nächsten 30 Tage; „erwartet", weil es Ankündigungen sind, keine erhaltenen Dividenden. Ohne kommende
Termine entfällt der Abschnitt. Das Datumsfeld ist grau (`--muted`), nicht orange: Orange
markiert Aktionen, der Weg zum Kalender ist der Link „Kalender" im Abschnittskopf.

**Responsive:** Kopf über die volle Breite (ab `lg` die linke Spalte); die Gesamtsumme aller
Jahre steht als eine Zeile „Gesamt seit März 2019 · 412 Dividenden" auf gedämpfter Fläche am
Ende (führt zur Statistik), nicht zusätzlich als Kachel. Bei „Alle Jahre" entfällt
die Zeile, weil die Kennzahlen oben dann dieselbe Summe nennen. Früher stand dort eine Karte mit
sechs Eckdaten, die fast alle schon auf der Seite oder in der Statistik standen. Das Diagramm
misst seine Breite selbst (`ResizeObserver`) und zeichnet in echten Pixeln; die Verteilung als
horizontale Balken. Touch-Ziele ≥ 44 px (Buttons `size="sm"`/`default`), `overflow-x` nur innerhalb
scrollbarer Container (Datentabellen).

**Accessibility:**
- Semantische Überschriften (`h1` „Übersicht", Abschnitte als `h2` über `Section`).
- Jedes Diagramm hat eine Beschreibung für Hilfsmittel (`role="img"` mit `aria-label`, das
  Diagramm im Kopf als Schieberegler mit `aria-valuetext`) **und** eine ausklappbare
  Datentabelle (`<details>` „Datentabelle anzeigen") als text-/tabellarische Alternative.
- Zeitraum-Buttons mit `aria-pressed`; Fokuszustände sichtbar (`focus-visible:ring`).
- `prefers-reduced-motion` schaltet Diagramm-Animationen ab.
- Farben tragen nie die alleinige Information (Betrag/Prozent immer als Text; Archivstatus als
  „Archiviert"-Badge).
- Skeletons für Ladezustände (`aria-busy`), sprechende Leer-/Fehlertexte statt irreführender
  Nullwerte („Für 2014 liegen keine Dividendeneingänge vor").

## Phase 6 – Verwaltung & Datenqualität

**Stornieren vs. Löschen.** Getrennte Aktionen mit eigenen Dialogen. Der
Stornodialog („Dividendeneingang stornieren?") betont Erhalt/Reaktivierbarkeit
und den Ausschluss aus den Standardauswertungen. Der Löschdialog
(„Dividendeneingang dauerhaft löschen?") zeigt Unternehmen, Datum, Depot, Betrag
und Datenquelle, weist auf die dauerhafte Wirkung hin und nennt die Aktion
„Dauerhaft löschen" (kein generisches „OK"); Alternative „Abbrechen".

**Responsive.** Desktop: tabellarische Liste mit Filterleiste und sortierbaren
Optionen. Mobile: Listenzeilen statt gequetschter Tabelle (`PaymentListItem`) —
jede Zeile eine Tippfläche zur Detailseite; die Aktionen stehen dort im Kopf als
Symbolschaltflächen mit denselben Symbolen und Namen wie in der Tabelle
(`aria-label`, 44-px-Ziel). Filter/Sortierung als Selects. Dasselbe Muster gilt für
Assets und Ziele.

**Keine Mehrfachauswahl.** Die Liste hat weder Kästchen noch Aktionsleiste.
Jede Zeile trägt ihre Aktionen selbst (Bearbeiten, Stornieren/Reaktivieren,
Löschen) — das deckt den tatsächlichen Bedarf ab, ohne dass jede Zeile eine
Spalte und jeder Klick einen Modus mitschleppt.

**Datenqualitätsansicht.** Übersichtszahlen, Dublettenvergleich (nebeneinander,
mit Kategorie-Badge) und Auffälligkeitsliste; Aktion „Keine Dublette" wird
persistiert. Markierte Paare stehen eingeklappt darunter („Als keine Dublette markiert (n)")
und lassen sich dort zurücknehmen. Zugänglich: Dialoge mit Titel/Fokusfalle, Statusinformation nicht
nur über Farbe (Text-Badges), tastaturbedienbare Auswahl.

---

## Phase 7 — Ziele

**Zielseite (`/ziele`).** Überschrift, primäre Aktion „Ziel anlegen", darunter
Reiter für aktive, bevorstehende und beendete Ziele als Zielkarten (Grid,
1/2/3 Spalten je Breite). Detailansicht `/ziele/:id` mit Drill-down zu den
Dividenden des Zeitraums.

**Reihenfolge je Reiter.** Jeder Reiter beantwortet eine andere Frage und hat
deshalb seine eigene Ordnung: *Aktiv* das Jahresziel als Rahmen zuerst, darunter
die Monatsziele; *Bevorstehend* das nächste Ziel zuerst; *Beendet* das zuletzt
beendete zuerst. Der Zielstatus (erreicht/verfehlt) sortiert nirgends — sonst
liefen die Zeiträume durcheinander.

**Zielkarte.** `GoalCard` ist **eine** Komponente für die Zielseite; eine zweite,
kürzere Fassung für das Dashboard gab es, und dieselbe Sache sah an zwei Stellen
unterschiedlich aus. Die Übersicht zeigt Ziele seit dem Kennzahlkopf nicht mehr
als Karte, sondern dort, wo die Summe steht: das Jahresziel als Balken unter der
Hauptzahl (mit derselben `GoalProgressBar`), das Monatsziel im Feld des Monats. Die ganze Karte führt zur Detailseite;
„Bearbeiten" und „Löschen" stehen dort im Kopf (`DetailHeader`) — wie bei
Dividenden und Assets.

**Zeichen und Zielart.** Jahres- und Monatsziel tragen dieselbe dunkle
36-px-Symbolkachel (`GoalMark`, `CalendarRange`). Bis 1.10 trug das Monatsziel ein
eigenes Symbol auf grauer Kachel; die Zielart steht aber schon im Titel
(„Dividendenziel 2026", „Monatsziel März 2026"), und das graue Zeichen wirkte wie
deaktiviert. Die Detailseite nennt Zielart und Zeitraum zusätzlich nur bei eigenem
Titel; sonst steht darunter allein der Zeitfortschritt bzw. „Beginnt am …".

**Aufbau der Zielkarte.** Die Karte beantwortet auf einen Blick nur zwei
Fragen: Wie hoch ist das Ziel, und wo stehe ich? Oben Symbolkachel und Titel;
die Statusmarke steht in der oberen rechten Ecke und wird vom Titel umflossen,
statt als eigene Spalte dauerhaft Breite zu belegen. Darunter eine Zeile
„2.487,35 € von 3.600,00 €" (Stand hervorgehoben, Ziel gedämpft) mit dem
Prozentwert rechts, darunter der Balken. Zeitfortschritt, Restbetrag und die
Beträge als eigene Felder standen früher zusätzlich in der Karte; sie war fast
doppelt so hoch, und die zwei entscheidenden Zahlen gingen darin unter. Beides
steht auf der Detailseite. Bevorstehende Ziele zeigen den Zielbetrag und
„Beginnt am …" statt der Betragszeile. Eine Zeile, die Zielart und Zeitraum
wiederholt, gibt es nicht — das steht schon im Titel.

**Fortschrittsanzeige.** `GoalProgressBar` ist ein zugängliches
`role="progressbar"` mit `aria-valuemin/max/now` und aussagekräftigem
`aria-valuetext` (Betrag + Prozent, bei Überschreitung inkl. übertroffenem
Betrag). Der Balken ist visuell auf 100 % begrenzt; der reale Prozentwert steht
zusätzlich als Text (auf der Detailseite unter dem Balken, auf der Zielkarte in
der Betragszeile daneben); ein „Ziel 100 %" am Balkenende entfällt, es sagte
immer dasselbe. Information nie nur über Farbe (Status-Badge mit Text).
Fortschrittsanimation nur dezent und `motion-reduce`-fest. Bevorstehende Ziele
zeigen „Beginnt am …" statt Fortschritt (keine negative Bewertung, keine
Prognose) und kein „Erhalten 0,00 €". Die Detailseite zeigt Zielbetrag, Erhaltenes
und Restbetrag als 2×2-Raster; die Zielerreichung in Prozent nennt der Balken, ein
eigener Wert dafür wiederholte ihn.

**Formular.** Dialog mit React Hook Form + Zod, deutsche Betragseingabe
(decimal-sicher), verständliche, an Felder gebundene Fehlermeldungen, Schutz vor
Mehrfach-Übermittlung, Bestätigungsdialog vor dauerhafter Löschung mit klarem
Hinweis, dass Dividendeneingänge unverändert bleiben.

**Responsive.** Desktop mehrspaltige Karten; iPad adaptive 1–2 Spalten; iPhone
Karten untereinander mit direkt sichtbarem Ziel-/Ist-Wert und Fortschritt,
einspaltigem Formular, ausreichend großen Touch-Zielen (44 pt), keine erzwungene
Desktoptabelle.
