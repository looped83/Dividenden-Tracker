import type { CSSProperties } from "react";

/**
 * Platz eines Balkens in einer Rangliste: versetzt sein Wachsen beim ersten
 * Aufruf (`.bar-grow` in index.css). Gilt fuer alle Balken darunter.
 */
export function barIndex(index: number): CSSProperties {
  return { "--bar-index": index } as CSSProperties;
}
