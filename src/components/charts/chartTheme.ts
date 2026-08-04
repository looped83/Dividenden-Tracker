/**
 * Gemeinsame Grundlage aller Diagramme (UX_AND_DESIGN_SYSTEM.md §1).
 *
 * Achsen, Raster, Tooltip-Kasten, Hoehe und Leerzustand standen zuvor in jeder
 * Diagrammdatei einzeln — vier Mal fast, aber eben nicht ganz dasselbe: Der
 * Tooltip des Vergleichs lag auf `bg-popover`, die uebrigen auf `bg-card`, nur
 * einer setzte `tabular-nums`. Wer eine Kleinigkeit aenderte, aenderte sie an
 * drei Stellen nicht mit.
 *
 * Recharts liest die **Typen** seiner Kinder (`XAxis`, `YAxis`, `Bar` …), um
 * das Diagramm zu bauen. Eigene Wrapper-Komponenten dafuer waeren fuer Recharts
 * unbekannte Elemente und wuerden schlicht ignoriert; die gemeinsamen
 * Einstellungen sind deshalb Objekte zum Ausbreiten, keine Komponenten.
 */

const groupedFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat("de-DE", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Achsenbeschriftung eines Geldbetrags.
 *
 * **Ohne Waehrungszeichen und mit Tausenderpunkt.** Zuvor stand an jedem Strich
 * ein „€", und die kompakte Schreibweise sprang mitten in der Achse um: Im
 * Deutschen kuerzt sie erst ab einer Million, sodass „4500 €" (ohne Punkt)
 * ueber „13.500 €" (mit Punkt) stand. Beide zusammen wurden zudem breiter als
 * die reservierte Achsenspalte und brachen auf zwei Zeilen um — auf dem Telefon
 * hing die oberste Beschriftung dadurch halb ueber dem Kachelrand. Die Waehrung
 * nennen Titel, Tooltip und Datentabelle; auf der Achse zaehlt die
 * Groessenordnung.
 */
export function formatAxisTick(value: number): string {
  return Math.abs(value) >= 1_000_000
    ? compactFormatter.format(value)
    : groupedFormatter.format(value);
}

/** `left: 0` — die Achsenspalte traegt den Abstand bereits selbst. */
export const CHART_MARGIN = { top: 8, right: 8, bottom: 4, left: 0 } as const;

export const CHART_GRID_PROPS = {
  strokeDasharray: "3 3",
  vertical: false,
  stroke: "var(--border)",
} as const;

export const CHART_X_AXIS_PROPS = {
  tick: { fontSize: 12 },
  tickMargin: 8,
  stroke: "var(--muted-foreground)",
} as const;

/**
 * `width: 56` statt 64. Die Spalte muss die laengste Beschriftung **ganz**
 * fassen: Bei 44px schnitt Recharts „18.000" am linken Rand zu „8.000" ab —
 * eine falsche Zahl, nicht nur ein Schoenheitsfehler. 56px tragen sechs
 * Ziffern samt Tausenderpunkt und die kompakte Millionenform („1,5 Mio.").
 */
export const CHART_Y_AXIS_PROPS = {
  tickFormatter: formatAxisTick,
  tick: { fontSize: 12 },
  tickMargin: 4,
  width: 56,
  stroke: "var(--muted-foreground)",
} as const;

export const CHART_BAR_CURSOR = { fill: "var(--muted)" } as const;
export const CHART_LINE_CURSOR = {
  stroke: "var(--muted-foreground)",
  strokeDasharray: "3 3",
} as const;

/** Radius der Balkenoberkante — ueberall derselbe. */
export const CHART_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
