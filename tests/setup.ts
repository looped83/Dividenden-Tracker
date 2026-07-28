import "@testing-library/jest-dom/vitest";

// jsdom implementiert `matchMedia` nicht; Diagramm-/Reduced-Motion-Logik
// (recharts, useReducedMotion) fragt es aber ab. Minimaler No-Op-Stub.
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
