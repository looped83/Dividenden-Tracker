/*
 * Service Worker — nur die App-Huelle, niemals Daten.
 *
 * Zwischengespeichert werden ausschliesslich eigene, statische Dateien
 * (Dokument, JS, CSS, Icons). Anfragen an Supabase laufen ueber eine fremde
 * Herkunft und werden hier gar nicht angefasst: Finanzdaten und Sitzungen
 * gehoeren nicht in einen Cache, den ein geteiltes Geraet ueberlebt
 * (SECURITY_MODEL.md).
 *
 * Fassungen: Der Build setzt unten die Kennung der Fassung und die Dateien
 * des Startpakets ein (src/lib/config/serviceWorkerBuild.ts). Jede Fassung hat
 * ihren eigenen Cache und legt bei der Installation Dokument und Startpaket
 * darin ab — sie ist damit vollstaendig, auch offline, bevor sie uebernimmt.
 * Beim Uebernehmen verschwinden die Caches frueherer Fassungen.
 *
 * Strategien:
 * - Navigation (das eine Dokument des Hash-Routers): erst Netz, dann Cache.
 *   So kommt eine neue Fassung sofort an, und offline erscheint trotzdem die
 *   Huelle dieser Fassung statt der Fehlerseite des Browsers.
 * - Statische Dateien: erst Cache, dann Netz. Ihre Namen tragen einen Hash,
 *   eine veraltete Antwort kann es also nicht geben.
 */
const BUILD_ID = "__BUILD_ID__";
const PRECACHE = ["__PRECACHE__"];

// Nur Caches mit diesem Praefix gehoeren dieser Anwendung. Auf GitHub Pages
// teilen sich alle Projektseiten eines Kontos eine Herkunft und damit einen
// Cache-Speicher — fremde Caches bleiben unangetastet.
const CACHE_PREFIX = "dividend-tracker-shell-";
const CACHE = CACHE_PREFIX + BUILD_ID;
const ASSET_PATTERN = /\.(?:js|css|png|svg|ico|webmanifest|woff2?)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Die Dateien des Startpakets tragen Hashes und kommen meist direkt aus
      // dem HTTP-Cache des Browsers — die Seite hat sie gerade erst geladen.
      await cache.addAll([new Request("./", { cache: "reload" }), ...PRECACHE]);
      // Kein `skipWaiting()` an dieser Stelle: Laeuft bereits eine Fassung,
      // entscheidet die Seite (UpdatePrompt), wann gewechselt wird. Nur wenn
      // noch keine laeuft, uebernimmt diese sofort — da gibt es nichts zu
      // unterbrechen.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // Der Wechsel auf diese Fassung wird von der Seite ausgeloest.
  if (event.data === "SKIP_WAITING") {
    void self.skipWaiting();
    return;
  }
  // Die Seite fragt, welche Fassung hier wartet: Ist es ihre eigene, wird
  // still gewechselt, sonst weist sie auf die neue Fassung hin.
  if (event.data === "BUILD_ID") event.ports[0]?.postMessage(BUILD_ID);
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          // Offline: das Dokument dieser Fassung — sein Startpaket liegt im
          // selben Cache.
          const cached = await caches.match("./", { cacheName: CACHE });
          if (cached) return cached;
          throw new Error("Offline und keine gespeicherte Huelle vorhanden.");
        }
      })(),
    );
    return;
  }

  if (!ASSET_PATTERN.test(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { cacheName: CACHE });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
