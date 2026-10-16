import "@testing-library/jest-dom/vitest";

// jsdom implementiert `matchMedia` nicht; recharts und `useMediaQuery` fragen es
// aber ab. Minimaler No-Op-Stub: Jede Abfrage antwortet mit „nein" — die
// Telefonfassung (siehe tests/unit/support/viewport.ts).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// Ebenso fehlt `scrollIntoView` (TabNav rueckt den aktiven Reiter in Sicht).
// jsdom kennt kein Layout, es gibt also nichts zu scrollen.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = () => undefined;
}

// Ebenso `ResizeObserver` (das Diagramm im Kopf der Uebersicht misst seine
// Breite). Ohne Layout gibt es nichts zu messen: Der Stub meldet nie eine
// Groesse, das Diagramm bleibt ungezeichnet — bedienbar ist es trotzdem.
if (typeof window !== "undefined" && typeof window.ResizeObserver !== "function") {
  window.ResizeObserver = class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  };
}
