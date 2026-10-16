export interface ChartLegendItem {
  /** Beschriftung der Reihe, z. B. „2026". */
  label: string;
  /** CSS-Farbe der Reihe, z. B. `var(--chart-1)`. */
  color: string;
  /** Gestrichelt dargestellte Reihe (Vergleichslinie). */
  dashed?: boolean;
}

/**
 * Legende fuer die Diagramme — eine Darstellung fuer alle.
 *
 * Recharts bringt eine eigene Legende mit, die aber im Diagramm sitzt: Sie
 * nimmt Zeichenflaeche weg, uebernimmt die Schrift des SVG statt der der
 * Anwendung und laesst sich nicht mit derselben Farbmarke beschriften. Als
 * eigenes Element darunter ist sie ueberall gleich, mittig gesetzt und Teil
 * des Textflusses.
 *
 * Die Marke traegt **zusaetzlich** zur Farbe eine Beschriftung, und die
 * Vergleichsreihe ist gestrichelt: Farbe allein traegt die Unterscheidung
 * nicht (WCAG 1.4.1).
 */
export function ChartLegend({ items }: { items: readonly ChartLegendItem[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-0.5 w-6 shrink-0 rounded-full"
            style={
              item.dashed
                ? {
                    backgroundImage: `repeating-linear-gradient(to right, ${item.color} 0 6px, transparent 6px 10px)`,
                  }
                : { backgroundColor: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
