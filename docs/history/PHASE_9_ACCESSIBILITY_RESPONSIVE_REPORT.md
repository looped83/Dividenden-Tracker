# Phase 9.11 & 9.12 — Barrierefreiheit und responsives Design

**Datum:** 2026-07-27
**Umfang:** WCAG 2.2 AA (9.11) · 9 Viewport-Breiten (9.12)
**Methode:** axe-core 4 (19 Ansichten, echte Komponenten in jsdom), analytische
Kontrastberechnung aller Design-Tokens (OKLCH → sRGB → WCAG-Kontrastformel),
statische Analyse der Tailwind-Breakpoints, Quelltextprüfung aller Ansichten.

---

## 1. Executive Summary

Die Anwendung ist **substanziell barrierefrei gebaut**. Der automatisierte
axe-Lauf über 19 Ansichten fand **vier Verstöße, alle `moderate`, keiner
kritisch** — für eine Anwendung dieser Größe ein sehr guter Wert. Semantisches
HTML, Formularbeschriftungen, Tastaturbedienbarkeit, `prefers-reduced-motion`,
`lang="de"` und Datentabellen zu allen Diagrammen sind vorhanden und bewusst
umgesetzt.

Gefunden wurden jedoch **zwei echte Release-Blocker**, die kein automatisiertes
Werkzeug in jsdom finden kann, weil sie Farbe und Layout betreffen:

1. **Der Status „Storniert" war im dunklen Theme praktisch unsichtbar**
   (Kontrast **1,29:1** statt 4,5:1). Das ist die einzige visuelle Kennzeichnung
   stornierter Dividendeneingänge — im Dark Mode war ein stornierter Eingang von
   einem aktiven nicht zu unterscheiden. **Behoben.**
2. **Fehlermeldungen im Sicherungs-/Wiederherstellungsbereich hatten keine
   Fehlerfarbe.** `Alert variant="destructive"` verwies auf ein Token
   (`--destructive`), das im Design-System nie definiert wurde; die Klassen
   wurden von Tailwind nie erzeugt (Nachweis: `destructive` kommt im gebauten
   CSS **0-mal** vor). Fehler sahen aus wie normaler Fließtext — genau dort, wo
   Datenverlust droht. **Behoben.**

Der zweite große Befund ist struktureller Natur: Der **Backup-/Export-Bereich
wurde außerhalb des Design-Systems gebaut**. 59 fest verdrahtete
Tailwind-Palettenfarben (`text-gray-500`, `bg-blue-50`, `border-green-200` …) in
8 Dateien, ein eigener Seitenrahmen mit doppelten Innenabständen, eine eigene
H1-Größe. Er ist die einzige Stelle mit Dark-Mode-Kontrastfehlern und die einzige
Stelle mit einem Layout-Überlauf bei 320 px.

Der dritte Befund ist eine **systematische Lücke in den Formularen**: Die vier
Auth-Seiten verknüpfen Fehlermeldungen korrekt über `aria-invalid` /
`aria-describedby` mit ihren Feldern — **alle 8 Anwendungsformulare tun das
nicht**. Das Muster existiert im Projekt, es wurde nur nicht durchgezogen.

**Verdikt: RELEASEBEREIT** nach den in §5 angewandten Korrekturen. Die
verbleibenden Punkte sind Verbesserungen, keine Blocker. Details in §7.

| Kennzahl | Vorher | Nachher |
|---|---|---|
| axe-Verstöße (19 Ansichten) | 4 (moderate) | 4 (moderate, 2 davon Testartefakt) |
| Token-Paare unter WCAG-Schwelle | 6 | **2** (nur nicht-textuelle Rahmen) |
| Kritische Kontrastfehler (Dark Mode) | 2 | **0** |
| Nicht existierende Farb-Tokens im Einsatz | 1 (`destructive`) | **0** |
| Interaktive Elemente ohne Fokusindikator | 1 | **0** |
| Sprungmarke „Zum Inhalt" | nein | **ja** |
| Unit-Tests | 373 | **373 grün** |
| TypeScript / ESLint / Prettier | sauber | sauber |

---

## 2. Barrierefreiheit — Befunde

### 2.1 Automatisierter Lauf (axe-core)

19 Ansichten wurden mit den **echten Komponenten** gerendert und geprüft
(Dashboard, Dividendenliste, Dividendenformular, Ziele, Depots, Unternehmen,
Statistik-Diagramme, Heatmap, Einstellungen, Sicherung, beide
Bestätigungsdialoge, Login/Registrierung, 404, Navigation).

```
Geprüfte Ansichten: 19
Verstoss-Knoten gesamt: 4
  [moderate] landmark-unique: 2 Knoten -> AppShell
  [moderate] heading-order:   2 Knoten -> SettingsPage, BackupPage
```

15 von 19 Ansichten sind **vollständig verstoßfrei**, darunter alle Formulare,
die Dividendenliste, das Dashboard und beide destruktiven Dialoge.

> `color-contrast` und `target-size` wurden deaktiviert: jsdom hat keine
> Layout-Engine und kann sie nicht auswerten. Beide wurden stattdessen
> analytisch geprüft (§2.2 und §3.5) — das ist hier genauer als ein
> Browserlauf, weil es *jede* Token-Kombination abdeckt statt nur der zufällig
> gerenderten.

**`landmark-unique` ist ein Testartefakt, kein echter Fehler.** Sidebar,
CompactSidebar und BottomNav tragen alle `aria-label="Hauptnavigation"`. Im
Browser ist per CSS (`hidden lg:flex`, `md:hidden`) immer nur *eine* davon
sichtbar, also auch nur eine im Accessibility-Tree. In jsdom greift kein CSS,
darum sieht axe drei. Kein Handlungsbedarf.

**`heading-order` ist echt** — siehe H-3.

### 2.2 Farbkontrast (analytisch berechnet, alle Token-Paare)

Berechnung: OKLCH → linear sRGB → sRGB → relative Luminanz → WCAG-Kontrastformel,
inkl. Alpha-Kompositierung für Tint-Flächen (`bg-*/10`).

**🔴 K-1 — Statusabzeichen „Storniert" im dunklen Theme: 1,29:1** *(behoben)*
`Badge variant="warning"` setzte `text-warning-foreground` auf `bg-warning/10`.
`--warning-foreground` ist im Dark Mode absichtlich *dunkel*
(`oklch(0.2 0.03 80)`) — als Text auf einer *dunklen* Fläche ergibt das 1,29:1.
*Ort:* `src/components/ui/badge.tsx`, verwendet in `PaymentsPage.tsx:710`,
`PaymentDetailPage.tsx:164`, `SettingsPage.tsx:63`, `PlaceholderPage.tsx:22`.
*Wirkung:* Storniert/Aktiv im Dark Mode nicht unterscheidbar — und Storno ist
eine buchhalterisch relevante Zustandsänderung. Dieselbe Kombination traf den
Konflikthinweis im Dividendenformular (`NewPaymentPage.tsx:183`) und die
Änderungsmarkierung in der Detailansicht (`PaymentDetailPage.tsx:278,288`).
*Fix:* neues Token `--warning-strong`, das mit dem Theme kippt
(hell `oklch(0.46 0.11 70)`, dunkel `oklch(0.85 0.12 85)`).
Ergebnis: **6,61:1 hell / 8,84:1 dunkel**.

**🟠 H-1 — `text-warning` auf Karte im hellen Theme: 2,95:1** *(behoben)*
`ImportWizard.tsx:398`. Auf `--warning-strong` umgestellt.

**🟠 H-2 — Fest verdrahtete Graustufen ohne Dark-Variante** *(behoben)*
`text-gray-500` ohne `dark:`-Gegenstück ergibt auf der dunklen Karte **3,49:1**.
*Orte:* `RestoreSection.tsx:143,254,260,266,272`, `ConflictResolver.tsx:61`.
Auf `text-muted-foreground` umgestellt (6,81:1 hell / 6,07:1 dunkel).
Ebenso: Fortschrittsbalken `bg-blue-500` auf `bg-gray-700` = **2,74:1** (Soll 3:1
für grafische Objekte) → auf `bg-primary` / `bg-muted` umgestellt.

**🟡 M-1 — Eingabefeld-Rahmen: 1,41:1 hell / 1,57:1 dunkel** *(offen)*
`--input` gegen `--background`. WCAG 1.4.11 verlangt 3:1 für die Begrenzung von
Bedienelementen. Verschärfend: `Input`/`Select`/`Textarea` haben
`bg-background` — dieselbe Farbe wie die Seite. Der 1,41:1-Rahmen ist damit die
*einzige* Kennzeichnung, dass dort ein Eingabefeld ist. Betrifft Nutzer mit
reduziertem Kontrastsehen und helle Umgebungen (Sonnenlicht auf dem iPhone).
*Empfehlung:* `--input` auf ca. `oklch(0.72 0.01 260)` (hell) abdunkeln → ~3,1:1.
Nicht angewandt, weil es das visuelle Erscheinungsbild jedes Formulars ändert und
eine gestalterische Entscheidung ist.

**🟡 M-2 — Diagrammfarben** *(offen)*
`--chart-4` (2,73:1) und `--chart-5` (2,72:1) erreichen im hellen Theme die
3:1-Schwelle für grafische Objekte nicht. Zusätzlich sind `chart-1`/`chart-6`
(hell) und `chart-4`/`chart-5` (dunkel) **luminanzgleich (1,00:1)** — bei
Farbfehlsichtigkeit oder in Graustufen nicht unterscheidbar.
*Entschärft dadurch,* dass zu jedem Diagramm eine ausklappbare Datentabelle
gehört (`charts.tsx`, `<details>Datentabelle anzeigen</details>`) — WCAG 1.4.1
ist damit erfüllt. Trotzdem sollten die Luminanzen gespreizt werden.

**Alles andere besteht deutlich:** Fließtext 17,9:1 / 15,5:1, Sekundärtext
7,7:1 / 6,8:1, Tabellenköpfe 6,9:1 / 6,1:1, Primärbutton 8,7:1 / 7,8:1,
Fokusring 4,8:1 / 6,4:1, Badges positiv/negativ/primär 5,5–7,8:1 in beiden
Themes.

### 2.3 Tastaturbedienung

**🟠 H-3 — Kein Fokusindikator auf der zentralen Erfassen-Aktion** *(behoben)*
`BottomNav.tsx:29` hatte `outline-none` **ohne** `focus-visible:ring-*`. Die
prominenteste Aktion der mobilen Oberfläche („Neue Dividende erfassen") war per
Tastatur unsichtbar fokussierbar. Klarer WCAG 2.4.7 (AA) Verstoß. Alle 8 anderen
Stellen mit `outline-none` haben den Ring korrekt gesetzt — das war ein
Einzelversehen. Ring ergänzt.

**🟠 H-4 — Keine Sprungmarke, keine Fokusführung bei Routenwechsel** *(teilweise behoben)*
Tastaturnutzer mussten auf jeder Seite erst durch 9 Navigationseinträge
tabben. *Fix:* Sprungmarke „Zum Inhalt springen" als erster Tabstopp in
`AppShell.tsx`, Ziel `<main id="inhalt" tabIndex={-1}>`.
**Offen:** Bei SPA-Navigation wandert der Fokus nicht zum neuen Inhalt und der
Seitenwechsel wird Screenreadern nicht angesagt. Es gibt keinen Route-Announcer.
*Empfehlung (Phase 10):* `main`-Element bei jedem Routenwechsel fokussieren und
den Seitentitel in einer `aria-live="polite"`-Region ansagen.

**🟡 M-3 — `ThemeToggle` bildet das Radiogroup-Muster nicht vollständig ab** *(offen)*
`role="radiogroup"` mit drei `role="radio"`-Buttons, aber ohne Roving-Tabindex
und ohne Pfeiltastensteuerung. Erwartet wird: **ein** Tabstopp, Auswahl per
Pfeiltasten. Tatsächlich: drei Tabstopps, Pfeiltasten ohne Funktion. Funktional
bedienbar, entspricht aber nicht der von Screenreadern angekündigten Semantik.
*Fix-Alternative mit weniger Aufwand:* `role="group"` + `aria-pressed` verwenden
(so wie es der `YearSelector` bereits korrekt macht).

**🟡 M-4 — Upload-Fläche ist ein `<div onClick>`** *(offen)*
`RestoreSection.tsx:137` — kein `role`, kein `tabIndex`, kein `onKeyDown`.
*Entschärft* durch den direkt darunter liegenden echten Button „Datei
durchsuchen", der dieselbe Aktion auslöst; die Funktion ist also per Tastatur
erreichbar. Die Fläche selbst bleibt aber ein toter Klickbereich für
Tastaturnutzer und sollte `role="button" tabIndex={0}` plus Enter/Space bekommen.

**Positiv:** Radix übernimmt in beiden Bestätigungsdialogen Fokusfalle,
Escape-Schließen und Fokusrückgabe an das auslösende Element. Im
`DeleteDialog` ist das erste fokussierbare Element „Abbrechen", nicht „Dauerhaft
löschen" — genau richtig für eine destruktive Aktion. Die Heatmap-Zellen sind
mit `tabIndex`, `onKeyDown` (Enter/Space) und `aria-label` vollständig
tastaturbedienbar.

### 2.4 Screenreader-Unterstützung

**🟠 H-5 — Formularfehler sind nicht mit ihren Feldern verknüpft** *(offen)*
`aria-invalid` und `aria-describedby` kommen im gesamten Projekt **nur** in den
vier Auth-Seiten vor. In allen Anwendungsformularen steht die Fehlermeldung als
loses `<p className="text-sm text-negative">` neben dem Feld:

*Betroffen:* `NewPaymentPage.tsx` (5 Felder), `GoalFormDialog.tsx`,
`SecuritiesPage.tsx` (7 Felder), `DepotsPage.tsx`, `ImportWizard.tsx`,
`dialogs.tsx`.

*Wirkung:* Ein Screenreader-Nutzer, der nach einem fehlgeschlagenen Absenden zum
Feld „Nettobetrag" navigiert, hört „Nettobetrag, Eingabefeld" — die Meldung
„Bitte einen gültigen Betrag eingeben" wird nie angesagt. WCAG 3.3.1 (A) /
4.1.2 (A). Das ist der gewichtigste offene Punkt.

*Fix:* Das Muster aus `LoginPage.tsx:60-70` übernehmen — es ist bereits im
Projekt vorhanden und erprobt:
```tsx
aria-invalid={Boolean(errors.netAmount)}
aria-describedby={errors.netAmount ? "payment-net-error" : undefined}
…
<p id="payment-net-error" className="text-sm text-negative">…</p>
```
Zusätzlich: nach fehlgeschlagener Validierung den Fokus auf das erste
fehlerhafte Feld setzen.

**🟠 H-6 — Pflichtfelder sind nicht gekennzeichnet** *(offen)*
Depot, Unternehmen, Zahlungsdatum und Nettobetrag sind per Zod-Schema Pflicht,
aber weder visuell (`*`) noch programmatisch (`required` / `aria-required`)
markiert. Der Nutzer erfährt das erst nach dem Absenden. WCAG 3.3.2 (A).

**🟡 M-5 — Fortschritt bei Sicherung/Wiederherstellung war stumm** *(behoben)*
`ProgressIndicator.tsx` hatte weder `role="progressbar"` noch `aria-live`. Bei
einer minutenlangen Wiederherstellung bekam ein Screenreader-Nutzer keinerlei
Rückmeldung. `role="progressbar"` mit `aria-valuenow/min/max/label` und
`aria-live="polite"` auf der Statuszeile ergänzt.

**🟠 H-7 — Links ohne dauerhaft erkennbare Kennzeichnung** *(offen)*
```
PaymentsPage.tsx:750   <Link … className="hover:underline">{formatDate(…)}</Link>
PaymentsPage.tsx:841   <Link … className="font-medium hover:underline">
DataQualityPage.tsx:221, RankedBars.tsx:51
```
Diese Links erben `text-foreground` und sind erst **beim Hovern** unterstrichen.
Auf dem iPhone gibt es kein Hovern — dort ist nicht erkennbar, dass das
Zahlungsdatum bzw. der Unternehmensname anklickbar ist. WCAG 1.4.1 (A).
*Fix:* `text-primary` ergänzen oder dauerhaft unterstreichen.

**🟡 M-6 — `heading-order`: h1 → h3** *(offen)*
`SettingsPage` und `BackupPage` springen von der Seiten-`h1` direkt auf
`CardTitle` (`h3`). Ursache ist, dass `CardTitle` fest `h3` rendert.
Zusätzlich rendert `EmptyState` seinen Titel als `<p>` statt als Überschrift —
die 404-Seite und alle Leerzustände haben dadurch gar keine Überschrift, und die
vier Auth-Seiten haben **keine `h1`** (dort ist der Seitentitel ein `CardTitle`).
*Fix:* `CardTitle`/`EmptyState` eine `as`-Prop geben.

**Positiv:** 29 Stellen mit `aria-live` / `role="status"` / `role="alert"`;
Ladezustände melden `aria-busy` plus `sr-only`-Text; alle Icon-Buttons haben
`aria-label`; alle Tabellen nutzen `<th scope="col|row">`; Diagramme sind
`role="img"` mit `aria-label` **und** einer echten Datentabelle; die
Sparkline liest alle Werte als Text vor.

### 2.5 Weitere WCAG-Kriterien

| Kriterium | Status |
|---|---|
| 3.1.1 Sprache — `<html lang="de">` | ✅ |
| 2.3.3 Reduzierte Bewegung | ✅ global in `index.css` **und** in recharts (`useReducedMotion`) |
| 1.4.4 Textvergrößerung 200 % | ✅ keine `maximum-scale`/`user-scalable=no`; Layout in `rem`/Tailwind-Skala |
| 1.4.10 Reflow (320 px) | ✅ 1280 px @ 200 % Zoom = 640 CSS-px → mobiles Layout greift korrekt |
| 2.4.4 Linkzweck | ⚠️ Linktexte sind aussagekräftig, aber siehe H-7 |
| 2.1.2 Keine Tastaturfalle | ✅ Radix-Dialoge, Escape funktioniert |
| 1.3.1 Info und Beziehungen | ⚠️ siehe H-5, M-6 |
| 4.1.3 Statusmeldungen | ✅ nach M-5 |

---

## 3. Responsives Design — Befunde

Tailwind-Breakpoints: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.
Zuordnung zu den geforderten Testbreiten:

| Breite | Gerät | Aktiver Breakpoint | Navigation |
|---|---|---|---|
| 320 | iPhone SE | Basis | BottomNav |
| 375 | iPhone Basis | Basis | BottomNav |
| 390 | iPhone 12/13 | Basis | BottomNav |
| 430 | iPhone Pro Max | Basis | BottomNav |
| 768 | iPad Hochformat | `md` | Kompakte Icon-Sidebar (64 px) |
| 834 | iPad Pro | `md` | Kompakte Icon-Sidebar |
| 1024 | iPad quer / kleines Notebook | `lg` | Volle Sidebar (240 px) |
| 1280 | Notebook | `lg`+`xl` | Volle Sidebar |
| 1440 | Desktop | `lg`+`xl` | Volle Sidebar, Inhalt auf `max-w-6xl` zentriert |

Der Navigationsübergang ist **lückenlos**: `BottomNav` ist `md:hidden`,
`CompactSidebar` ist `md:flex lg:hidden`, `Sidebar` ist `lg:flex`. Zu keiner
Breite fehlt oder doppelt sich die Navigation.

### 3.1 Kritische Breitenprobleme

**🟠 R-1 — Backup-Tabs liefen bei 320–430 px über** *(behoben)*
`TabsList` war `grid w-full grid-cols-3`, `TabsTrigger` hat `whitespace-nowrap`.
Rechnung bei 320 px: 320 − 32 (AppShell) − 32 (eigener Wrapper) = 256 px
Innenbreite → ca. **82 px pro Spalte**. Das mobile Label
„Wiederherstellen" ist 16 Zeichen ≈ 110 px zuzüglich `px-3`. Der Text lief aus
der Spalte heraus bzw. wurde beschnitten.
*Fix:* `whitespace-normal break-words hyphens-auto`, `h-auto` auf der Liste,
`min-h-11` je Tab (erfüllt zugleich die 44-px-Zielgröße statt der vorherigen
40 px).

**🟡 R-2 — Doppelte Innenabstände auf der Sicherungsseite** *(behoben)*
`BackupPage` brachte einen eigenen `container mx-auto py-6 px-4` mit, obwohl
`AppShell` bereits `px-4 py-6 sm:px-6 lg:px-8` setzt. Bei 320 px gingen dadurch
64 px statt 32 px für Ränder verloren — 20 % der Bildschirmbreite, und ein
sichtbar anderer Seitenrand als auf jeder anderen Seite. Ebenfalls angeglichen:
`h1` war `text-3xl font-bold`, projektweit ist es `text-xl font-semibold`.

**🟡 R-3 — Dialoge lagen bei 320 px randbündig** *(behoben)*
`DialogContent` war `w-full max-w-lg` — bei 320 px exakt 320 px breit, ohne
Rand. Die Vorgabe („≤ 80 % Breite, Kontext sichtbar") war nicht erfüllt.
*Fix:* `w-[calc(100%-2rem)]` → 16 px Rand auf beiden Seiten, ab 576 px greift
weiterhin `max-w-lg`. `max-h-[90vh] overflow-y-auto` war bereits korrekt.

**🟡 R-4 — BottomNav-Labels bei 320 px** *(offen, Beobachtung)*
Fünf `flex-1`-Slots ergeben bei 320 px je 64 px. „Statistiken" (11 Zeichen) und
„Dividenden" (10 Zeichen) sind bei `text-xs` etwa 60–66 px breit und lassen sich
als Einzelwörter nicht umbrechen; `flex-1` verhindert wegen `min-width: auto`
ein Unterschreiten der Mindestwortbreite. Ein Überlauf ist hier rechnerisch
knapp und **braucht eine visuelle Bestätigung auf einem echten iPhone SE**.
*Empfehlung, falls bestätigt:* `truncate` je Label oder Kurzformen
(„Statistik", „Dividende").

### 3.2 Listenansichten

**Sehr gut:** `PaymentsPage` — die zentrale und mit Abstand meistgenutzte
Ansicht — hat ein sauberes Zwei-Wege-Layout: Tabelle mit 8 Spalten ab `md`,
darunter eine `<ul>` mit einer Karte je Eingang. Die Karte zeigt Unternehmen,
Betrag, Datum, Depot, Status und Quelle sowie vollwertige Aktionsbuttons mit
Text („Bearbeiten", „Stornieren", „Löschen") statt reiner Icons. Genau so, wie
es die Vorgabe verlangt.

**🟠 R-5 — Die übrigen Listen haben keine mobile Kartenansicht** *(offen)*
`DepotsPage` (7 Spalten), `SecuritiesPage` (10 Spalten), `ImportsPage`
(6 Spalten) rendern zu allen Breiten dieselbe Tabelle. Der `Table`-Wrapper hat
zwar `overflow-x-auto`, die Tabelle selbst aber `w-full` — sie *scrollt daher
nicht*, sondern **quetscht** ihre Spalten auf die verfügbare Breite. Bei
`SecuritiesPage` sind das 10 Spalten in 288 px, also unter 29 px pro Spalte;
jeder Zellinhalt bricht zeichenweise um, die Zeilen werden extrem hoch und
Zahlen sind kaum lesbar. *Wirkung:* mobil unbrauchbar, aber **nicht
release-blockierend** — es sind Stammdatenansichten, die typischerweise am
Desktop gepflegt werden, und die tägliche Erfassung läuft über
`PaymentsPage`/`NewPaymentPage`, die beide sauber mobil sind.
*Fix (Phase 10):* entweder `min-w-[…]` auf die Tabelle (echtes horizontales
Scrollen statt Quetschen) — das ist die Ein-Zeilen-Lösung — oder eine
Kartenansicht analog zu `PaymentsPage`.

### 3.3 Formulare

Alle Formulare stapeln korrekt: Label über Feld, Felder auf volle Breite,
`Input`/`Select`/`Textarea` durchgängig `h-11` (44 px). `type="date"` öffnet den
nativen Picker, `inputMode="decimal"` blendet auf iOS/Android das Zahlenfeld ein
— beides passend für die deutsche Kommaschreibweise.

**🟡 R-6 — Ungestufte Raster im Unternehmensdialog** *(offen)*
`SecuritiesPage.tsx:185` nutzt `grid-cols-3` **ohne** Breakpoint-Präfix für
WKN / Land / Währung. Im Dialog bleiben bei 320 px rund 272 px, abzüglich der
Abstände also **ca. 80 px pro Eingabefeld** — mit `px-3` bleiben 56 px für den
Inhalt. Nutzbar, aber beengt. Analog `grid-cols-2` für Ticker/ISIN.
*Fix:* `grid-cols-1 sm:grid-cols-3`.

**🟡 R-7 — Ausschüttungsmonate: Zielgröße 40 × 36 px** *(offen)*
`SecuritiesPage.tsx:230`, `grid-cols-6` mit `h-9`. Zwölf dicht beieinander
liegende Schaltflächen unter 44 × 44 px — genau die Konstellation, bei der
Fehlgriffe entstehen. *Fix:* `grid-cols-4 sm:grid-cols-6` und `h-11`.

**🟡 R-8 — Filterleisten belegen bei 320 px den halben Bildschirm** *(offen)*
`PaymentsPage` hat 7 Filter-Selects mit `min-w-36` (144 px). Bei 288 px
Inhaltsbreite passt nur **einer pro Zeile** → rund 530 px reine Filter-UI, bevor
der erste Eingang sichtbar wird. Dasselbe bei der Statistik-`FilterBar`
(5 Felder, `min-w-40`). Funktional korrekt, aber mobil unwirtschaftlich.
*Empfehlung:* Filter unter `md` in ein aufklappbares „Filter"-Element legen; die
aktive Filteranzahl als Badge am Auslöser.

### 3.4 Diagramme und Tabellen

`ResponsiveContainer` mit fester Höhe `h-72` funktioniert von 320 bis 1440 px.
Die Heatmap nutzt korrekt `overflow-x-auto` **mit** `min-w-[640px]` — dort ist
horizontales Scrollen gewollt und auf den Container begrenzt, die Seite selbst
scrollt nicht quer. Das ist genau das Muster, das `DepotsPage`/`SecuritiesPage`
fehlt (R-5).

`AppShell` setzt `overflow-x-hidden` auf `<main>`. Das verhindert zuverlässig
horizontales Scrollen der Seite — kaschiert aber auch Überläufe, statt sie
sichtbar zu machen. Beim visuellen Nachtest sollte man das kurz abschalten, um
verborgene Überläufe zu finden.

### 3.5 Zielgrößen (Touch)

| Element | Größe | Bewertung |
|---|---|---|
| `Button` Standard / `size="icon"` | 44 × 44 | ✅ |
| `Input` / `Select` / `Textarea` | Höhe 44 | ✅ |
| BottomNav-Einträge | ~54 × 64 | ✅ |
| `MorePage`-Zeilen | `min-h-11` | ✅ |
| CompactSidebar-Icons | 44 × 44 | ✅ |
| Backup-Tabs | 40 → **44** | ✅ behoben (R-1) |
| `Button size="sm"` (36 px) | 36 | 🟡 in Filterleisten und im `YearSelector` |
| `ThemeToggle` | 36 × 36 | 🟡 |
| Ausschüttungsmonate | 40 × 36 | 🟡 R-7 |
| Auswahl-Checkboxen | 16 × 16 | 🟠 siehe unten |

**🟠 R-9 — Auswahl-Checkboxen sind 16 × 16 px** *(offen)*
`PaymentsPage.tsx:542,742,833`, `DepotsPage.tsx:264`, `SecuritiesPage.tsx:319`,
`ImportWizard.tsx:473` verwenden rohe `<input type="checkbox" className="size-4">`.
In der mobilen Kartenansicht ist das die Checkbox für die Mehrfachauswahl —
16 px sind auf dem Touchscreen schwer zu treffen. WCAG 2.5.8 (AA, neu in 2.2)
verlangt mindestens 24 × 24 px.
*Fix:* die Checkbox in ein `<label>` mit `min-h-11 min-w-11` und zentrierter Box
einfassen — das vergrößert die Trefferfläche, ohne die Optik zu ändern, und
verbessert zugleich die Beschriftung.

`YearSelector` trägt im Kommentar „Touch-freundlich (44 px Zielgröße)", verwendet
aber `size="sm"` (36 px). Kommentar und Code widersprechen sich.

### 3.6 Typografie und deutscher Text

Grundschriftgröße 16 px, Umlaute und ß sind durchgehend korrekt (UTF-8,
`charset` gesetzt). `tabular-nums` global für saubere Betragsspalten — gute
Entscheidung. Fließtextlänge ist über `max-w-6xl`, `max-w-md` und `max-w-prose`
begrenzt.

**🟢 L-1** `truncate` ohne `title` in `GoalCard.tsx:54` und `RankedBars.tsx:51`:
abgeschnittene Unternehmensnamen sind nicht vollständig abrufbar (bei 200 %
Zoom trifft das zusätzlichen Text). `RecentPayments.tsx:42` macht es mit
`title={security?.name}` richtig.

**🟢 L-2** In den Zahlungstabellen und -karten gibt es weder `truncate` noch
`break-words` für Unternehmensnamen; ein sehr langer Name ohne Leerzeichen
könnte die Spaltenbreite sprengen.

---

## 4. Zusammenfassung nach Schweregrad

| ID | Schwere | Bereich | Befund | Status |
|---|---|---|---|---|
| K-1 | 🔴 | Farbe | Badge „Storniert" 1,29:1 im Dark Mode | **behoben** |
| K-2 | 🔴 | Farbe | `Alert variant="destructive"` ohne Fehlerfarbe (Token existiert nicht) | **behoben** |
| H-1 | 🟠 | Farbe | `text-warning` 2,95:1 (hell) | **behoben** |
| H-2 | 🟠 | Farbe | Graustufen ohne Dark-Variante, 3,49:1 / 2,74:1 | **behoben** |
| H-3 | 🟠 | Tastatur | Erfassen-Aktion ohne Fokusindikator | **behoben** |
| H-4 | 🟠 | Tastatur | Keine Sprungmarke / keine Fokusführung bei Routenwechsel | teilw. behoben |
| H-5 | 🟠 | Screenreader | Formularfehler nicht mit Feldern verknüpft (8 Formulare) | offen |
| H-6 | 🟠 | Formulare | Pflichtfelder nicht gekennzeichnet | offen |
| H-7 | 🟠 | Farbe | Links nur beim Hovern erkennbar | offen |
| R-1 | 🟠 | Responsiv | Backup-Tabs liefen bei 320–430 px über | **behoben** |
| R-5 | 🟠 | Responsiv | Depots/Unternehmen/Importe ohne mobile Ansicht | offen |
| R-9 | 🟠 | Touch | Auswahl-Checkboxen 16 × 16 px | offen |
| M-1 | 🟡 | Farbe | Eingabefeld-Rahmen 1,41:1 | offen |
| M-2 | 🟡 | Farbe | Diagrammfarben luminanzgleich | offen |
| M-3 | 🟡 | Tastatur | `ThemeToggle` unvollständiges Radiogroup-Muster | offen |
| M-4 | 🟡 | Tastatur | Upload-Fläche ist `div onClick` | offen |
| M-5 | 🟡 | Screenreader | Fortschritt ohne `role="progressbar"` | **behoben** |
| M-6 | 🟡 | Struktur | `heading-order` h1→h3, fehlende `h1` auf Auth-/404-Seiten | offen |
| R-2 | 🟡 | Responsiv | Doppelte Innenabstände Sicherungsseite | **behoben** |
| R-3 | 🟡 | Responsiv | Dialoge randbündig bei 320 px | **behoben** |
| R-4 | 🟡 | Responsiv | BottomNav-Labels bei 320 px (Sichtprüfung nötig) | offen |
| R-6 | 🟡 | Responsiv | `grid-cols-3` ohne Breakpoint im Unternehmensdialog | offen |
| R-7 | 🟡 | Touch | Ausschüttungsmonate 40 × 36 px | offen |
| R-8 | 🟡 | Responsiv | Filterleisten belegen mobil ~530 px | offen |
| L-1/L-2 | 🟢 | Typografie | `truncate` ohne `title`, kein `break-words` | offen |

---

## 5. Angewandte Korrekturen

13 Dateien, alle klein und rückwirkungsarm. **373/373 Tests grün, TypeScript,
ESLint und Prettier sauber, Production-Build erfolgreich.** Ein zweiter
axe-Lauf nach den Änderungen zeigt keine Regressionen.

| Datei | Änderung |
|---|---|
| `src/styles/index.css` | Neues Token `--warning-strong` (hell/dunkel) + Tailwind-Mapping |
| `src/components/ui/badge.tsx` | `warning`-Variante auf `text-warning-strong` (1,29:1 → 8,84:1 dunkel) |
| `src/components/ui/alert.tsx` | `destructive` von nicht existierendem `--destructive` auf `--negative` |
| `src/components/ui/dialog.tsx` | `w-[calc(100%-2rem)]` — Rand auf schmalen Viewports |
| `src/components/layout/BottomNav.tsx` | Fokusring auf der zentralen Erfassen-Aktion |
| `src/app/AppShell.tsx` | Sprungmarke „Zum Inhalt springen", `<main id="inhalt" tabIndex={-1}>` |
| `src/components/backup/ProgressIndicator.tsx` | `role="progressbar"` + `aria-live`, Tokens statt Graustufen |
| `src/features/backup/BackupPage.tsx` | Doppelte Abstände entfernt, Tabs umbruchfähig, `min-h-11`, `h1` angeglichen |
| `src/features/backup/RestoreSection.tsx` | 6 × Graustufen → `text-muted-foreground` |
| `src/components/backup/ConflictResolver.tsx` | Graustufe → `text-muted-foreground` |
| `src/features/payments/NewPaymentPage.tsx` | Konflikthinweis → `text-warning-strong` |
| `src/features/payments/PaymentDetailPage.tsx` | Änderungsmarkierung → `text-warning-strong` |
| `src/features/imports/ImportWizard.tsx` | Warnsymbol → `text-warning-strong` |

---

## 6. Empfehlungen

**Vor dem Release (klein, hoher Nutzen)**
1. **H-5** — `aria-invalid` / `aria-describedby` in den 8 Anwendungsformularen
   nachziehen. Das Muster steht fertig in `LoginPage.tsx`. Der wichtigste
   offene Punkt; Aufwand pro Feld zwei Zeilen.
2. **H-7** — `text-primary` auf die vier Links ergänzen, die nur beim Hovern
   erkennbar sind. Vier Zeilen.
3. **R-5** — `min-w-[900px]` auf die Tabellen in `DepotsPage`/`SecuritiesPage`/
   `ImportsPage`. Eine Zeile pro Datei; macht aus „gequetscht und unlesbar" ein
   sauberes horizontales Scrollen wie bei der Heatmap.
4. **R-4** — BottomNav bei 320 px auf einem echten iPhone SE nachsehen.

**Phase 10**
5. **H-6** Pflichtfelder kennzeichnen · **R-9** Checkboxen auf 44 px Trefferfläche
6. **M-6** `as`-Prop für `CardTitle`/`EmptyState`, `h1` auf Auth- und 404-Seiten
7. **H-4** Fokusführung und Ansage bei SPA-Routenwechsel
8. **M-1** `--input` abdunkeln (WCAG 1.4.11) · **M-2** Diagrammluminanzen spreizen
9. **R-8** Filter unter `md` einklappen · **R-6/R-7** Raster stufen
10. **M-3** `ThemeToggle` auf `role="group"` + `aria-pressed` umstellen ·
    **M-4** Upload-Fläche tastaturbedienbar machen

**Strukturell**
Den Backup-/Export-Bereich auf das Design-System zurückführen. Es sind noch rund
45 fest verdrahtete Palettenfarben in 6 Dateien übrig (die kontrastkritischen
sind behoben). Sie sind die Ursache dafür, dass genau dieser Bereich alle
Dark-Mode-Fehler, den einzigen Layout-Überlauf und die abweichende Typografie
gestellt hat. Eine ESLint-Regel gegen `(text|bg|border)-(gray|blue|green|red|yellow)-\d`
würde einen Rückfall dauerhaft verhindern — analog zur bereits vorhandenen
Absicherung der Geldschicht.

---

## 7. Release-Bewertung

**Freigabeempfehlung: RELEASE MÖGLICH.**

Die beiden Blocker waren K-1 (stornierte Eingänge im Dark Mode nicht
erkennbar — eine Falschdarstellung fachlich relevanter Daten) und K-2
(Fehlermeldungen ohne Fehlerfarbe im Datensicherungsbereich). Beide sind
behoben und im Build verifiziert.

**Verbleibendes Risiko: gering und klar abgegrenzt.**

- Der schwerste offene Punkt (H-5) betrifft ausschließlich
  Screenreader-Nutzer beim *Korrigieren* fehlerhafter Eingaben. Die Fehler
  werden visuell korrekt angezeigt, die Validierung greift, es entstehen keine
  falschen Daten. Für eine private Einzelnutzer-Anwendung ist das vertretbar —
  es sollte aber zeitnah nachgezogen werden, weil es ein Level-A-Kriterium ist.
- R-5 macht drei Stammdatenansichten mobil unkomfortabel. Die
  geschäftskritischen Pfade — Dividende erfassen, Liste durchsehen, Dashboard,
  Statistik — sind mobil vollständig und gut umgesetzt.
- Kein offener Punkt führt zu Datenverlust, Fehlberechnung oder einer
  Fehldarstellung von Beträgen.

**Einschränkung dieser Prüfung, ausdrücklich benannt:** In dieser Umgebung stand
kein Browser zur Verfügung. Kontraste wurden analytisch aus den Tokens berechnet
(genauer als eine Stichprobe), die Struktur mit axe-core gegen die echten
Komponenten geprüft (19 Ansichten), die Breakpoints statisch aus den
Tailwind-Klassen abgeleitet. **Nicht** durchgeführt wurden: visuelle Sichtprüfung
an den 9 Breiten, Test mit VoiceOver/NVDA, Lighthouse-Lauf und Messung der
Ladezeit auf 4G. Vor dem Release empfohlen: ein Durchgang mit dem echten Gerät
über die vier Hauptansichten bei 320 px und 1440 px sowie ein
Lighthouse-Accessibility-Lauf gegen das Deployment.

---

*Reproduktion des automatisierten Laufs: `npm i axe-core --no-save`, danach die
Komponenten mit `@testing-library/react` rendern und `axe.run(container)` unter
der bestehenden vitest-jsdom-Konfiguration ausführen. Die Kontrastberechnung
erfolgte direkt aus den OKLCH-Werten in `src/styles/index.css`.*
