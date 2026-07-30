# UX_AND_DESIGN_SYSTEM.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliches UX- und Designsystem (Planungsphase)

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
| `--background` / `--card` | Flächen | Weiß / sehr helles Grau | tiefes Grau-Blau (kein reines Schwarz) |
| `--foreground` | Text | fast Schwarz | helles Grau |
| `--muted-foreground` | Sekundärtext, Labels | Grau ≥ 4,5:1 Kontrast | dito |
| `--primary` | Aktionen, aktive Navigation | gedecktes Tiefblau | helleres Blau |
| `--positive` | Zuwächse, Eingänge | gedecktes Grün | angepasst, Kontrast AA |
| `--negative` | Korrekturen, Rückgänge, Fehler | gedecktes Rot | angepasst |
| `--warning` | Warnungen, mögliche Duplikate | Bernstein | angepasst |
| `--chart-1…6` | Diagrammserien | sechs Farbtöne in fester Reihenfolge (siehe unten) | eigene Dunkel-Stufen, keine Umkehrung |

Regeln: Bedeutung nie durch Farbe allein (immer Text/Symbol dazu, z. B. Vorzeichen);
alle Text-/Hintergrund-Paare ≥ WCAG AA (4,5:1; große Zahlen 3:1).

#### 1a Diagrammpalette (kategorial)

Die Reihenfolge ist verbindlich: Slot 1 zuerst, dann 2, dann 3 — **nie** durchrotieren,
nie eine siebte Farbe erzeugen. Braucht eine Auswertung mehr als sechs Reihen, wird
zusammengefasst („Sonstige") oder in kleine Einzeldiagramme aufgeteilt.

| Slot | Farbton | Hell | Dunkel |
|---|---|---|---|
| 1 | Blau | `oklch(0.52 0.15 255)` `#1f68bc` | `oklch(0.60 0.15 255)` `#3a81d7` |
| 2 | Orange | `oklch(0.62 0.14 60)` `#c26e12` | `oklch(0.66 0.14 60)` `#cf7b26` |
| 3 | Türkis | `oklch(0.65 0.105 185)` `#28a497` | `oklch(0.66 0.107 185)` `#29a79b` |
| 4 | Magenta | `oklch(0.52 0.17 345)` `#a8347f` | `oklch(0.55 0.17 345)` `#b23e88` |
| 5 | Grün | `oklch(0.60 0.14 150)` `#319751` | `oklch(0.64 0.14 150)` `#40a35c` |
| 6 | Violett | `oklch(0.46 0.16 300)` `#673ba2` | `oklch(0.55 0.17 300)` `#8254c4` |

**Gemessen, nicht geschätzt.** Beide Sätze bestehen alle rechnerischen Prüfungen gegen
die Kartenfläche (`#ffffff` hell, `#181d24` dunkel): Helligkeitsband, Chroma-Untergrenze,
CVD-Abstand benachbarter Slots (schlechtestes Paar ΔE 12,1 hell / 10,3 dunkel bei einer
Schwelle von 8), Normalsicht-Abstand (20,8 hell / 21,9 dunkel bei einer Schwelle von 15)
und ≥ 3:1 Kontrast. Die ersten **drei** Slots halten die Schwellen zusätzlich über *alle*
Paare — Darstellungen ohne feste Nachbarschaft (Streudiagramme, Landkarten) sind damit
auf drei Reihen begrenzt.

**Zwei Reihen (aktuell ↔ Referenz)** verwenden immer Slot 1 und Slot 2 — Blau gegen
Orange, gegenüberliegende Farbtöne, ΔE 25,1 hell / 25,3 dunkel bei Protanopie. Die
Referenzreihe ist zusätzlich gestrichelt oder benannt; Farbe allein trägt die Identität
nie.

**Der Dunkelsatz ist eigens gewählt, keine Aufhellung des hellen.** Sein Band liegt
tiefer (L 0,48–0,67 gegenüber 0,43–0,77): Marken oberhalb davon blenden auf dunklem
Grund und verlieren gleichzeitig Sättigung.

Die Statusfarben (`--positive`, `--negative`, `--warning`) sind reserviert und werden nie
als Serienfarbe benutzt — auch dann nicht, wenn ein Farbton ähnlich aussieht.

### Typografie

- UI-Schrift: Systemstack (`-apple-system, "SF Pro", Inter, sans-serif`) — nativ auf
  Apple-Geräten, keine externen Fonts (CSP).
- **Beträge immer in Tabellenziffern** (`font-variant-numeric: tabular-nums`), rechtsbündig
  in Tabellen; Minuswerte mit echtem Minuszeichen und `--negative`.
- **Jede angezeigte Zahl in deutscher Schreibweise mit Tausenderpunkt** (1.439 Zahlungen,
  1.234,56 €) — Beträge und Prozentwerte über `formatMoney`/`formatPercent`, Anzahlen,
  Seiten- und Zeilenangaben über `formatCountNumber`/`formatCountNoun`
  (`lib/utils/formatNumber.ts`). Ausgenommen sind Jahreszahlen (2026, nicht 2.026).
- Skala: 12 (Meta) · 14 (Body/Tabellen) · 16 (Formulare mobil, verhindert iOS-Zoom) ·
  18/20 (Abschnittstitel) · 28/32 (Kennzahlwerte). Zeilenhöhe 1,5 für Fließtext.
- **Formularfelder unterhalb `sm` zwingend 16 px** (`text-base sm:text-sm` in `Input`,
  `Select`, `Textarea`, `Combobox`). iOS Safari zoomt die Seite, sobald ein Feld mit
  kleinerer Schrift den Fokus bekommt — und nach dem Zoom lässt sie sich seitlich
  verschieben. Der Pinch-Zoom bleibt dabei ausdrücklich erlaubt (kein `user-scalable=no`,
  kein `maximum-scale`): Wer Text vergrößern muss, darf das (WCAG 1.4.4). Gesichert durch
  `tests/e2e/mobile.spec.ts`.

### Abstände, Radien, Tiefe

- 4-px-Raster (4/8/12/16/24/32/48); Seitenränder: 24 px Desktop, 16 px iPhone.
- Radius 8 px (Karten 12 px); Schatten nur eine dezente Stufe für schwebende Elemente
  (Dialoge, Popover) — Karten trennen sich per Fläche und 1-px-Border, nicht per Schatten.
- Animationen: nur funktionale Übergänge ≤ 200 ms (Panel auf/zu, Fokus); Diagramme ohne
  Intro-Animation; `prefers-reduced-motion` schaltet alles ab.

## 2. Komponentenbibliothek (shadcn/ui-Basis)

Verwendete Basiskomponenten: Button, Input, Select, Combobox, DatePicker, Dialog, Drawer/Sheet,
Table, Tabs, Badge, Card, Toast/Sonner, Tooltip, DropdownMenu, Form (RHF-Integration),
Skeleton, Alert.

Eigene zusammengesetzte Komponenten (fachlich):

| Komponente | Zweck |
|---|---|
| `AmountText` | Betragsdarstellung: tabular-nums, Währung, Vorzeichen, Farbe (semantisch), niemals Rundung in der Komponente |
| `StatCard` | Kennzahl: Wert, Label, Vergleichswert (Δ absolut + %), Drill-down-Link; max. 4 primäre StatCards pro Ansicht (Hierarchie statt Kennzahlflut) |
| `PaymentTable` / `PaymentCardList` | Tabelle (Desktop/iPad) bzw. Kartenliste (iPhone) mit identischer Datenquelle und Filterzustand |
| `FilterBar` | Sichtbare Filterleiste Desktop; auf iPhone als Sheet mit progressiver Offenlegung (Basisfilter sichtbar, erweiterte hinter „Mehr Filter") und aktiven Filter-Chips |
| `ComparisonBreakdown` | Gegenüberstellung Zeile für Zeile (Monate oder Unternehmen): ab `md` eine Tabelle mit vier Spalten, darunter eine Liste — je Zeile Name und Differenz, darunter beide Zeiträume. Vier Spalten passen bei 390 px nicht nebeneinander, und die Seite soll auf dem Telefon nicht seitlich verschiebbar sein |
| `EntitySelect` | **Die** Auswahlliste für Unternehmen und Depots — überall dieselbe: neutrale Auswahl („Alle Unternehmen"), darunter die Gruppen „Aktiv" und „Archiviert" (leere Gruppe entfällt), sortiert nach deutschem Alphabet. Archivierte bleiben wählbar, stehen aber nicht zwischen den aktiven. Neue Unternehmens-/Depotauswahlen in Filterleisten verwenden ausschließlich diese Komponente |
| `ImportWizard` | Schrittleiste, Rohdatenvorschau (Monospace-Grid), Mapping-Zeilen, Bilanzanzeige |
| `BalanceSummary` | Importbilanz-Block (IMPORT_SPEC.md §8) mit aufklappbaren Kategorien |
| `AuditTrail` | Änderungsverlauf als vertikale Liste: Zeitpunkt, Aktion, Feld-Diffs (alt → neu) |
| `EmptyState` | Illustration­sfrei: Icon, ein Satz, primäre Aktion („Ersten Eingang erfassen", „Datei importieren") |
| `ErrorState` / `WarningBanner` | Fehler-/Warnmuster mit konkreter Ursache und Aktion |
| `ChartPanel` | Recharts-Wrapper: Titel, Zeitraum, Umschalter Diagramm ↔ Datentabelle (Accessibility), Drill-down bei Klick auf Segment |
| `GoalProgress` | Zielfortschritt: Balken, „X von Y (Z %)", Kappung 100 % visuell |
| `ToastProvider` / `useToast` | Kurze Rückmeldung nach abgeschlossenen Aktionen (Speichern, Storno, Reaktivieren, Massenaktionen): `role="status"`, `aria-live="polite"`, 4 s sichtbar, von Hand schließbar, über der Bottom-Navigation. Nur Bestätigungen und beiläufige Fehler — alles Entscheidungspflichtige bleibt Dialog oder Feldfehler |

## 3. Diagramm-Richtlinien

- Balken für Monats-/Jahresreihen (diskrete Zeiträume), Linie nur für rollierende 12-Monats-
  Reihe; Donut sparsam für Aufteilungen (max. 6 Segmente + „übrige").
- Ein Diagramm beantwortet eine Frage; keine Doppelachsen, keine 3D, kein Dekor.
- Tooltip mit exakten Werten (`AmountText`); X-Achsen-Labels de-DE („Jan", „Feb", …).
- Vorjahresvergleich als gepaarte Balken oder dezente Vorjahr-Schattenbalken.
- Jede Grafik: Umschalter zur Datentabelle + textuelle Zusammenfassung (Screenreader).

## 4. Layouts je Gerät

### Mac / großer Desktop (≥ 1024 px)

- Dauerhafte Sidebar (240 px) mit den 9 Bereichen; Inhalt max. 1200 px zentriert.
- Große Datentabellen: Spaltenwahl, Sticky Header, Zeilendichte-Umschalter; Zeilenklick
  öffnet optionale Detailspalte rechts (Inspector, 380 px) statt Seitenwechsel —
  effiziente Massenprüfung beim Import/Migration.
- Drag-and-drop-Import auf die gesamte Import-Seite; sichtbare Filterleiste; Tastaturkürzel:
  `N` neuer Eingang, `/` Suche, `⌘K` Befehlspalette (Navigation), `Esc` schließt Inspector.

### iPad (768–1024 px)

- Adaptive Sidebar: einklappbar auf Icon-Leiste (Querformat), als Overlay (Hochformat).
- Touch-optimierte Tabellen: 44-pt-Zeilenhöhe, horizontale Priorisierung (wichtige Spalten
  fix, weitere per Scroll); Detailansicht als Sheet.
- Vollständige Verwaltung möglich (Import, Bearbeitung, Backup) — keine abgespeckte Version;
  Dateiimport über Dateien-App; beide Orientierungen vollwertig.

### iPhone (< 768 px)

- Bottom Navigation (5 Slots): Übersicht · Eingänge · **＋ Erfassen** (zentral, hervorgehoben)
  · Statistiken · Mehr (Unternehmen, Depots, Importe, Ziele, Datensicherung, Einstellungen).
- Karten statt breiter Tabellen: je Zahlung eine Karte (Unternehmen, Datum, Netto prominent,
  Typ-Badge); unendliches Scrollen mit Jahres-Sprungmarken.
- Schnelle manuelle Erfassung: Formular als Full-Screen-Sheet, sinnvolle Defaults (heutiges
  Datum, zuletzt genutztes Depot), Wertpapier-Suchfeld mit Zuletzt-Liste, numerische
  Tastatur (`inputmode="decimal"`), Einhandbedienung (primäre Aktionen unten).
- Kompakte Statistiken: horizontal blätterbare StatCards, Diagramme volle Breite.
- Progressive Offenlegung komplexer Filter (FilterBar-Sheet); keine Hover-Abhängigkeiten
  (alle Aktionen tapbar, Kontextmenüs als Long-Press mit sichtbarer Alternative).
- Touch-Ziele ≥ 44×44 pt; Safe Areas (`env(safe-area-inset-*)`) für Notch/Home-Indicator;
  Hoch- und Querformat; Import möglich (Dateien-App), aber als sekundärer Fluss.

## 5. Zustände und Muster

| Zustand | Muster |
|---|---|
| Leer (neues Konto) | Onboarding-EmptyState: „Eingang erfassen" oder „Aus Numbers importieren" (Verweis Migration) |
| Laden | Skeletons in Karten-/Tabellenform; keine Spinner-Vollflächen |
| Fehler | ErrorState mit Ursache + Aktion („Erneut versuchen"); Formularfehler feldnah + Zusammenfassung oben |
| Offline | Persistenter, dezenter Banner; Schreibaktionen deaktiviert mit Begründung |
| Warnung (Duplikate, Invariante) | WarningBanner bernstein, niemals blockierend ohne Erklärung, immer mit Detail-Link |
| Destruktiv-nahe Aktionen (Storno, Rollback, Voll-Restore) | Dialog mit Konsequenzbeschreibung in Zahlen („1.219 Eingänge werden archiviert") + explizite Bestätigung; bei Rollback/Restore zusätzlich Texteingabe „RÜCKGÄNGIG" ab > 100 betroffenen Datensätzen |
| Erfolg | Toast mit Kernzahl („Import abgeschlossen: 1.219 Eingänge") + Link zum Bericht |

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

## 8. Dark Mode

Vollständig gleichwertig (kein „nachgereichtes" Theme): eigene Chart- und Statusfarben,
Kontrastprüfung beider Modi in CI (axe), Manifest-`theme_color` pro Modus, Umschalter in
Einstellungen (hell/dunkel/System).

## Dashboard (Phase 5A)

**Aufbau (von oben):** Seitenüberschrift → Zeitraumsteuerung → KPI-Karten → monatlicher
Verlauf → Top-Unternehmen + Depotverteilung (nebeneinander ab `lg`) → letzte Eingänge →
historische Übersicht. Ruhig, datenorientiert; keine dekorativen Visualisierungen, keine
3D-Diagramme, keine dauerhafte grün/rot-Bewertung saisonaler Schwankungen.

**Responsive:** KPI-Raster 1 → 2 → 3 Spalten (iPhone/iPad/Desktop); Diagramm füllt die Breite
(`ResponsiveContainer`), Top-Listen/Depotverteilung als horizontale Balken (auf schmalen Geräten
untereinander). Touch-Ziele ≥ 44 px (Buttons `size="sm"`/`default`), `overflow-x` nur innerhalb
scrollbarer Container (Datentabellen).

**Accessibility:**
- Semantische Überschriften (`h1` „Übersicht", Kartentitel via `CardTitle`).
- Jedes Diagramm hat `role="img"` mit beschreibendem `aria-label` **und** eine ausklappbare
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

**Responsive.** Desktop: tabellarische Liste mit Filterleiste, sortierbaren
Optionen und Mehrfachauswahl. Mobile: kompakte Karten statt gequetschter Tabelle
— Betrag als hervorgehobene Kernaussage, Aktionen als Symbolschaltflächen mit
denselben Symbolen und Namen wie in der Tabelle (`aria-label`, 44-px-Ziel);
Filter/Sortierung als Selects. Drei beschriftete Schaltflächen verlängerten die
Karte um zwei Zeilen, ohne mehr auszusagen.

**Massenaktionsleiste.** Erscheint bei Auswahl, zeigt die Anzahl (Abbruch als
Symbol in der Ecke), darunter die Aktionen mit Bestätigungsdialogen und einer
Ergebniszusammenfassung mit ausgewiesenen Teilfehlern. Sie wirkt nur auf
sichtbar Angehaktes; „alle gefilterten auswählen" gibt es bewusst nicht mehr —
vierstellige Auswahlen hinter einem Klick sind kein sichtbarer Auswahlmodus.

**Datenqualitätsansicht.** Übersichtszahlen, Dublettenvergleich (nebeneinander,
mit Kategorie-Badge) und Auffälligkeitsliste; Aktion „Keine Dublette" wird
persistiert. Zugänglich: Dialoge mit Titel/Fokusfalle, Statusinformation nicht
nur über Farbe (Text-Badges), tastaturbedienbare Auswahl.

---

## Phase 7 — Ziele

**Zielseite (`/ziele`).** Überschrift, kurze fachliche Einordnung („Vergleichs­
wert, keine Prognose"), primäre Aktion „Ziel anlegen", danach Sektionen für
aktive, bevorstehende und beendete Ziele als klar lesbare Zielkarten (Grid,
1/2/3 Spalten je Breite). Detailansicht `/ziele/:id` mit Drill-down zu den
Eingängen des Zeitraums.

**Zielkarte & Fortschrittsanzeige.** `GoalProgressBar` ist ein zugängliches
`role="progressbar"` mit `aria-valuemin/max/now` und aussagekräftigem
`aria-valuetext` (Betrag + Prozent, bei Überschreitung inkl. übertroffenem
Betrag). Der Balken ist visuell auf 100 % begrenzt; der reale Prozentwert steht
zusätzlich als Text. Information nie nur über Farbe (Status-Badge mit Text).
Fortschrittsanimation nur dezent und `motion-reduce`-fest. Bevorstehende Ziele
zeigen „Beginnt am …" statt Fortschritt (keine negative Bewertung, keine
Prognose).

**Formular.** Dialog mit React Hook Form + Zod, deutsche Betragseingabe
(decimal-sicher), verständliche, an Felder gebundene Fehlermeldungen, Schutz vor
Mehrfach-Übermittlung, Bestätigungsdialog vor dauerhafter Löschung mit klarem
Hinweis, dass Dividendeneingänge unverändert bleiben.

**Responsive.** Desktop mehrspaltige Karten; iPad adaptive 1–2 Spalten; iPhone
Karten untereinander mit direkt sichtbarem Ziel-/Ist-Wert und Fortschritt,
einspaltigem Formular, ausreichend großen Touch-Zielen (44 pt), keine erzwungene
Desktoptabelle.
