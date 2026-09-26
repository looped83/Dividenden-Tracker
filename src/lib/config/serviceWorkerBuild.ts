/**
 * Fassungsangaben fuer den Service Worker.
 *
 * `public/sw.js` ist eine Vorlage mit zwei Platzhaltern, die der Build
 * (`vite.config.ts`) aus der erzeugten `index.html` fuellt:
 *
 * - **Kennung der Fassung** — der Dateiname des Einstiegs-Bundles. Er traegt
 *   einen Inhalts-Hash und aendert sich mit jeder Code-Aenderung, auch einer in
 *   nachgeladenen Teilen (deren Namen stehen im Einstieg). Damit ist `sw.js`
 *   nach jedem Deploy ein anderes Byte-Muster, und erst das laesst den Browser
 *   eine neue Fassung ueberhaupt bemerken. Vorher war `sw.js` seit seiner
 *   Einfuehrung unveraendert: Der Hinweis auf eine neue Fassung erschien nie,
 *   und der eine Cache sammelte die Dateien aller Deploys an.
 * - **Startpaket** — Skripte und Stylesheet, die `index.html` laedt. Die neue
 *   Fassung legt sie bei der Installation ab und ist damit auch offline
 *   vollstaendig, bevor sie uebernimmt.
 *
 * Abhaengigkeitsfrei und ohne `@/`-Alias, weil `vite.config.ts` es importiert
 * (wie `requiredEnv.ts`). Die App nutzt {@link buildIdOf}, um ihre eigene
 * Fassung auf dieselbe Weise zu bestimmen.
 */

export const BUILD_ID_PLACEHOLDER = '"__BUILD_ID__"';
export const PRECACHE_PLACEHOLDER = '["__PRECACHE__"]';

/** Kennung einer Fassung: Dateiname des Einstiegs-Bundles (mit Inhalts-Hash). */
export function buildIdOf(entryPath: string): string {
  return entryPath.slice(entryPath.lastIndexOf("/") + 1);
}

/** Setzt Kennung und Startpaket aus der gebauten `index.html` in die Vorlage ein. */
export function injectServiceWorkerBuild(template: string, indexHtml: string): string {
  const entry = /<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/.exec(indexHtml)?.[1];
  if (!entry) {
    throw new Error("Service Worker: kein Einstiegsskript in index.html gefunden.");
  }
  if (
    !template.includes(BUILD_ID_PLACEHOLDER) ||
    !template.includes(PRECACHE_PLACEHOLDER)
  ) {
    throw new Error("Service Worker: Platzhalter in public/sw.js fehlen.");
  }

  const assets = [
    ...new Set(
      Array.from(
        indexHtml.matchAll(/\b(?:src|href)="([^"]+\.(?:js|css))"/g),
        (match) => match[1],
      ),
    ),
  ];

  return template
    .replace(BUILD_ID_PLACEHOLDER, JSON.stringify(buildIdOf(entry)))
    .replace(PRECACHE_PLACEHOLDER, JSON.stringify(assets));
}
