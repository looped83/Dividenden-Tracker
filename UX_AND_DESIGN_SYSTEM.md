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
| `--chart-1…6` | Diagrammserien | zurückhaltende, unterscheidbare Reihe (blau-basiert mit klaren Abstufungen; farbfehlsicht-tauglich) | eigene Dunkel-Varianten |

Regeln: Bedeutung nie durch Farbe allein (immer Text/Symbol dazu, z. B. Vorzeichen);
alle Text-/Hintergrund-Paare ≥ WCAG AA (4,5:1; große Zahlen 3:1).

### Typografie

- UI-Schrift: Systemstack (`-apple-system, "SF Pro", Inter, sans-serif`) — nativ auf
  Apple-Geräten, keine externen Fonts (CSP).
- **Beträge immer in Tabellenziffern** (`font-variant-numeric: tabular-nums`), rechtsbündig
  in Tabellen; Minuswerte mit echtem Minuszeichen und `--negative`.
- Skala: 12 (Meta) · 14 (Body/Tabellen) · 16 (Formulare mobil, verhindert iOS-Zoom) ·
  18/20 (Abschnittstitel) · 28/32 (Kennzahlwerte). Zeilenhöhe 1,5 für Fließtext.

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
| `ImportWizard` | Schrittleiste, Rohdatenvorschau (Monospace-Grid), Mapping-Zeilen, Bilanzanzeige |
| `BalanceSummary` | Importbilanz-Block (IMPORT_SPEC.md §8) mit aufklappbaren Kategorien |
| `AuditTrail` | Änderungsverlauf als vertikale Liste: Zeitpunkt, Aktion, Feld-Diffs (alt → neu) |
| `EmptyState` | Illustration­sfrei: Icon, ein Satz, primäre Aktion („Ersten Eingang erfassen", „Datei importieren") |
| `ErrorState` / `WarningBanner` | Fehler-/Warnmuster mit konkreter Ursache und Aktion |
| `ChartPanel` | Recharts-Wrapper: Titel, Zeitraum, Umschalter Diagramm ↔ Datentabelle (Accessibility), Drill-down bei Klick auf Segment |
| `GoalProgress` | Zielfortschritt: Balken, „X von Y (Z %)", Kappung 100 % visuell |

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
- Fremdwährungsmodus: Umschalter im Formular blendet Originalbetrag/Kurs ein und zeigt die
  berechneten Basisbeträge zur Bestätigung (R-2).
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
