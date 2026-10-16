# Mobile-Audit – Dividenden-Tracker

**Stand:** 2026-07-27 (zweiter Durchgang, ersetzt den ersten Report vollständig)

## Warum ein zweiter Durchgang

Der erste Audit war eine reine Code-Durchsicht. Sein Report führte
dennoch eine Tabelle „Getestete Viewports" mit sechs abgehakten
Auflösungen sowie eine Zeile „Kein ungewolltes horizontales
Body-Scrolling ✅". Beides war nicht durch Messungen gedeckt — es wurde
nie ein Browser gestartet. Tatsächlich scrollte die Statistik-Übersicht
auf **allen** geprüften Breiten horizontal.

Dieser Durchgang misst stattdessen im echten Browser.

## Vorgehen

Die reale App läuft in Chromium (Playwright) gegen einen gemockten
Supabase-Endpunkt; die Session wird in `localStorage` injiziert, die
REST-Antworten liefern Fixtures nach den Row-Typen aus
`src/lib/supabase/database.types.ts` — mit bewusst unbequemen Daten:
sehr lange Firmennamen, sechsstellige Beträge, 74 Zahlungen über 6 Jahre.

Gemessen wird pro Route und Viewport am gerenderten DOM
(`getBoundingClientRect`, `scrollWidth`), nicht anhand von Klassennamen:

- horizontales Scrollen des Dokuments
- Elemente, die über den rechten Viewportrand hinausragen, ohne in einem
  scrollbaren Container zu liegen (= unerreichbar)
- interaktive Elemente unter der Mindest-Touch-Zielgröße
- horizontal abgeschnittener Text ohne `text-overflow: ellipsis`
- JavaScript-Fehler

**Abdeckung:** 20 Routen × 4 Viewports (320, 375, 390, 430 px) = 80
Messungen, jeweils mit Screenshot. Alle 20 Routen rendern mit Daten.

## Ergebnis

| Messgröße | vorher | nachher |
|---|---:|---:|
| Seiten mit horizontalem Body-Scroll | 4 | **0** |
| Unerreichbare, überstehende Elemente | 50 | **0** |
| Touch-Ziele unter 44 px | 238 | **57** |
| JavaScript-Fehler | 0 | 0 |

## Behobene Defekte

### 1. Statistik-Übersicht scrollte horizontal (kritisch)

Auf allen Breiten, bis zu **+195 px** bei 320 px.

Ursache war nicht die Heatmap-Tabelle, sondern ein
`<span class="sr-only">` in den Heatmap-Zellen: `sr-only` setzt
`position: absolute`, und ohne positionierten Vorfahren entkam das Span
dem `overflow-x-auto` des Wrappers und weitete das Dokument um 125 px.
Die fixierte Bottom-Navigation (`inset-x-0`) spannte dann mit — sie war
Symptom, nicht Ursache.

Der erste Audit hatte hier `min-w-[640px]` von der Tabelle entfernt; das
war wirkungslos, weil es nie die Ursache war.

*Fix:* `relative` auf die Zelle (`charts.tsx`), damit das Span
eingefangen wird. Screenreader-Ausgabe unverändert.

### 2. Aktionsbuttons ragten aus dem Viewport (kritisch)

`flex justify-between` ohne Umbruch: Titel + Aktionen passten nicht
nebeneinander. Da `main` `overflow-x-hidden` hat, wurden die Buttons
abgeschnitten statt scrollbar — sie waren **nicht bedienbar**.

Auf *Unternehmen* betraf das „Aus Excel importieren" und „Neues
Unternehmen" auf **allen vier** Breiten, auch 430 px: Ein Unternehmen
liess sich auf dem Smartphone nicht anlegen.

*Fix:* `flex-wrap` + `gap` in Unternehmen, Depots, Dividenden, Importe
und im Diagrammkopf des Dashboards.

### 3. Zu kleine Touch-Ziele

- **Sortier-Buttons der Statistik-Tabellen: 16 px hoch.** Die `<th>` ist
  bereits 44 px; der Button füllte sie nur nicht aus. `h-full min-h-11`
  → 44 px ohne jede visuelle Änderung.
- **`size="sm"`-Buttons (36 px):** wachsen über `pointer-coarse:min-h-11`
  auf Touchgeräten auf 44 px. Mit Maus bleibt die dichtere Darstellung.
- **Theme-Umschalter (36 px), Jahres-Auswahl (36 px), Auswahl-Checkboxen
  (16 px), Login-Link „Passwort vergessen?" (20 px):** analog erhöht.
- **Checkbox-Labels** in Unternehmen/Depots auf `min-h-11` — effektives
  Tap-Ziel jetzt 168 × 44 px (nachgemessen).

### 4. Überlanges Button-Label (Ziel-Detail)

Buttons sind global `whitespace-nowrap`; „Dividendeneingänge des
Zeitraums anzeigen" stand deshalb über. *Fix:* Für diesen Button
Umbruch erlaubt bei erhaltener Mindesthöhe von 44 px.

### 5. Datumsfeld auf iOS höher und breiter als die übrigen Felder

Nachgetragen nach einem Screenshot von echter iOS-Hardware. In Chromium
maßen alle Felder des Formulars „Neue Dividende" exakt gleich
(358 × 44 px bei 390 px Viewport); **auf iOS Safari war das Datumsfeld
sichtbar höher und lief rechts aus dem Container.**

Ursache ist die native Darstellung von `input[type="date"]`: iOS leitet
eine eigene intrinsische Größe ab, und das Wert-Pseudoelement
`::-webkit-date-and-time-value` bringt eigene Abstände und Zeilenhöhe
mit. `width: 100%` allein greift dagegen nicht.

*Fix:* global im Base-Layer `appearance: none` plus Zurücksetzen des
Wert-Pseudoelements (`margin`, `padding`, `min-height`, `line-height`).
In Chromium unverändert 358 × 44 px inklusive Kalendersymbol, hell und
dunkel geprüft.

**Lehre für dieses Harness:** Chromium unter Linux findet keine
Engine-spezifischen Defekte von iOS Safari. Formularfelder mit nativer
Darstellung — `date`, `time`, `select`, `file` — sind der wahrscheinlichste
Ort für weitere solche Abweichungen und sollten auf echter Hardware
gegengeprüft werden.

## Bekannte, bewusst offene Punkte

Die verbleibenden 57 Touch-Befunde liegen alle bei **24–36 px**. Sie
erfüllen damit WCAG 2.5.8 (AA, 24 × 24 px), nicht aber die 44 px aus
WCAG 2.5.5 (AAA) bzw. den Apple-HIG:

- Heatmap-Zellen (36 px) — 12 Monatsspalten × 44 px passen auf keinen
  Smartphone-Viewport; eine Vergrößerung würde die Jahresübersicht als
  Ganzes zerstören.
- Ziel- und Unternehmens-Links in Listen (24 px).
- Zeilen-Auswahl-Checkboxen (24 px auf Touch).

Weiterhin offen, nicht in diesem Durchgang angefasst:

- **Unternehmen/Depots haben keine mobile Kartenansicht.** Die Tabellen
  scrollen horizontal (eingefasst, kein Body-Scroll). *Dividenden* hat
  bereits eine Kartenansicht; für die anderen wäre das der nächste
  sinnvolle Schritt.
- **Querformat** wurde nicht gemessen (nur Hochformat).
- **Dunkelmodus** wurde nicht separat gemessen.
- **Kein Test auf echter Hardware** — Chromium unter Linux, nicht iOS
  Safari. Die eingesetzten Mechanismen (`pointer: coarse`,
  Safe-Area-Insets) sollten dort greifen, gemessen ist es nicht. Wie
  Defekt 5 zeigt, ist diese Lücke nicht theoretisch: Sie hat einen real
  sichtbaren Fehler durchgelassen.

## Reproduktion

Das Harness liegt bewusst ausserhalb des Repositories (keine neue
Projekt-Abhängigkeit). Es startet den Vite-Dev-Server mit
Platzhalter-Env, injiziert Session und Fixtures und schreibt
`report.json` plus 80 Screenshots.
