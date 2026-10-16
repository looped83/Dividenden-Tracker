/**
 * Breite des Testfensters fuer Komponenten, die zwischen Telefon- und
 * Tabletdarstellung umschalten (`useMediaQuery`). jsdom kennt kein Layout; die
 * Grundeinstellung aus `tests/setup.ts` antwortet auf jede Abfrage mit „nein"
 * und liefert damit die Telefonfassung.
 *
 * `useMediaQuery` liest `matchMedia` bei jedem Rendern — ein Austausch vor
 * `render` genuegt.
 */
export function setViewportWide(matches: boolean): void {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
